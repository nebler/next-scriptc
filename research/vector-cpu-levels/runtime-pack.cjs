// Source CLI's JS backend resolves the package and ignores SCRIPTC_RUNTIME_PACK.
// Redirect only this package lookup without editing the shared fork checkout.
const Module = require('node:module');
const path = require('node:path');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === '@scriptc/runtime-linux-x64-musl/package.json') {
    return path.join(process.env.SCRIPTC_RUNTIME_PACK, 'package.json');
  }
  return resolve.call(this, request, ...rest);
};
