import * as functions from 'firebase-functions';

namespace AppHttpError {
    export type InvalidArgDescription<T = any> = {
        name: keyof T,
        expected?: string;
        got?: string;
        error?: string;
    };

    export function InvalidArguments<T = any>(...list: InvalidArgDescription<T>[]) {
        const strings = list.map(arg => {
            const details = [
                arg.expected ? `expected: ${arg.expected}` : null,
                arg.got ? `got: ${arg.got}` : null,
                arg.error ? `error: ${arg.error}` : null,
            ].filter(d => d);
            const detailsStr = details.length > 0
                ? ` (${details.join(', ')})`
                : '';
            return `${arg.name}${detailsStr}`;
        });
        const message = `Expected fields: ${strings.join(', ')}`;

        return new functions.https.HttpsError('invalid-argument', message);
    }

    export function NotAuthenticated(message = 'This action requires authentication') {
        return new functions.https.HttpsError('unauthenticated', message);
    }

    export function NotFound(message = 'Not found') {
        return new functions.https.HttpsError('not-found', message);
    }

    export function AlreadyExists(message = 'The items already exists') {
        return new functions.https.HttpsError('already-exists', message);
    }

    export function PreconditionFailed(message = 'Precondition failed') {
        return new functions.https.HttpsError('failed-precondition', message);
    }

    export function Internal(message = 'Internal error') {
        return new functions.https.HttpsError('internal', message);
    }

    export function NoPermission(message = 'Incorrect permissions') {
        return new functions.https.HttpsError('permission-denied', message);
    }
}

export default AppHttpError;
