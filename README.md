# Octokit Storage Bucket

Octokit Storage Bucket is an experimental Node.js tool that creatively utilizes GitHub's Releases API to create a makeshift asset storage system. This project demonstrates an unconventional approach to asset management by leveraging GitHub releases as storage "buckets".

## Important Note

This project is intended for educational and experimental purposes only. It showcases an innovative use of GitHub's API, but it's crucial to be aware of and respect GitHub's terms of service and usage limits. Always ensure you're using GitHub's services in compliance with their policies.

## Features

- Utilizes GitHub releases as asset storage "buckets"
- Uploads multiple assets to specified release buckets
- Supports uploading individual files or entire directories
- Generates metadata for uploaded assets
- Demonstrates creative use of the Octokit REST API

## How It Works

Octokit Storage Bucket uses GitHub's Releases API in an unconventional way:
1. It creates GitHub releases to serve as "storage buckets"
2. Assets are uploaded to these releases, effectively using them as storage
3. The tool manages metadata and provides an interface for easy upload and management

This approach allows for a unique way of storing and organizing assets within a GitHub repository structure.

## Prerequisites

- Node.js installed on your local machine
- Yarn package manager installed
- A GitHub account and repository
- A GitHub Personal Access Token with appropriate permissions

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/octokit-storage-bucket.git
   ```
2. Navigate to the project directory:
   ```bash
   cd octokit-storage-bucket
   ```
3. Install dependencies:
   ```bash
   yarn install
   ```

## Configuration

Set up these environment variables:

- `GIT_USER_NAME`: Your GitHub username
- `GIT_STORAGE_REPOSITORY_NAME`: Repository name for asset storage
- `GIT_TOKEN`: Your GitHub Personal Access Token
- `ASSETS_BUCKET_META_PATH`: Local path for asset metadata
- `ASSETS_TO_UPLOAD_ROOT_PATH`: Root path of assets to upload

## Usage

Run the tool with:

```bash
yarn start
```

The tool will:
1. Scan `ASSETS_TO_UPLOAD_ROOT_PATH` for assets
2. Create or use existing GitHub releases as "buckets"
3. Upload assets to these release "buckets"
4. Generate and store asset metadata

## Ethical Considerations

While this project demonstrates creative use of GitHub's API, it's important to use it responsibly:

- Be mindful of GitHub's storage limits and fair use policies
- Consider the impact on GitHub's services and other users
- This tool is not intended for large-scale or production use

## Contributing

Contributions that improve the tool or its documentation are welcome. Please ensure your contributions align with the project's educational and experimental nature.

## License

[MIT](https://choosealicense.com/licenses/mit/)

## Disclaimer

This project is not affiliated with or endorsed by GitHub. Use at your own risk and in compliance with GitHub's terms of service.