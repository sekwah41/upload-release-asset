'use strict';

const path = require('path');

const fs = jest.createMockFromModule('fs');

// This is a custom function that our tests can use during setup to specify
// what the files on the "mock" filesystem should look like when any of the
// `fs` APIs are used.
let mockFiles = Object.create(null);
function __setMockFiles(newMockFiles) {
  mockFiles = Object.create(null);
  for (const file in newMockFiles) {
    const dir = path.dirname(file);
    const basename = path.basename(file);
    const folders = dir.split('/');

    let parentFolder = mockFiles;
    for (const folder of folders) {
      if (!parentFolder[folder]) {
        parentFolder[folder] = {};
        parentFolder = parentFolder[folder];
      }
    }
    parentFolder[basename] = newMockFiles[file];
  }
}

function getEntry(filePath) {
  const dir = path.dirname(filePath);
  const basename = path.basename(filePath);
  const folders = dir.split('/');
  let parentFolder = mockFiles;
  for (const folder of folders) {
    if (parentFolder === undefined) {
      return undefined;
    }
    parentFolder = parentFolder[folder];
  }
  return parentFolder[basename];
}

fs.__setMockFiles = __setMockFiles;

function stat(path) {
  path = path.slice(process.cwd().length + 1, path.length);
  return new Promise((res, rej) => {
    const entry = getEntry(path);
    if (entry === undefined) {
      rej(new Error("ENOENT: no such file or directory, stat '" + path + "'"));
    } else {
      res({
        isDirectory: () => typeof entry !== 'string'
      });
    }
  });
}

fs.promises = {
  access: jest.fn(),
  stat: stat,
  lstat: stat
};

module.exports = fs;
