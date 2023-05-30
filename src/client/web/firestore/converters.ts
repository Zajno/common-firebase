import { IdentAny } from '@zajno/common/types/ident';
import { UpdateDiff } from '../../../database/types';
import { Timestamp, FirestoreDataConverter, DocumentSnapshot, serverTimestamp } from 'firebase/firestore';
import { TypedKeys } from '@zajno/common/types';
import { setFieldValue } from '../../../database/firestore/helpers';


export function IdentConverter<T extends IdentAny>(): FirestoreDataConverter<T> {
    return IdentConverter.Default as FirestoreDataConverter<T>;
}

export namespace IdentConverter {
    export const Default = {
        toFirestore<T extends IdentAny>(m: T) {
            delete m.id;
            return m as UpdateDiff<T>;
        },
        fromFirestore<T extends IdentAny>(snapshot: DocumentSnapshot, options?: any, prev?: T) {
            const d = prev || snapshot.data(options) as T;
            d.id = snapshot.id;
            return d;
        },
    };
}

export function TimestampConverter<T>(...keys: (keyof T)[]): FirestoreDataConverter<T> {
    return {
        toFirestore(m: T) {
            keys.forEach(key => {
                const v = m[key];
                if (typeof v === 'number') {
                    m[key] = Timestamp.fromMillis(v) as any;
                }
            });
            return m as UpdateDiff<T>;
        },
        fromFirestore(snapshot: DocumentSnapshot, options?: any, prev?: T) {
            const d = prev || snapshot.data(options) as T;
            keys.forEach(key => {
                const v = d[key];
                if (v instanceof Timestamp) {
                    d[key] = v.toMillis() as any;
                }
            });
            return d;
        },
    };
}


export type TimestampKey<T> = TypedKeys<T, number>;

export function setServerTimestamp<T>(obj: T, ...keys: TimestampKey<T>[]) {
    return setFieldValue(obj, ...keys.map(k => ({ key: k, value: serverTimestamp() })));
}
