const mock = require('mock-fs');
jest.mock('@actions/core');
jest.mock('@actions/github');

const core = require('@actions/core');
const { GitHub, context } = require('@actions/github');
const run = require('../src/upload-release-asset');

const textFileContents = 'file content here';
const fakeFileSystem = {
  single_file_folder_asset_path: {
    'singlefile.js': textFileContents
  },
  double_file_folder_asset_path: {
    'firstFile.js': textFileContents,
    'secondFile.js': textFileContents
  },
  'path/to/some.png': Buffer.from([8, 6, 7, 5, 3, 0, 9]),
  some_build: {
    'test.exe': Buffer.from([8, 1, 7, 5, 3, 0, 9]),
    'test2.exe': Buffer.from([8, 6, 7, 5, 3, 0, 9]),
    'test.dmg': Buffer.from([8, 6, 7, 1, 3, 4, 9]),
    'test.AppImage': Buffer.from([8, 2, 7, 5, 3, 0, 9])
  },
  'some/other/path': {
    /** another empty directory */
  }
};

/* eslint-disable no-undef */
describe('Upload Release Asset', () => {
  let uploadReleaseAsset;
  let content;

  beforeEach(() => {
    uploadReleaseAsset = jest.fn().mockReturnValue({
      data: {
        browser_download_url: 'browserDownloadUrl'
      }
    });

    mock(fakeFileSystem);

    context.repo = {
      owner: 'owner',
      repo: 'repo'
    };

    const github = {
      repos: {
        uploadReleaseAsset
      }
    };

    GitHub.mockImplementation(() => github);
  });

  afterEach(() => {
    mock.restore();
  });

  test('Upload release asset endpoint is called', async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce('upload_url')
      .mockReturnValueOnce('single_file_folder_asset_path/singlefile.js') // asset_path
      .mockReturnValueOnce('asset_name')
      .mockReturnValueOnce('asset_content_type');

    await run();

    expect(uploadReleaseAsset).toHaveBeenCalledWith({
      url: 'upload_url',
      headers: { 'content-type': 'asset_content_type', 'content-length': 17 },
      name: 'asset_name',
      file: Buffer.from(textFileContents)
    });
  });

  test('Get name from file', async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce('upload_url')
      .mockReturnValueOnce('single_file_folder_asset_path/singlefile.js') // asset_path
      .mockReturnValueOnce(undefined) // asset_name
      .mockReturnValueOnce('asset_content_type');

    await run();

    expect(uploadReleaseAsset).toHaveBeenCalledWith({
      url: 'upload_url',
      headers: { 'content-type': 'asset_content_type', 'content-length': 17 },
      name: 'singlefile.js',
      file: Buffer.from(textFileContents)
    });
  });

  test('Get type from file', async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce('upload_url')
      .mockReturnValueOnce('single_file_folder_asset_path/singlefile.js') // asset_path
      .mockReturnValueOnce('asset_name')
      .mockReturnValueOnce(undefined); // asset_content_type

    await run();

    expect(uploadReleaseAsset).toHaveBeenCalledWith({
      url: 'upload_url',
      headers: { 'content-type': 'application/javascript', 'content-length': 17 },
      name: 'asset_name',
      file: Buffer.from(textFileContents)
    });
  });

  test('Just upload exe files recursively, get type from file', async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce('upload_url')
      .mockReturnValueOnce('**/*.exe') // asset_path
      .mockReturnValueOnce(undefined) // asset_name
      .mockReturnValueOnce(undefined); // asset_content_type

    core.setOutput = jest.fn();

    await run();

    expect(uploadReleaseAsset).toHaveBeenCalledTimes(2);

    expect(uploadReleaseAsset).toHaveBeenNthCalledWith(1, {
      url: 'upload_url',
      headers: { 'content-type': 'application/x-msdos-program', 'content-length': 7 },
      name: 'test.exe',
      file: fakeFileSystem['some_build']['test.exe']
    });

    expect(uploadReleaseAsset).toHaveBeenNthCalledWith(2, {
      url: 'upload_url',
      headers: { 'content-type': 'application/x-msdos-program', 'content-length': 7 },
      name: 'test2.exe',
      file: fakeFileSystem['some_build']['test2.exe']
    });
  });

  test('Output is set with two files in a folder', async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce('upload_url')
      .mockReturnValueOnce('double_file_folder_asset_path') // asset_path
      .mockReturnValueOnce('asset_name')
      .mockReturnValueOnce('asset_content_type');

    core.setOutput = jest.fn();

    await run();

    expect(core.setOutput).toHaveBeenNthCalledWith(1, 'browser_download_url', [
      'browserDownloadUrl',
      'browserDownloadUrl'
    ]);
  });

  test('Action fails elegantly', async () => {
    core.getInput = jest
      .fn()
      .mockReturnValueOnce('upload_url')
      .mockReturnValueOnce('single_file_folder_asset_path') // asset_path
      .mockReturnValueOnce('asset_name')
      .mockReturnValueOnce('asset_content_type');

    uploadReleaseAsset.mockRestore();
    uploadReleaseAsset.mockImplementation(() => {
      throw new Error('Error uploading release asset');
    });

    core.setOutput = jest.fn();

    core.setFailed = jest.fn();

    await run();

    expect(uploadReleaseAsset).toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith('Error uploading release asset');
    expect(core.setOutput).toHaveBeenCalledTimes(0);
  });
});
