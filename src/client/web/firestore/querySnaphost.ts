/* eslint-disable no-console */
import { IdentAny } from '@zajno/common/types/ident';
import {
    getQueryPath,
    IQuery,
    logQueryCount,
    UnsubscribeSnapshot,
    QuerySnapshotCallback,
} from '../../../database/firestore';
import {
    DocumentSnapshot,
    onSnapshot,
    Query,
    QuerySnapshot,
    getDocs,
} from 'firebase/firestore';

export type QuerySnapshotConverterCallback<T> = (items: DocumentSnapshot<T>[]) => T[];

export function querySnapshot<T extends IdentAny>(query: Query<T>): Promise<T[]>;
export function querySnapshot<T extends IdentAny>(query: Query<T>, cb: QuerySnapshotCallback<T>): Promise<UnsubscribeSnapshot>;

export function querySnapshot<T extends IdentAny>(query: Query<T>,
    cb: QuerySnapshotCallback<T>,
    converter: QuerySnapshotConverterCallback<T>): Promise<T[] | UnsubscribeSnapshot>;

export async function querySnapshot<T extends IdentAny>(
    query: Query<T>,
    cb: QuerySnapshotCallback<T> = null,
    converter: QuerySnapshotConverterCallback<T> = null,
    debugName?: string,
) {
    const convertSnapshots = (s: QuerySnapshot<T>): T[] => {
        const docs: DocumentSnapshot<T>[] = s.docs;

        if (converter) {
            const data = converter(docs);
            return data;
        } else {
            return docs.map((d) => {
                const cc = d.data();
                cc.id = d.id;
                return cc;
            });
        }
    };

    if (cb) {
        const firstFetchPromise: Promise<UnsubscribeSnapshot> = new Promise((resolveP, rejectP) => {
            let resolve = resolveP;

            const unsubscribe = onSnapshot(query, async (snapshot: QuerySnapshot<T>) => {
                    try {
                        logQueryCount(query as IQuery, snapshot, true, debugName);

                        const items = convertSnapshots(snapshot);
                        await cb(items);
                    } finally {
                        if (resolve) {
                            const r = resolve;
                            resolve = null;
                            r(unsubscribe);
                        }
                    }

                }, (err: Error) => {
                    console.warn('querySnapshot fail:', getQueryPath(query as IQuery));
                    console.error(err);
                    if (unsubscribe) {
                        unsubscribe();
                    }
                    rejectP(err);
                },
                );
        });

        const res = await firstFetchPromise;
        return res;
    } else {
        const snapshot = await getDocs(query);
        logQueryCount(query as IQuery, snapshot, false, debugName);

        return convertSnapshots(snapshot);
    }
}
