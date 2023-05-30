import type { TypedKeys } from '@zajno/common/types';

export function setFieldValue<T, K = any>(obj: T, ...entries: { key: TypedKeys<T, K>, value: Object }[]) {
    entries.forEach(({ key, value }) => {
        obj[key] = value as any;
    });
    return obj;
}
