import fs from "fs";
import { Octokit } from "@octokit/rest";
import crypto from "crypto";
import mime from "mime-types";
import { IAssetBucket, IAssetData } from "./typings/core.types";

// ENVIRONMENT VARIABLES
const GIT_USER_NAME = process.env.GIT_USER_NAME;
const GIT_STORAGE_REPOSITORY_NAME = process.env.GIT_STORAGE_REPOSITORY_NAME;
const GIT_TOKEN = process.env.GIT_TOKEN;
const ASSETS_BUCKET_META_PATH = process.env.ASSETS_BUCKET_META_PATH;
const ASSETS_TO_UPLOAD_ROOT_PATH = process.env.ASSETS_TO_UPLOAD_ROOT_PATH;

// CORE
const octokit = new Octokit({
    auth: GIT_TOKEN,
});

async function main(): Promise<void> {
    await uploadLocalAssets();
}

async function uploadLocalAssets(): Promise<void> {
    const assetsToUpload: string[] = fs.readdirSync(ASSETS_TO_UPLOAD_ROOT_PATH);

    for (const assetBucketName of assetsToUpload) {
        let resolvedAssetBucketName = assetBucketName;
        const assetBucketPath = [ASSETS_TO_UPLOAD_ROOT_PATH, assetBucketName].join("/");

        // If the current path is not a directory, create a random bucket name
        if (!fs.statSync(assetBucketPath).isDirectory())
            resolvedAssetBucketName = `random-${crypto.randomBytes(4).toString("hex")}`;

        console.log("Uploading Asset Bucket -", resolvedAssetBucketName);

        const assetBucket: IAssetBucket = {
            name: resolvedAssetBucketName,
            releaseDetails: <IAssetBucket["releaseDetails"]>(
                (<unknown>null)
            ),
            assets: [],
        };

        try {
            // Check if release already exists or create a new one
            await getOrCreateBucket(assetBucket);

            // Upload assets from directory or files from root
            await uploadAssetsFromDirectory(assetBucket, assetBucketPath);

            // Persist the uploaded information in a JSON file
            updateAssetBucketMeta(assetBucket);
        } catch (error) {
            console.error("Error during upload:", error);
            updateAssetBucketMeta(assetBucket);
        }
    }
}

async function uploadAssetsFromDirectory(assetBucket: IAssetBucket, assetBucketPath: string): Promise<void> {
    const sectionFiles: string[] = fs.readdirSync(assetBucketPath).filter(fileName =>
        fs.statSync([assetBucketPath, fileName].join("/")).isFile()
    );

    for (const fileName of sectionFiles) {
        const filePath: string = [assetBucketPath, fileName].join("/");
        const contentType: string | false = mime.lookup(filePath);
        const fileData: Buffer = fs.readFileSync(filePath);

        // Check if the asset already exists
        if (assetBucket.assets.some(asset => asset.name === fileName)) {
            console.log(`Skipping ${fileName} - already uploaded`);
            continue;
        }

        console.log(`Uploading ${fileName}...`);
        await uploadAsset({
            assetBucket,
            fileName,
            fileData,
            contentType: contentType as string,
            assets: assetBucket.assets,
        });
    }
}

async function uploadAsset(props: {
    assetBucket: IAssetBucket;
    fileName: string;
    fileData: Buffer;
    contentType: string;
    assets: IAssetBucket["assets"];
}): Promise<void> {
    const { assetBucket, fileName, fileData, contentType, assets } = props;

    const asset = await octokit.repos.uploadReleaseAsset({
        owner: GIT_USER_NAME,
        repo: GIT_STORAGE_REPOSITORY_NAME,
        release_id: assetBucket.releaseDetails!.id,
        name: fileName,
        data: <string>(<unknown>fileData),
        headers: {
            "content-type": contentType || "application/octet-stream",
            "content-length": fileData.length,
        },
    });

    assets.push({
        name: fileName,
        assetData: asset.data as unknown as IAssetData,
    });
}

async function getOrCreateBucket(assetBucket: IAssetBucket): Promise<void> {
    try {
        const existingReleases = await octokit.repos.listReleases({
            owner: GIT_USER_NAME,
            repo: GIT_STORAGE_REPOSITORY_NAME,
        });

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

            assetBucket.releaseDetails = existingRelease as IAssetBucket['releaseDetails'];
            assetBucket.assets = assets.data.map(asset => ({
                name: asset.name,
                assetData: asset as IAssetData,
            }));

            return;
        }
    } catch (error) {
        console.error("Error fetching releases:", error);
    }

    // Create a new release if not found
    const tagName = `v${crypto.randomBytes(8).toString("hex")}`;
    const release = await octokit.repos.createRelease({
        owner: GIT_USER_NAME,
        repo: GIT_STORAGE_REPOSITORY_NAME,
        tag_name: tagName,
        name: assetBucket.name,
        body: "",
        draft: false,
        prerelease: false,
    });

    assetBucket.releaseDetails = release.data as IAssetBucket['releaseDetails'];
    assetBucket.assets = []; // Initialize empty assets array for new release
}

function updateAssetBucketMeta(assetBucket: IAssetBucket): void {
    try {
        fs.mkdirSync(ASSETS_BUCKET_META_PATH, { recursive: true });
    } catch (error) {
        // Folder already exists
    }

    const filePath = [ASSETS_BUCKET_META_PATH, assetBucket.name].join("/").concat(".json");
    fs.writeFileSync(filePath, JSON.stringify(assetBucket, null, 4));
}

main();