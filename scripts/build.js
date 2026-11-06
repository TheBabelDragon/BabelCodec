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
  'README.md',
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
} catch (e) {
  console.error('  FAIL  core import:', e.message);
  failed = true;
}

if (failed) {
  console.error('\nBuild verification failed.');
  process.exit(1);
}

console.log('\nBuild verification passed (static assets present, core loads).');
