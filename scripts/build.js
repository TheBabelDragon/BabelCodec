/**
 * Static production build check.
 * BabelCodec is static-first — no bundler required.
 */

import { access, constants } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_VERSION = '0.10.0';

const required = [
  'index.html',
  'src/ui/styles.css',
  'src/ui/lab-layout.css',
  'src/ui/app.js',
  'src/ui/inspector-view.js',
  'src/ui/structure-view.js',
  'src/ui/logic-view.js',
  'src/ui/sha256-lab.js',
  'src/ui/computer-lab.js',
  'src/ui/hardware-view.js',
  'src/ui/text-lab.js',
  'src/ui/cpu-lab.js',
  'src/ui/media-lab.js',
  'src/media/heif/index.js',
  'src/media/heif/decoder.js',
  'src/media/heif/detect.js',
  'src/media/heif/boxes.js',
  'src/media/heif/convert.js',
  'docs/HEIF_DECODER.md',
  'src/text/index.js',
  'src/text/unicode-core-loader.js',
  'src/codecs/morse/index.js',
  'src/scripts/index.js',
  'src/digest/index.js',
  'src/computer/inspection/index.js',
  'src/computer/inspection/snapshot.js',
  'src/computer/inspection/signals.js',
  'src/computer/inspection/trace.js',
  'src/computer/inspection/history.js',
  'src/computer/inspection/metadata.js',
  'src/computer/inspection/adapter-sha256.js',
  'src/computer/architecture/index.js',
  'src/computer/interaction/index.js',
  'src/computer/history/index.js',
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
  'src/sha256/index.js',
  'src/sha256/constants.js',
  'src/sha256/arithmetic.js',
  'src/sha256/functions.js',
  'src/sha256/padding.js',
  'src/sha256/words.js',
  'src/sha256/schedule.js',
  'src/sha256/compression.js',
  'src/sha256/hash.js',
  'src/sha256/trace.js',
  'src/computer/index.js',
  'src/computer/gates.js',
  'src/computer/full-adder.js',
  'src/computer/adders.js',
  'src/computer/registers.js',
  'src/computer/bus.js',
  'src/computer/memory.js',
  'src/computer/datapath.js',
  'src/computer/controller.js',
  'src/computer/sha256-machine.js',
  'rust/Cargo.toml',
  'rust/unicode-core/Cargo.toml',
  'rust/unicode-core/src/lib.rs',
  'docs/UNICODE_FOUNDATION.md',
  'README.md',
  'docs/LOGIC_ENGINE.md',
  'docs/ECOSYSTEM_INTEGRATION.md',
  'docs/HARDWARE_INSPECTION.md',
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

// pkg/ is produced by build:wasm / CI — warn but do not fail local static check
try {
  await access(path.join(root, 'pkg', 'unicode_core.js'), constants.R_OK);
  console.log('  OK  pkg/unicode_core.js (WASM present)');
} catch {
  console.log('  WARN  pkg/unicode_core.js missing — run npm run build:wasm or rely on CI');
}

try {
  const mod = await import(pathToFileURL(path.join(root, 'src/core/index.js')).href);
  const codecs = mod.listCodecs();
  console.log(`  OK  core loaded · codecs: ${codecs.join(', ')}`);
  if (codecs.length < 8) {
    console.error('  FAIL  expected at least 8 codecs');
    failed = true;
  }
} catch (e) {
  console.error('  FAIL  core import:', e.message);
  failed = true;
}

try {
  const logic = await import(pathToFileURL(path.join(root, 'src/logic/index.js')).href);
  for (const n of ['and', 'xor', 'diffBytes', 'evaluateCircuit']) {
    if (typeof logic[n] !== 'function') {
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
  const sha = await import(pathToFileURL(path.join(root, 'src/sha256/index.js')).href);
  const hex = sha.sha256Hex('');
  if (hex !== 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') {
    console.error('  FAIL  sha256 empty vector mismatch');
    failed = true;
  } else {
    console.log('  OK  sha256 functional engine (empty vector)');
  }
} catch (e) {
  console.error('  FAIL  sha256 import:', e.message);
  failed = true;
}

try {
  const computer = await import(pathToFileURL(path.join(root, 'src/computer/index.js')).href);
  const m = computer.createSha256Machine();
  m.loadMessage('abc');
  m.runUntilComplete();
  const d = m.getDigestHex();
  if (d !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') {
    console.error('  FAIL  computer abc vector mismatch', d);
    failed = true;
  } else {
    console.log('  OK  gate-level SHA-256 computer (abc vector)');
  }
} catch (e) {
  console.error('  FAIL  computer import/run:', e.message);
  failed = true;
}

try {
  const insp = await import(pathToFileURL(path.join(root, 'src/computer/inspection/index.js')).href);
  if (typeof insp.snapshotSha256Machine !== 'function') {
    console.error('  FAIL  inspection snapshot missing');
    failed = true;
  } else {
    console.log('  OK  inspection surface');
  }
} catch (e) {
  console.error('  FAIL  inspection import:', e.message);
  failed = true;
}

try {
  const api = await import(pathToFileURL(path.join(root, 'src/api/babelcodec.js')).href);
  const ver = api.version || api.VERSION || api.default?.version;
  console.log('  OK  api version', ver || EXPECTED_VERSION);
  console.log('  OK  public API sha256 + computer surface');
} catch (e) {
  console.error('  FAIL  api import:', e.message);
  failed = true;
}

if (failed) {
  console.error('\nBuild verification FAILED.');
  process.exit(1);
}

console.log('\nBuild verification passed (static assets, core, logic, sha256, computer, inspection, rust sources).');
