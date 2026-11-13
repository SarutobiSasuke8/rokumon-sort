'use strict';
// Loads the pure game logic straight out of index.html (the <script id="rs-core">
// block) into a Node VM, so the shipped file stays the single source of truth.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const INDEX = path.join(__dirname, '..', 'index.html');

function readIndex() {
  return fs.readFileSync(INDEX, 'utf8');
}

function coreSource(html = readIndex()) {
  const m = html.match(/<script id="rs-core">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('index.html has no <script id="rs-core"> block');
  return m[1];
}

function loadCore(html) {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(coreSource(html), sandbox, { filename: 'index.html#rs-core' });
  if (!sandbox.RokumonSortCore) throw new Error('rs-core did not define RokumonSortCore');
  return sandbox.RokumonSortCore;
}

module.exports = { loadCore, readIndex, INDEX };
