import fs from "fs";
import { Octokit } from "@octokit/rest";
import crypto from "crypto";
import mime from "mime-types";
import dotenv from "dotenv";
import path from "path";
import cliProgress from "cli-progress";

// Types
interface IAssetData {
    url: string;
    id: number;
    node_id: string;
    name: string;
    label: string;
    content_type: string;
    state: string;
    size: number;
    download_count: number;
    created_at: string;
    updated_at: string;
    browser_download_url: string;
}

interface IAssetBucket {
    name: string;
    releaseDetails: any;
    assets: Array<{ name: string; assetData: IAssetData }>;
}

// env setup
dotenv.config();

// ENVIRONMENT VARIABLES
const GIT_USER_NAME = process.env.GIT_USER_NAME || '';
const GIT_STORAGE_REPOSITORY_NAME = process.env.GIT_STORAGE_REPOSITORY_NAME || '';
const GIT_TOKEN = process.env.GIT_TOKEN || '';
const ASSETS_BUCKET_META_PATH = process.env.ASSETS_BUCKET_META_PATH || '';
const ASSETS_TO_UPLOAD_ROOT_PATH = process.env.ASSETS_TO_UPLOAD_ROOT_PATH || '';

const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

// CORE
const octokit = new Octokit({
    auth: GIT_TOKEN,
});

// Helper function to check if an error is an Octokit error
function isOctokitError(error: any): error is { status: number; message: string; response?: { data?: any } } {
    return error && typeof error === 'object' && 'status' in error && 'message' in error;
}

async function main(): Promise<void> {
    await uploadLocalAssets();
}

async function uploadLocalAssets(): Promise<void> {
    const assetsToUpload: string[] = fs.readdirSync(ASSETS_TO_UPLOAD_ROOT_PATH);

    for (const assetBucketName of assetsToUpload) {
        let resolvedAssetBucketName = assetBucketName;
        const assetBucketOrFilePath = path.join(ASSETS_TO_UPLOAD_ROOT_PATH, assetBucketName);

        // If the current path is not a directory, store it in a root-bucket
        const uploadInRootBucket = !fs.statSync(assetBucketOrFilePath).isDirectory();
        if (uploadInRootBucket)
            resolvedAssetBucketName = `root-bucket`;

        console.log("Uploading Asset Bucket -", resolvedAssetBucketName);

        const assetBucket: IAssetBucket = {
            name: resolvedAssetBucketName,
            releaseDetails: null,
            assets: [],
        };

        try {
            // Check if release already exists or create a new one
            await getOrCreateBucket(assetBucket);

            // Upload assets from directory or files from root
            await uploadAssetsFromDirectory(assetBucket, assetBucketOrFilePath, uploadInRootBucket);

            // Persist the uploaded information in a JSON file
            updateAssetBucketMeta(assetBucket);
        } catch (error) {
            console.error("Error during upload:", error);
            updateAssetBucketMeta(assetBucket);
        }
    }
}

async function uploadAssetsFromDirectory(assetBucket: IAssetBucket, assetBucketOrFilePath: string, uploadInRootBucket: boolean): Promise<void> {
    const assetsToUpload: string[] = uploadInRootBucket ? [assetBucketOrFilePath] : fs.readdirSync(assetBucketOrFilePath).filter(fileName =>
        fs.statSync(path.join(assetBucketOrFilePath, fileName)).isFile()
    );

    for (const fileName of assetsToUpload) {
        const filePath: string = uploadInRootBucket ? assetBucketOrFilePath : path.join(assetBucketOrFilePath, fileName);
        const contentType: string | false = mime.lookup(filePath);
        const fileData: Buffer = fs.readFileSync(filePath);

        const sanitizedFileName = sanitizeFileName(fileName);

        // Check if the asset already exists
        if (assetBucket.assets.some(asset => asset.name === sanitizedFileName)) {
            console.log(`Skipping ${sanitizedFileName} - asset already exists in the bucket`);
            continue;
        }

        try {
            await uploadAsset({
                assetBucket,
                fileName: sanitizedFileName,
                fileData,
                contentType: contentType as string,
                assets: assetBucket.assets,
            });
        } catch (error) {
            if (isOctokitError(error)) {
                if (error.status === 422 && error.message.includes('already_exists')) {
                    console.log(`Skipping ${sanitizedFileName} - asset already exists in the bucket`);
                } else {
                    console.error('An unexpected HTTP error occurred:', error.message);
                    console.error('Status:', error.status);
                    if (error.response?.data) {
                        console.error('Response data:', error.response.data);
                    }
                }
            } else {
                console.error('An unexpected error occurred:', error);
            }
        }
    }
}

function sanitizeFileName(fileName: string): string {
    const nameWithoutExtension = path.parse(fileName).name;
    const normalizedName = nameWithoutExtension.toLowerCase();
    const sanitizedName = normalizedName.replace(/[^a-z0-9-_]/g, '-');
    const maxLength = 255;
    const truncatedName = sanitizedName.slice(0, maxLength);
    const extension = path.parse(fileName).ext.toLowerCase();
    return truncatedName + extension;
}

async function uploadAsset(props: {
    assetBucket: IAssetBucket;
    fileName: string;
    fileData: Buffer;
    contentType: string;
    assets: IAssetBucket["assets"];
}): Promise<void> {
    const { assetBucket, fileName, fileData, contentType, assets } = props;

    console.log(`Uploading ${fileName}...`);

    progressBar.start(100, 0);

    const asset = await octokit.repos.uploadReleaseAsset({
        owner: GIT_USER_NAME,
        repo: GIT_STORAGE_REPOSITORY_NAME,
        release_id: assetBucket.releaseDetails!.id,
        name: fileName,
        data: fileData as any,
        headers: {
            "content-type": contentType || "application/octet-stream",
            "content-length": fileData.length,
        },
        request: {
            onUploadProgress: (progressEvent: { loaded: number; total: number }) => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                progressBar.update(percentCompleted);
            }
        }
    });

    progressBar.stop();
    console.log(`${fileName} uploaded successfully`);

    assets.push({
        name: fileName,
        assetData: asset.data as IAssetData,
    });
}

async function getOrCreateBucket(assetBucket: IAssetBucket): Promise<void> {
    try {
        console.log("Fetching releases...");
        const existingReleases = await octokit.repos.listReleases({
            owner: GIT_USER_NAME,
            repo: GIT_STORAGE_REPOSITORY_NAME,
        });

        console.log(`Found ${existingReleases.data.length} releases`);

        // Check if a release with the given name exists
        const existingRelease = existingReleases.data.find(release => release.name === assetBucket.name);
        if (existingRelease) {
            console.log(`Found existing release for ${assetBucket.name}`);

            // Fetch and populate the assets for the existing release
            const assets = await octokit.repos.listReleaseAssets({
                owner: GIT_USER_NAME,
                repo: GIT_STORAGE_REPOSITORY_NAME,
                release_id: existingRelease.id,
            });

            assetBucket.releaseDetails = existingRelease;
            assetBucket.assets = assets.data.map(asset => ({
                name: asset.name,
                assetData: asset as IAssetData,
            }));

            return;
        }
    } catch (error) {
        if (isOctokitError(error)) {
            console.error("Error fetching releases:", error.message);
            console.error("Status:", error.status);
            if (error.response?.data) {
                console.error("Response:", error.response.data);
            }
        } else {
            console.error("Unexpected error fetching releases:", error);
        }
        // Instead of throwing, we'll continue to create a new release
        console.log("Continuing to create a new release...");
    }

    // Create a new release if not found
    try {
        const tagName = `v${crypto.randomBytes(8).toString("hex")}`;
        console.log(`Creating new release with tag: ${tagName}`);
        const release = await octokit.repos.createRelease({
            owner: GIT_USER_NAME,
            repo: GIT_STORAGE_REPOSITORY_NAME,
            tag_name: tagName,
            name: assetBucket.name,
            body: "",
            draft: false,
            prerelease: false,
        });

        console.log("Release created successfully");
        assetBucket.releaseDetails = release.data;
        assetBucket.assets = []; // Initialize empty assets array for new release
    } catch (error) {
        if (isOctokitError(error)) {
            console.error("Error creating release:", error.message);
            console.error("Status:", error.status);
            if (error.response?.data) {
                console.error("Response:", error.response.data);
            }
        } else {
            console.error("Unexpected error creating release:", error);
        }
        throw error; // Re-throw the error after logging
    }
}

function updateAssetBucketMeta(assetBucket: IAssetBucket): void {
    try {
        fs.mkdirSync(ASSETS_BUCKET_META_PATH, { recursive: true });
    } catch (error) {
        // Folder already exists
    }

    const filePath = path.join(ASSETS_BUCKET_META_PATH, assetBucket.name + ".json");
    fs.writeFileSync(filePath, JSON.stringify(assetBucket, null, 4));
}

main();