import { createLazy } from '@zajno/common/lazy/light';
import logger from '@zajno/common/logger';
import { AppConfig } from '../config';
import Admin from './admin';


const storage = Admin.storage();
const StorageBucket = createLazy(() => {
    const bucketName = AppConfig.value?.storageBucket || storage.bucket().name;
    const bucket: ReturnType<typeof storage.bucket> = storage.bucket(bucketName);
    return bucket;
});

export const StorageContext = {
    get storage() { return storage; },
    get bucket() { return StorageBucket.value; },
};

export async function removeDirectoryFromStorage(path: string): Promise<void> {
    if (!path) {
        throw Error('Invalid path');
    }

    logger.log(`Start deleting files :::: ${path}`);
    try {
        await StorageContext.bucket.deleteFiles({ prefix: path });
        logger.log(`Files successfully deleted :::: ${path}`);
    } catch (error) {
        logger.error(`Error while deleting files :::: ${path} :::: ${error}`);
    }
}
