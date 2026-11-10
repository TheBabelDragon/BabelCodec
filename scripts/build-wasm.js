#!/usr/bin/env node
/**
 * Deterministic Unicode Core WASM build.
 * Canonical command: npm run build:wasm
 *
 * Produces:
 *   pkg/unicode_core.js
 *   pkg/unicode_core_bg.wasm
 *
 * Fails if either artifact is missing, empty, or JS does not reference the wasm.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RUST = join(ROOT, 'rust');
const PKG = join(ROOT, 'pkg');
const JS_OUT = join(PKG, 'unicode_core.js');
const WASM_OUT = join(PKG, 'unicode_core_bg.wasm');
const WASM_SRC = join(
  RUST,
  'target/wasm32-unknown-unknown/release/unicode_core.wasm',
);

const WASM_BINDGEN_VERSION = process.env.WASM_BINDGEN_VERSION || '0.2.100';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...opts.env },
  });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim();
    throw new Error(`${cmd} ${args.join(' ')} failed (exit ${r.status}):\n${err}`);
  }
  return r;
}

function ensureWasmBindgen() {
  const which = spawnSync('wasm-bindgen', ['--version'], { encoding: 'utf8' });
  if (which.status === 0) {
    const ver = (which.stdout || which.stderr || '').trim();
    console.log(`wasm-bindgen present: ${ver}`);
    if (ver.includes(WASM_BINDGEN_VERSION)) return;
    console.log(`version mismatch (want ${WASM_BINDGEN_VERSION}); reinstalling…`);
  } else {
    console.log(`Installing wasm-bindgen-cli ${WASM_BINDGEN_VERSION}…`);
  }
  run('cargo', [
    'install',
    'wasm-bindgen-cli',
    '--version',
    WASM_BINDGEN_VERSION,
    '--locked',
  ]);
}

function main() {
  console.log('=== BabelCodec Unicode Core WASM build ===');
  if (!existsSync(join(RUST, 'unicode-core/Cargo.toml'))) {
    throw new Error('rust/unicode-core not found');
  }

  if (!existsSync(join(RUST, 'Cargo.lock'))) {
    console.log('Generating Cargo.lock…');
    run('cargo', ['generate-lockfile'], { cwd: RUST });
  }

  ensureWasmBindgen();

  console.log('cargo build --release --target wasm32-unknown-unknown -p unicode-core');
  run(
    'cargo',
    [
      'build',
      '--release',
      '--target',
      'wasm32-unknown-unknown',
      '-p',
      'unicode-core',
    ],
    { cwd: RUST },
  );

  if (!existsSync(WASM_SRC) || statSync(WASM_SRC).size < 100) {
    throw new Error(`Missing or empty release wasm: ${WASM_SRC}`);
  }

  mkdirSync(PKG, { recursive: true });
  for (const f of [JS_OUT, WASM_OUT]) {
    if (existsSync(f)) rmSync(f);
  }

  console.log('wasm-bindgen --target web --out-dir pkg');
  run('wasm-bindgen', ['--target', 'web', '--out-dir', PKG, WASM_SRC]);

  if (!existsSync(JS_OUT)) throw new Error(`Missing ${JS_OUT}`);
  if (!existsSync(WASM_OUT)) throw new Error(`Missing ${WASM_OUT}`);

  const jsStat = statSync(JS_OUT);
  const wasmStat = statSync(WASM_OUT);
  if (jsStat.size < 50) throw new Error(`unicode_core.js too small (${jsStat.size} bytes)`);
  if (wasmStat.size < 100) throw new Error(`unicode_core_bg.wasm too small (${wasmStat.size} bytes)`);

  const jsText = readFileSync(JS_OUT, 'utf8');
  if (!jsText.includes('unicode_core_bg.wasm')) {
    throw new Error('Generated JS does not reference unicode_core_bg.wasm');
  }
  if (!jsText.includes('export') && !jsText.includes('init')) {
    throw new Error('Generated JS does not look like a wasm-bindgen web module');
  }

  console.log(`OK pkg/unicode_core.js (${jsStat.size} bytes)`);
  console.log(`OK pkg/unicode_core_bg.wasm (${wasmStat.size} bytes)`);
  console.log('WASM build complete.');
}

try {
  main();
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
