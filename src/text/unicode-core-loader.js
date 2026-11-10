/**
 * WASM loader for BabelCodec Unicode Core (Rust → wasm32-unknown-unknown).
 *
 * Rust is the sole canonical authority. No JavaScript Unicode fallback.
 * Hard failures with actionable diagnostics. Retry after transient failures.
 */

let wasmModule = null;
let initPromise = null;
let initError = null;
let lastDiagnostics = null;
let healthReport = null;

const ASSET_JS = 'pkg/unicode_core.js';
const ASSET_WASM = 'pkg/unicode_core_bg.wasm';

/**
 * Derive project base path for GitHub Pages project sites and local dev.
 * Examples:
 *   https://thebabeldragon.github.io/BabelCodec/     → /BabelCodec/
 *   https://thebabeldragon.github.io/BabelCodec/x   → /BabelCodec/
 *   http://localhost:8080/                          → /
 *   file:///.../index.html                          → (relative only)
 */
export function resolveProjectBase(loc = typeof location !== 'undefined' ? location : null) {
  if (!loc || !loc.href) return '';
  try {
    const u = new URL(loc.href);
    if (u.protocol === 'file:') return '';
    // GitHub project pages: /<repo>/...
    const parts = u.pathname.split('/').filter(Boolean);
    if (u.hostname.endsWith('github.io') && parts.length >= 1) {
      return `/${parts[0]}/`;
    }
    // Prefer directory of the current page
    if (u.pathname.endsWith('/')) return u.pathname;
    const dir = u.pathname.replace(/\/[^/]*$/, '/');
    return dir || '/';
  } catch {
    return '';
  }
}

export function candidateJsUrls(loc = typeof location !== 'undefined' ? location : null) {
  const urls = [];
  const base = resolveProjectBase(loc);

  if (base) {
    urls.push(`${base}${ASSET_JS}`);
  }

  // Relative to current document
  if (typeof document !== 'undefined' && document.baseURI) {
    try {
      urls.push(new URL(ASSET_JS, document.baseURI).href);
    } catch { /* ignore */ }
  }

  urls.push(`./${ASSET_JS}`);
  urls.push(`../${ASSET_JS}`);

  // Module-relative (src/text → ../../pkg)
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      urls.push(new URL(`../../${ASSET_JS}`, import.meta.url).href);
    }
  } catch { /* ignore */ }

  // Known production host (last resort, not preferred over same-origin)
  urls.push(`https://thebabeldragon.github.io/BabelCodec/${ASSET_JS}`);

  // Deduplicate while preserving order
  return [...new Set(urls.filter(Boolean))];
}

async function probeAsset(url, expectKind) {
  const diag = { url, ok: false, status: null, contentType: null, error: null, kind: expectKind };
  try {
    const res = await fetch(url, { method: 'GET', cache: 'no-cache' });
    diag.status = res.status;
    diag.contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      diag.error = `HTTP ${res.status}`;
      return diag;
    }
    if (expectKind === 'js') {
      const text = await res.text();
      if (text.length < 50) {
        diag.error = 'JS body too small';
        return diag;
      }
      if (text.trimStart().startsWith('<!')) {
        diag.error = 'Got HTML instead of JavaScript (likely 404 page)';
        return diag;
      }
      if (!text.includes('unicode_core_bg.wasm') && !text.includes('wasm')) {
        diag.error = 'JS does not look like wasm-bindgen output';
        return diag;
      }
      // MIME is soft — GH Pages may serve application/octet-stream or text/javascript
      diag.ok = true;
      return diag;
    }
    if (expectKind === 'wasm') {
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 100) {
        diag.error = 'WASM body too small';
        return diag;
      }
      const bytes = new Uint8Array(buf);
      // \0asm magic
      if (bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
        diag.error = 'Not a valid WASM binary (missing \0asm magic)';
        return diag;
      }
      diag.ok = true;
      diag.bytes = buf.byteLength;
      return diag;
    }
    diag.ok = true;
    return diag;
  } catch (e) {
    diag.error = e?.message || String(e);
    return diag;
  }
}

function stringToUtf16Units(str) {
  if (typeof str !== 'string') return new Uint16Array(0);
  const units = new Uint16Array(str.length);
  for (let i = 0; i < str.length; i++) units[i] = str.charCodeAt(i);
  return units;
}

/**
 * Runtime health check — real exported ops, not just module presence.
 */
export async function runHealthCheck(mod) {
  const report = { ok: false, engineVersion: null, checks: [], error: null };
  try {
    if (typeof mod.engine_version === 'function') {
      report.engineVersion = mod.engine_version();
      report.checks.push({ name: 'engine_version', ok: !!report.engineVersion, value: report.engineVersion });
    } else {
      report.checks.push({ name: 'engine_version', ok: false, error: 'missing export' });
    }

    const samples = [
      { name: 'ascii', text: 'BabelCodec', profile: 'NONE' },
      { name: 'hebrew', text: '\u05e9\u05b8\u05c1\u05dc\u05d5\u05b9\u05dd', profile: 'NONE' },
      { name: 'combining', text: 'e\u0301', profile: 'NFC' },
      { name: 'supplementary', text: '\uD801\uDC37', profile: 'NONE' }, // U+10437
      { name: 'emoji', text: '\uD83D\uDC4B', profile: 'NONE' }, // 👋
    ];

    for (const s of samples) {
      const units = stringToUtf16Units(s.text);
      if (typeof mod.inspectFromUtf16 !== 'function') {
        report.checks.push({ name: `inspect:${s.name}`, ok: false, error: 'missing inspectFromUtf16' });
        continue;
      }
      const insp = await mod.inspectFromUtf16(units, s.profile);
      const sourceOk = insp && insp.source && typeof insp.source.text === 'string';
      // Source must preserve identity when no normalization change required for identity check
      const graphemesOk = Array.isArray(insp?.graphemes);
      report.checks.push({
        name: `inspect:${s.name}`,
        ok: sourceOk && graphemesOk,
        graphemes: insp?.graphemes?.length,
        sourceLen: insp?.source?.text?.length,
      });
    }

    // Normalization
    if (typeof mod.normalizeFromUtf16 === 'function') {
      const n = await mod.normalizeFromUtf16(stringToUtf16Units('e\u0301'), 'NFC');
      report.checks.push({
        name: 'normalize:NFC',
        ok: n && n.changed === true && typeof n.text === 'string',
        changed: n?.changed,
      });
    }

    // Graphemes combining
    if (typeof mod.segmentGraphemesFromUtf16 === 'function') {
      const g = await mod.segmentGraphemesFromUtf16(stringToUtf16Units('e\u0301'));
      report.checks.push({
        name: 'graphemes:combining',
        ok: Array.isArray(g) && g.length === 1,
        count: Array.isArray(g) ? g.length : null,
      });
    }

    report.ok = report.checks.every((c) => c.ok);
    if (!report.ok) {
      report.error = 'One or more health checks failed';
    }
  } catch (e) {
    report.ok = false;
    report.error = e?.message || String(e);
  }
  return report;
}

export function getLoaderDiagnostics() {
  return lastDiagnostics ? { ...lastDiagnostics } : null;
}

export function getHealthReport() {
  return healthReport ? { ...healthReport } : null;
}

/**
 * Reset failed init so callers can retry after a transient failure.
 */
export function resetUnicodeCoreInit() {
  if (wasmModule) return;
  initPromise = null;
  initError = null;
}

export async function initializeUnicodeCore(options = {}) {
  if (wasmModule) return true;
  if (initPromise) return initPromise;

  const allowRetry = options.allowRetry !== false;

  initPromise = (async () => {
    const candidates = candidateJsUrls();
    const probes = [];
    let lastErr = null;
    let loadedUrl = null;

    for (const url of candidates) {
      const jsProbe = await probeAsset(url, 'js');
      probes.push(jsProbe);
      if (!jsProbe.ok) {
        lastErr = new Error(`JS probe failed for ${url}: ${jsProbe.error}`);
        continue;
      }

      // Probe sibling wasm
      const wasmUrl = url.replace(/unicode_core\.js(\?.*)?$/, 'unicode_core_bg.wasm$1');
      const wasmProbe = await probeAsset(wasmUrl, 'wasm');
      probes.push(wasmProbe);
      if (!wasmProbe.ok) {
        lastErr = new Error(`WASM probe failed for ${wasmUrl}: ${wasmProbe.error}`);
        continue;
      }

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

        const health = await runHealthCheck(mod);
        healthReport = health;
        if (!health.ok) {
          lastErr = new Error(
            `WASM loaded from ${url} but health check failed: ${health.error}. ` +
              `Checks: ${JSON.stringify(health.checks)}`,
          );
          continue;
        }

        wasmModule = mod;
        loadedUrl = url;
        lastDiagnostics = {
          ok: true,
          loadedUrl,
          engineVersion: health.engineVersion,
          probes,
          health,
        };
        initError = null;
        return true;
      } catch (e) {
        lastErr = e;
        probes.push({
          url,
          ok: false,
          error: e?.message || String(e),
          kind: 'import',
        });
      }
    }

    const detail = probes
      .map((p) => `${p.kind || 'asset'} ${p.url}: ${p.ok ? 'ok' : p.error || `HTTP ${p.status}`}`)
      .join(' | ');

    const err = new Error(
      `Unicode Core WASM failed to load. Tried: ${candidates.join(', ')}. ` +
        `Last error: ${lastErr?.message || lastErr}. Probes: ${detail}. ` +
        `Build: npm run build:wasm`,
    );
    err.cause = lastErr;
    err.probes = probes;

    lastDiagnostics = { ok: false, probes, error: err.message };

    if (allowRetry) {
      // Do not permanently cache failure — allow a later retry
      initPromise = null;
      initError = null;
    } else {
      initError = err;
    }
    throw err;
  })();

  try {
    return await initPromise;
  } catch (e) {
    if (allowRetry) initPromise = null;
    throw e;
  }
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

export { stringToUtf16Units };

export async function inspectCanonical(text, normalizationProfile = 'NONE') {
  await initializeUnicodeCore();
  const core = getUnicodeCore();
  return core.inspectFromUtf16(stringToUtf16Units(text), normalizationProfile || 'NONE');
}

export async function normalize(text, profile) {
  await initializeUnicodeCore();
  const core = getUnicodeCore();
  return core.normalizeFromUtf16(stringToUtf16Units(text), profile);
}

export async function segmentGraphemes(text) {
  await initializeUnicodeCore();
  const core = getUnicodeCore();
  return core.segmentGraphemesFromUtf16(stringToUtf16Units(text));
}

export async function detectScripts(text) {
  await initializeUnicodeCore();
  const core = getUnicodeCore();
  return core.detectScriptsFromUtf16(stringToUtf16Units(text));
}

export async function isXidIdentifier(text) {
  await initializeUnicodeCore();
  const core = getUnicodeCore();
  return core.isXidIdentifierFromUtf16(stringToUtf16Units(text));
}

export function engineVersion() {
  if (!wasmModule) return null;
  return wasmModule.engine_version?.() ?? null;
}
