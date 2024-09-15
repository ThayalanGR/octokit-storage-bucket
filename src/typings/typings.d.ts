// typings.d.ts
declare namespace NodeJS {
    interface ProcessEnv {
        GIT_USER_NAME: string;
        GIT_STORAGE_REPOSITORY_NAME: string;
        GIT_TOKEN: string;
        ASSETS_BUCKET_META_PATH: string;
        ASSETS_TO_UPLOAD_ROOT_PATH: string;
    }
}