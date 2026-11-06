/**
 * Static production build check.
 * BabelCodec is static-first — no bundler required.
 */

import { access, constants } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const required = [
  'index.html',
  'src/ui/styles.css',
  'src/ui/app.js',
  'src/ui/inspector-view.js',
  'src/ui/structure-view.js',
  'src/ui/logic-view.js',
  'src/api/babelcodec.js',
  'src/core/index.js',
  'src/core/registry.js',
  'src/core/binary.js',
  'src/core/hex.js',
  'src/core/base64.js',
  'src/core/ascii.js',
  'src/core/utf8.js',
  'src/core/decimal.js',
  'src/core/octal.js',
  'src/core/morse.js',
  'src/core/inspector.js',
  'src/core/structure.js',
  'src/core/search.js',
  'src/core/hexgrid.js',
  'src/core/errors.js',
  'src/core/utils.js',
  'src/logic/index.js',
  'src/logic/gates.js',
  'src/logic/bitwise.js',
  'src/logic/masks.js',
  'src/logic/shifts.js',
  'src/logic/buffers.js',
  'src/logic/circuits.js',
  'README.md',
  'docs/LOGIC_ENGINE.md',
  'docs/ECOSYSTEM_INTEGRATION.md',
];

let failed = false;

for (const rel of required) {
  const abs = path.join(root, rel);
  try {
    await access(abs, constants.R_OK);
    console.log(`  OK  ${rel}`);
  } catch {
    console.error(`  MISSING  ${rel}`);
    failed = true;
  }
}

try {
  const mod = await import(pathToFileURL(path.join(root, 'src/core/index.js')).href);
  const codecs = mod.listCodecs();
  console.log(`  OK  core loaded · codecs: ${codecs.join(', ')}`);
  if (codecs.length < 8) {
    console.error('  FAIL  expected at least 8 codecs');
    failed = true;
  }
  if (typeof mod.interpretBytes !== 'function' || typeof mod.searchBytes !== 'function') {
    console.error('  FAIL  inspector APIs missing');
    failed = true;
  } else {
    console.log('  OK  interpretBytes + searchBytes present');
  }
  if (typeof mod.xor !== 'function' || typeof mod.diffBytes !== 'function') {
    console.error('  FAIL  logic APIs missing from core re-exports');
    failed = true;
  } else {
    console.log('  OK  logic re-exports present on core');
  }
} catch (e) {
  console.error('  FAIL  core import:', e.message);
  failed = true;
}

try {
  const logic = await import(pathToFileURL(path.join(root, 'src/logic/index.js')).href);
  const need = ['and', 'or', 'xor', 'not', 'nand', 'nor', 'xnor', 'applyMask', 'testBit',
    'andBytes', 'xorBytes', 'diffBytes', 'evaluateCircuit', 'generateTruthTable'];
  for (const n of need) {
    if (typeof logic[n] !== 'function' && logic[n] == null) {
      console.error(`  FAIL  logic missing ${n}`);
      failed = true;
    }
  }
  console.log('  OK  logic engine loaded');
} catch (e) {
  console.error('  FAIL  logic import:', e.message);
  failed = true;
}

try {
  const api = await import(pathToFileURL(path.join(root, 'src/api/babelcodec.js')).href);
  if (api.version !== '0.3.0') {
    console.error(`  FAIL  expected version 0.3.0, got ${api.version}`);
    failed = true;
  } else {
    console.log(`  OK  api version ${api.version}`);
  }
  if (typeof api.diffBytes !== 'function' || typeof api.evaluateCircuit !== 'function') {
    console.error('  FAIL  public API missing logic surface');
    failed = true;
  } else {
    console.log('  OK  public API logic surface');
  }
} catch (e) {
  console.error('  FAIL  api import:', e.message);
  failed = true;
}

if (failed) {
  console.error('\nBuild verification failed.');
  process.exit(1);
}

console.log('\nBuild verification passed (static assets present, core + logic load).');
