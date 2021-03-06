import { IEvent } from '@zajno/common/lib/event';
import type firebase from 'firebase/app';

export type FirebaseUser = firebase.User;

export type AuthUser = {
    uid: string,
    displayName: string,
    email: string,
    photoURL: string,
    emailVerified: boolean,

    providers: ReadonlyArray<AuthProviders>,
    currentProvider: AuthProviders,
};

export enum AuthProviders {
    None = '',
    EmailLink = 'emaillink',
    EmailAndPassword = 'emailpassword',
    Google = 'google',
    Apple = 'apple',
    DevLogin = 'devLogin',
}

export enum MagicLinkRequestReasons {
    SignIn = 'signin',
    SignUp = 'signup',
    PasswordReset = 'password',
    PasswordChange = 'passwordChange',
    EmailReset = 'email',
}

export interface IAuthController {
    readonly authUser: Readonly<AuthUser>;
    readonly initializing: boolean;

    readonly needsCreatePassword: boolean | null;

    readonly magicLinkSucceeded: IEvent<MagicLinkRequestReasons>;

    readonly onPreProcessUser: IEvent<AuthUser>;
    readonly onSignOut: IEvent;

    readonly setPasswordMode: boolean;

    skipPasswordMode(): void;

    getEmailAuthMethod(email: string): Promise<AuthProviders[]>;
    getHasAccount(email: string): Promise<boolean>;

    signInWithEmailLink(email: string, reason: MagicLinkRequestReasons): Promise<void>;
    signInWithEmailPassword(email: string, password: string): Promise<void>;
    createAccountForEmailAndPassword(email: string, password: string): Promise<void>;

    signInWithGoogle(): Promise<boolean>;

    signOut(): Promise<void>;

    updatePassword(password: string, oldPassword?: string): Promise<AuthResult>;

    updatePhotoUrl(photoUrl: string): Promise<void>;
}

export type FirebaseError = Error & { code: string };

export type AuthResult = { result: true } | { result: false, error: AuthErrors, original: FirebaseError };

export enum AuthErrors {
    Unknown = 0,
    InvalidAuthState,
    WrongPassword,
    NeedsReauthentication,
}
