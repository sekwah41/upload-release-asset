const core = require('@actions/core');
const glob = require('@actions/glob');
const { GitHub } = require('@actions/github');
const fs = require('fs');
const path = require('path');
const fsPromises = fs.promises;
const mime = require('mime-types');

const { debug, info, warning } = core;

function getDefaultGlobOptions() {
  return {
    followSymbolicLinks: true,
    implicitDescendants: true,
    omitBrokenSymbolicLinks: true
  };
}

/**
 * @param github
 * @param uploadUrl
 * @param assetPath
 * @param assetContentType
 * @param assetName`
 * @returns {Promise<*>}
 */
async function uploadFile({ github, uploadUrl, assetPath, assetContentType, assetName }) {
  // Determine content-length for header to upload asset
  const contentLength = filePath => fs.statSync(filePath).size;
  const mediaType = assetContentType ? assetContentType : mime.lookup(path.extname(assetPath));
  const fileName = assetName ? assetName : path.basename(assetPath);

  // Setup headers for API call, see Octokit Documentation: https://octokit.github.io/rest.js/#octokit-routes-repos-upload-release-asset for more information
  const headers = { 'content-type': mediaType, 'content-length': contentLength(assetPath) };

  // Upload a release asset
  // API Documentation: https://developer.github.com/v3/repos/releases/#upload-a-release-asset
  // Octokit Documentation: https://octokit.github.io/rest.js/#octokit-routes-repos-upload-release-asset
  const uploadAssetResponse =
    uploadUrl === 'test_upload'
      ? 'asset_was_not_uploaded'
      : await github.repos.uploadReleaseAsset({
          url: uploadUrl,
          headers,
          name: fileName,
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
    const assetName = core.getInput('asset_name', { required: false });
    const assetContentType = core.getInput('asset_content_type', { required: false });

    const searchResults = await filesToUpload(assetPath);

    const downloadUrls = [];

    if (searchResults.length === 0) {
      warning(`No files were found with the provided path: ${assetPath}. No assets will be uploaded.`);
    } else if (searchResults.length === 1) {
      info(`Found 1 file to upload: ${searchResults[0]}`);
      downloadUrls.push(
        await uploadFile({
          github,
          uploadUrl,
          assetPath: searchResults[0],
          assetContentType,
          assetName
        })
      );
    } else {
      info(`Found ${searchResults.length} files to upload`);
      for (const file of searchResults) {
        debug(`Uploading ${file}`);
        downloadUrls.push(
          await uploadFile({
            github,
            uploadUrl,
            assetPath: file,
            assetContentType
          })
        );
      }
    }

    // Set the output variable for use by other actions: https://github.com/actions/toolkit/tree/master/packages/core#inputsoutputs
    core.setOutput('browser_download_url', downloadUrls);
  } catch (error) {
    core.setFailed(error.message);
  }
}

module.exports = run;
