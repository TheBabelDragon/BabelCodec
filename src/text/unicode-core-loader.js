/**
 * WASM loader for the BabelCodec Unicode Core (Rust → wasm32-unknown-unknown).
 *
 * Rust is the sole canonical authority for grapheme, normalization, XID, script.
 * A missing WASM module produces a hard diagnostic. No silent JS fallback.
 */

let wasmModule = null;
let initPromise = null;
let initError = null;

const WASM_URL_CANDIDATES = [
  './pkg/unicode_core.js',
  '../pkg/unicode_core.js',
  '/pkg/unicode_core.js',
  new URL('../../pkg/unicode_core.js', import.meta.url).href,
];

export async function initializeUnicodeCore() {
  if (wasmModule) return true;
  if (initError) throw initError;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let lastErr = null;
    for (const url of WASM_URL_CANDIDATES) {
      try {
        const mod = await import(/* @vite-ignore */ url);
        if (typeof mod.default === 'function') {
          await mod.default();
        } else if (typeof mod.init === 'function') {
          await mod.init();
        }
        if (typeof mod.initializeUnicodeCore === 'function') {
          mod.initializeUnicodeCore();
        }
        wasmModule = mod;
        return true;
      } catch (e) {
        lastErr = e;
      }
    }
    initError = new Error(
      `Unicode Core WASM failed to load. Tried: ${WASM_URL_CANDIDATES.join(', ')}. ` +
        `Last error: ${lastErr?.message || lastErr}. ` +
        `Build: cd rust && cargo build --release --target wasm32-unknown-unknown ` +
        `&& wasm-bindgen --target web --out-dir ../pkg target/wasm32-unknown-unknown/release/unicode_core.wasm`
    );
    throw initError;
  })();

  return initPromise;
}

export function isUnicodeCoreReady() {
  return wasmModule !== null;
}

export function getUnicodeCore() {
  if (!wasmModule) {
    throw new Error(
      'Unicode Core WASM is not initialized. Call await initializeUnicodeCore() first. ' +
        'There is no JavaScript fallback implementation.'
    );
  }
  return wasmModule;
}

export function stringToUtf16Units(str) {
  if (typeof str !== 'string') return new Uint16Array(0);
  const units = new Uint16Array(str.length);
  for (let i = 0; i < str.length; i++) {
    units[i] = str.charCodeAt(i);
  }
  return units;
}

export async function inspectCanonical(text, normalizationProfile = 'NONE') {
  await initializeUnicodeCore();
  const core = getUnicodeCore();
  const units = stringToUtf16Units(text);
  return core.inspectFromUtf16(units, normalizationProfile || 'NONE');
}

export async function normalize(text, profile) {
  await initializeUnicodeCore();
  const core = getUnicodeCore();
  const units = stringToUtf16Units(text);
  return core.normalizeFromUtf16(units, profile);
}

export async function segmentGraphemes(text) {
  await initializeUnicodeCore();
  const core = getUnicodeCore();
  const units = stringToUtf16Units(text);
  return core.segmentGraphemesFromUtf16(units);
}

export async function detectScripts(text) {
  await initializeUnicodeCore();
  const core = getUnicodeCore();
  const units = stringToUtf16Units(text);
  return core.detectScriptsFromUtf16(units);
}

export async function isXidIdentifier(text) {
  await initializeUnicodeCore();
  const core = getUnicodeCore();
  const units = stringToUtf16Units(text);
  return core.isXidIdentifierFromUtf16(units);
}

export function engineVersion() {
  if (!wasmModule) return null;
  return wasmModule.engine_version?.() ?? null;
}
