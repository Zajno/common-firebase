import * as functions from 'firebase-functions';
import RepoError from '../../database/RepoError';

export const Config = {
    DisableErrorLogging: false,
};

export function toHttpError(this: RepoError) {
    let code: functions.https.FunctionsErrorCode;
    switch (this.type) {
        case RepoError.Types.InvalidArgs: {
            code = 'invalid-argument';
            break;
        }

        case RepoError.Types.AlreadyExists: {
            code = 'already-exists';
            break;
        }

        default: {
            code = 'unknown';
            break;
        }
    }
    const res = new functions.https.HttpsError(code, this.message);
    res.stack = this.stack;
    return res;
}

export function tryConvertToHttpError<T extends Error = Error>(err: T): functions.https.HttpsError {
    if (err instanceof functions.https.HttpsError) {
        return err;
    }

    if (err instanceof RepoError) {
        return toHttpError.call(err);
    }

    const msg = err?.message || '<no message>';
    return toHttpError.call(new RepoError(RepoError.Types.Unknown, msg));
}

export function wrapRepoError<T extends any[], TOut>(
    worker: (...args: T) => Promise<TOut>,
    workerName: string = null,
): (...args: T) => Promise<TOut> {
    return async (...args: T) => {
        try {
            const res = await worker(...args);
            return res;
        } catch (err) {
            if (!Config.DisableErrorLogging) {
                // eslint-disable-next-line no-console
                console.error(`Function "${workerName || worker.name}" failed with error:`, err);
            }
            throw tryConvertToHttpError(err);
        }
    };
}
