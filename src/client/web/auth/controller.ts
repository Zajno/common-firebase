import {
    IAuthController,
    AuthUser,
    AuthUserWithProviders,
    AuthProviders,
    MagicLinkRequestReasons,
    AuthResult,
    AuthErrors,
    AuthUserUpdate,
} from '../../abstractions/auth';
import { makeObservable, observable, runInAction } from 'mobx';
import { createLogger } from '@zajno/common/logger';
import { Event } from '@zajno/common/observing/event';
import { transferFields } from '@zajno/common/fields/transfer';
import { prepareEmail } from '@zajno/common/validation/emails';
import { IStorage } from '@zajno/common/storage/abstractions';
import { Disposable } from '@zajno/common/functions/disposer';
import { FlagModel } from '@zajno/common-mobx/viewModels';
import { LoadingModel } from '@zajno/common-mobx/viewModels/LoadingModel';
import {
    createUserWithEmailAndPassword,
    EmailAuthProvider,
    fetchSignInMethodsForEmail,
    GoogleAuthProvider,
    isSignInWithEmailLink,
    onAuthStateChanged,
    sendSignInLinkToEmail,
    signInWithEmailAndPassword,
    signInWithEmailLink,
    updatePassword,
    reauthenticateWithCredential,
    linkWithCredential,
    User,
    signInWithPopup,
    signOut,
    updateProfile,
} from 'firebase/auth';
import { Auth } from './instance';

export { IAuthController };

export const logger = createLogger('[Auth]');

const AuthProviderIdKey = 'auth:providerid';
const UserSignInEmailStorageKey = 'auth:signin:email';
const MagicLinkReasonKey = 'auth:signin:reason';
const PasswordResetRequestedKey = 'auth:passwordreset';

export default abstract class AuthControllerBase<TUser extends AuthUser = AuthUser> extends Disposable implements IAuthController {
    private _authUser: AuthUserWithProviders<TUser> = null;

    public readonly _initializing = new LoadingModel(true);

    private _nextProvider: AuthProviders = null;
    private readonly _magicLinkSucceeded = new Event<MagicLinkRequestReasons>();

    private readonly _setPasswordMode = new FlagModel(false);

    private readonly _onSignOut = new Event();
    private readonly _onPreProcessUser = new Event<AuthUserWithProviders<TUser>>();

    constructor(forceInitialize = false) {
        super();

        makeObservable<AuthControllerBase<any>, '_authUser'>(this, {
            _authUser: observable,
        });

        const initialize = () => this._initializing.useLoading(this.processAuthUser.bind(this));
        this.disposer.add(
            onAuthStateChanged(Auth.value, initialize),
        );

        if (forceInitialize) {
            initialize();
        }
    }

    get authUser(): Readonly<AuthUserWithProviders<TUser>> { return this._authUser; }
    get initializing() { return this._initializing.isLoading; }
    get magicLinkSucceeded() { return this._magicLinkSucceeded.expose(); }

    get setPasswordMode() { return this._setPasswordMode.value; }
    get needsCreatePassword(): boolean | null {
        if (!this.authUser || !this.authUser.providers || !this.authUser.currentProvider
            || this.authUser.currentProvider === AuthProviders.Google
            || this.authUser.currentProvider === AuthProviders.DevLogin) {
            return null;
        }

        return !this.authUser.providers.includes(AuthProviders.EmailAndPassword);
    }

    get onPreProcessUser() { return this._onPreProcessUser.expose(); }
    get onSignOut() { return this._onSignOut.expose(); }

    get appleSignInSupported() { return false; }

    abstract get locationUrl(): string;

    protected abstract get Storage(): IStorage;

    get logger() { return logger; }

    protected async processAuthUser() {
        const authUser = Auth.value.currentUser;

        let provider: AuthProviders;
        if (!authUser) {
            provider = null;
        } else if (this._nextProvider) {
            provider = this._nextProvider;
            this._nextProvider = null;
            await this.Storage.setValue(AuthProviderIdKey, provider);
        } else {
            provider = (await this.Storage.getValue(AuthProviderIdKey) || '') as AuthProviders;
        }

        const justSignedIn = !this._authUser && authUser;

        const result = this.createAuthUser(authUser) as AuthUserWithProviders<TUser>;

        logger.log('Initializing with user:', result?.email, '; provider =', provider, '; uid =', result?.uid);

        if (result) {
            const methods = result.email && await this.getEmailAuthMethod(result.email);

            result.providers = methods || [];
            result.currentProvider = provider;
        }

        await this._onPreProcessUser.triggerAsync(result);

        runInAction(() => this._authUser = result);

        if (justSignedIn) {
            const createPassword = this.needsCreatePassword;
            const resetPassword = provider === AuthProviders.EmailLink && (await this.Storage.getValue(PasswordResetRequestedKey)) === 'true';
            if (createPassword || resetPassword) {
                logger.log('Setting _setPasswordMode = true createPassword =', createPassword, 'resetPassword =', resetPassword);
                this._setPasswordMode.setTrue();
            }
        }
    }

    protected createAuthUser(fbuser: User): TUser {
        if (!fbuser) {
            return null;
        }

        const result: AuthUser = {
            uid: fbuser.uid,
            displayName: fbuser.displayName,
            email: fbuser.email,
            emailVerified: fbuser.emailVerified,
            phoneNumber: fbuser.phoneNumber,
            photoURL: fbuser.photoURL,
        };

        return result as TUser;
    }

    protected forceEnableSetPasswordMode() {
        this._setPasswordMode.setTrue();
    }

    public skipPasswordMode(): void {
        this._setPasswordMode.setFalse();
        this.Storage.remove(PasswordResetRequestedKey);
    }

    protected setNextProvider(p: AuthProviders) {
        logger.log('next provider =>', p);
        this._nextProvider = p;
    }

    protected convertAuthMethods(methods: string[]): AuthProviders[] {
        return (methods || []).map(m => {
            switch (m) {
                case EmailAuthProvider.EMAIL_PASSWORD_SIGN_IN_METHOD: {
                    return AuthProviders.EmailAndPassword;
                }

                case EmailAuthProvider.EMAIL_LINK_SIGN_IN_METHOD: {
                    return AuthProviders.EmailLink;
                }

                case GoogleAuthProvider.PROVIDER_ID: {
                    return AuthProviders.Google;
                }

                default: {
                    return null;
                }
            }
        }).filter(m => m);
    }

    async getEmailAuthMethod(email: string): Promise<AuthProviders[]> {
        const methods = email && typeof email === 'string' && await fetchSignInMethodsForEmail(Auth.value, email);
        const results = this.convertAuthMethods(methods);

        if (results.length === 0) {
            logger.log('No auth methods for email', email, '; existing are:', methods);
        }

        return results;
    }

    async getHasAccount(email: string): Promise<boolean> {
        const methods = await this.getEmailAuthMethod(email);
        return methods.length > 0;
    }

    public signInWithEmailLink(email: string, reason: MagicLinkRequestReasons) {
        return this.sendMagicLinkRequest(email, reason);
    }

    protected async sendMagicLinkRequest(email: string, reason: MagicLinkRequestReasons, _displayName?: string) {
        email = prepareEmail(email);
        logger.log('sendMagicLinkRequest', email, reason);

        // don't use Promise.all here – it crashes Expo
        await this.Storage.setValue(UserSignInEmailStorageKey, email);
        await this.Storage.setValue(MagicLinkReasonKey, reason || 'empty');
        await this.Storage.remove(PasswordResetRequestedKey);

        await sendSignInLinkToEmail(Auth.value, email, { url: this.locationUrl, handleCodeInApp: true });
    }

    protected async processEmailLink(): Promise<{ result?: true, error?: 'invalidLink' | 'noemail' | Error, email?: string }> {
        let email = await this.Storage.getValue(UserSignInEmailStorageKey);
        const url = this.locationUrl;
        try {
            if (!isSignInWithEmailLink(Auth.value, url)) {
                logger.log('Current path is not sign in link:', url);
                return { error: 'invalidLink' };
            }

            email = prepareEmail(email);
            if (!email) {
                logger.log('User was not performing a sign in');
                return { error: 'noemail' };
            }

            this.setNextProvider(AuthProviders.EmailLink);
            await signInWithEmailLink(Auth.value, email, url);

            const reason = await this.Storage.getValue(MagicLinkReasonKey) as MagicLinkRequestReasons;
            this.logger.log('processEmailLink reason =', reason);
            if (reason === MagicLinkRequestReasons.PasswordReset) {
                await this.Storage.setValue(PasswordResetRequestedKey, 'true');
                this._setPasswordMode.setTrue();
            }

            await this.Storage.remove(MagicLinkReasonKey);
            await this.Storage.remove(UserSignInEmailStorageKey);

            this.logger.log('processEmailLink succeed with reason =', reason);
            this._magicLinkSucceeded.trigger(reason);

            return { result: true };

        } catch (err) {
            this.setNextProvider(AuthProviders.None);
            logger.error('Failed to perform a sign in for user:', email, '; Error:', err);
            return {
                error: err,
                email,
            };
        }
    }

    async signInWithEmailPassword(email: string, password: string): Promise<void> {
        const e = prepareEmail(email);

        try {
            this.setNextProvider(AuthProviders.EmailAndPassword);
            await signInWithEmailAndPassword(Auth.value, e, password);
            await this.Storage.remove(PasswordResetRequestedKey);
        } catch (err) {
            this.setNextProvider(AuthProviders.None);
            throw err;
        }
    }

    async createAccountForEmailAndPassword(email: string, password: string): Promise<void> {
        const e = prepareEmail(email);
        logger.log('Creating an account for ', e);
        try {
            this.setNextProvider(AuthProviders.EmailAndPassword);
            await createUserWithEmailAndPassword(Auth.value, e, password);
        } catch (err) {
            this.setNextProvider(AuthProviders.None);
            throw err;
        }
    }

    async updatePassword(password: string, oldPassword?: string): Promise<AuthResult> {
        const authUser = Auth.value.currentUser;
        if (!authUser) {
            return { result: false, error: AuthErrors.InvalidAuthState, original: null };
        }

        try {
            await updatePassword(Auth.value.currentUser, password);
            logger.log('password updated successfully!!');
            this._authUser.providers = await this.getEmailAuthMethod(authUser.email);
            this._setPasswordMode.setFalse();
            await this.Storage.remove(PasswordResetRequestedKey);

            return { result: true };
        } catch (err) {
            logger.log('failed to update password:', err.code);
            if (err.code === 'auth/requires-recent-login') {
                if (oldPassword) {
                    const cred = EmailAuthProvider.credential(this.authUser.email, oldPassword);
                    try {
                        logger.log('re-authenticating with email/password for', this.authUser.email);
                        await reauthenticateWithCredential(Auth.value.currentUser, cred);
                    } catch (err2) {
                        logger.log('failed to re-authenticate, ERROR:', err2);
                        return {
                            result: false,
                            error: err2.code === 'auth/wrong-password'
                                ? AuthErrors.WrongPassword
                                : AuthErrors.InvalidAuthState,
                            original: err2,
                        };
                    }

                    return await this.updatePassword(password);
                }

                return {
                    result: false,
                    error: AuthErrors.NeedsReauthentication,
                    original: err,
                };
            } else {
                throw err;
            }
        }
    }

    protected doGoogleSignIn() {
        const provider = new GoogleAuthProvider();
        return signInWithPopup(Auth.value, provider);
    }

    async signInWithGoogle(): Promise<boolean> {
        try {
            this.setNextProvider(AuthProviders.Google);

            const result = await this.doGoogleSignIn();
            if (!result) {
                logger.warn('Google SignIn: no result (probably canceled)');
                this.setNextProvider(AuthProviders.None);
                return false;
            }

            logger.log('Google: Successfully signed in with user', result.user.email);

            return true;
        } catch (err) {
            this.setNextProvider(AuthProviders.None);

            if (err.code == '-3' || (err.message && err.message.includes('error -3'))) {
                logger.log('Cancel sign in with google');
                return false;
            }

            logger.warn('Google Sign in error:', err.message, err);

            // Handle Errors here.
            const errorCode: string = err.code;
            // const errorMessage = err.message;
            // The email of the user's account used.
            const email = err.email;
            // The firebase.auth.AuthCredential type that was used.
            // const credential = err.credential;

            if (errorCode === 'auth/account-exists-with-different-credential') {
                // Construct the email link credential from the current URL.
                const emailCredential = EmailAuthProvider.credentialWithLink(
                    email,
                    this.locationUrl,
                );

                // Link the credential to the current user.
                try {
                    await linkWithCredential(Auth.value.currentUser, emailCredential);
                    // The provider is now successfully linked.
                    // The phone user can now sign in with their phone number or email.
                    return false;

                } catch (innerErr) {
                    // Some error occurred.
                }
            }
            throw err;
        }
    }

    async signOut() {
        logger.log('Signing out...');
        await this._initializing.useLoading(async () => {
            try {
                this._setPasswordMode.setFalse();

                await this._onSignOut.triggerAsync();

                await this.servicesSignOut();

                await this.Storage.remove(AuthProviderIdKey);
                await this.Storage.remove(MagicLinkReasonKey);

                await signOut(Auth.value);
            } catch (err) {
                logger.warn('Failed to sign out!');
                // eslint-disable-next-line no-console
                console.error(err);
                throw err;
            }
        });
    }

    protected abstract googleSignOut(): Promise<void>;

    protected async servicesSignOut() {
        await this.googleSignOut();
    }

    updatePhotoUrl(photoUrl: string): Promise<void> {
        return this.updateProfile({ photoURL: photoUrl });
    }

    async updateProfile(data: AuthUserUpdate): Promise<void> {
        const diff: typeof data = { };
        if (!transferFields.changed(data, this._authUser, diff, 'displayName', 'photoURL')) {
            return;
        }

        await updateProfile(Auth.value.currentUser, diff);

        runInAction(() => {
            const user = Auth.value.currentUser;

            this._authUser.photoURL = user.photoURL;
            this._authUser.displayName = user.displayName;
        });
        logger.log('AuthUser profile updated:', this._authUser);
    }
}
