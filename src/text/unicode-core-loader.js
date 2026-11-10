/**
 * WASM loader for the BabelCodec Unicode Core (Rust → wasm32-unknown-unknown).
 *
 * Rust is the sole canonical authority for grapheme, normalization, XID, script.
 * A missing WASM module produces a hard diagnostic. No silent JS fallback.
 *
 * GitHub Pages project site base: /BabelCodec/
 */

let wasmModule = null;
let initPromise = null;
let initError = null;

function candidateUrls() {
  const urls = [];
  // Relative to current page (works for file:// and /BabelCodec/)
  urls.push(new URL('pkg/unicode_core.js', document?.baseURI || location?.href || 'http://localhost/').href);
  urls.push('./pkg/unicode_core.js');
  urls.push('../pkg/unicode_core.js');
  // Project Pages absolute
  urls.push('/BabelCodec/pkg/unicode_core.js');
  urls.push('https://thebabeldragon.github.io/BabelCodec/pkg/unicode_core.js');
  // Relative to this module (src/text/ → ../../pkg)
  try {
    urls.push(new URL('../../pkg/unicode_core.js', import.meta.url).href);
  } catch {
    /* ignore */
  }
  // Root deploy
  urls.push('/pkg/unicode_core.js');
  return [...new Set(urls)];
}

export async function initializeUnicodeCore() {
  if (wasmModule) return true;
  if (initError) throw initError;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const candidates = candidateUrls();
    let lastErr = null;
    for (const url of candidates) {
      try {
        const mod = await import(/* @vite-ignore */ url);
        // wasm-bindgen --target web default export is init
        if (typeof mod.default === 'function') {
          await mod.default();
        } else if (typeof mod.init === 'function') {
          await mod.init();
        } else if (typeof mod.initSync === 'function') {
          // some builds
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
      `Unicode Core WASM failed to load. Tried: ${candidates.join(', ')}. ` +
        `Last error: ${lastErr?.message || lastErr}. ` +
        `Build: cd rust && cargo build --release --target wasm32-unknown-unknown -p unicode-core ` +
        `&& wasm-bindgen --target web --out-dir ../pkg target/wasm32-unknown-unknown/release/unicode_core.wasm`,
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
        'There is no JavaScript fallback implementation.',
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
