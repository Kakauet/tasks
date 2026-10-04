// Use the project's TypeScript compiler; no extra test framework or build artifacts.
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, ...args) {
  return resolve.call(this, id.startsWith('@/') ? path.resolve(__dirname, '..', id.slice(2)) : id, ...args);
};
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText, filename);
};
require('../tests/regressions.cjs');
require('../tests/data-and-activity.cjs');
