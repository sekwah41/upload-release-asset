const core = require('@actions/core');
const glob = require('@actions/glob');
const { GitHub } = require('@actions/github');
const fs = require('fs');
const fsPromises = fs.promises;

const { debug, info, warning } = core;

function getDefaultGlobOptions() {
  return {
    followSymbolicLinks: true,
    implicitDescendants: true,
    omitBrokenSymbolicLinks: true
  };
}

async function uploadFile(github, uploadUrl, assetPath, assetName, assetContentType) {
  // Determine content-length for header to upload asset
  const contentLength = filePath => fs.statSync(filePath).size;

  // Setup headers for API call, see Octokit Documentation: https://octokit.github.io/rest.js/#octokit-routes-repos-upload-release-asset for more information
  const headers = { 'content-type': assetContentType, 'content-length': contentLength(assetPath) };

  // Upload a release asset
  // API Documentation: https://developer.github.com/v3/repos/releases/#upload-a-release-asset
  // Octokit Documentation: https://octokit.github.io/rest.js/#octokit-routes-repos-upload-release-asset
  const uploadAssetResponse = await github.repos.uploadReleaseAsset({
    url: uploadUrl,
    headers,
    name: assetName,
    file: fs.readFileSync(assetPath)
  });

  // Get the browser_download_url for the uploaded release asset from the response
  const {
    data: { browser_download_url: browserDownloadUrl }
  } = uploadAssetResponse;

  return browserDownloadUrl;
}

async function filesToUpload(assetPath) {
  const searchResults = [];

  // noinspection SpellCheckingInspection
  const globber = await glob.create(assetPath, getDefaultGlobOptions());
  const rawSearchResults = await globber.glob();

  // Just used to check names don't clash
  const set = new Set();

  for (const searchResult of rawSearchResults) {
    const fileStats = await fsPromises.stat(searchResult);
    // isDirectory() returns false for symlinks if using fs.lstat(), make sure to use fs.stat() instead
    if (!fileStats.isDirectory()) {
      debug(`File:${searchResult} was found using the provided searchPath`);
      searchResults.push(searchResult);

      // detect any files that would be overwritten because of case insensitivity
      if (set.has(searchResult.toLowerCase())) {
        info(
          `Uploads are case insensitive: ${searchResult} was detected that it will be overwritten by another file with the same path`
        );
      } else {
        set.add(searchResult.toLowerCase());
      }
    } else {
      debug(`Removing ${searchResult} from rawSearchResults because it is a directory`);
    }
  }

  return searchResults;
}

async function run() {
  try {
    // Get authenticated GitHub client (Octokit): https://github.com/actions/toolkit/tree/master/packages/github#usage
    const github = new GitHub(process.env.GITHUB_TOKEN);

    // Get the inputs from the workflow file: https://github.com/actions/toolkit/tree/master/packages/core#inputsoutputs
    const uploadUrl = core.getInput('upload_url', { required: true });
    const assetPath = core.getInput('asset_path', { required: true });
    const assetName = core.getInput('asset_name', { required: true });
    const assetContentType = core.getInput('asset_content_type', { required: false });

    const searchResults = await filesToUpload(assetPath);

    if (searchResults.length === 0) {
      warning(`No files were found with the provided path: ${assetPath}. No assets will be uploaded.`);
    }

    const browserDownloadUrl = await uploadFile(github, uploadUrl, assetPath, assetName, assetContentType);

    // Set the output variable for use by other actions: https://github.com/actions/toolkit/tree/master/packages/core#inputsoutputs
    core.setOutput('browser_download_url', [browserDownloadUrl]);
  } catch (error) {
    core.setFailed(error.message);
  }
}

module.exports = run;
