import logger from '@zajno/common/lib/logger';
import { AppConfig } from '../config';
import Admin from './admin';
import type { Bucket } from '@google-cloud/storage';

const storage = Admin.storage();

export const bucketName = AppConfig.value?.storageBucket || storage.bucket().name;

export const bucket: Bucket = storage.bucket(bucketName);

export default storage;

export async function removeDirectoryFromStorage(path: string): Promise<void> {
    if (!path) {
        throw Error('Invalid path');
    }

    logger.log(`Start deleting files :::: ${path}`);
    try {
        await bucket.deleteFiles({ directory: path });
        logger.log(`Files successfully deleted :::: ${path}`);
    } catch (error) {
        logger.error(`Error while deleting files :::: ${path} :::: ${error}`);
    }
}
