/**
 * Text Lab — Unicode (Rust WASM core), Hebrew, Morse blocks, canonical view.
 */

import {
  initializeUnicodeCore,
  toCanonical,
  serializeCanonical,
  engineVersion,
  getLoaderDiagnostics,
  getHealthReport,
  isUnicodeCoreReady,
  resetUnicodeCoreInit,
} from '../text/index.js?v=0.10.0';
import { hebrewAdapter } from '../scripts/index.js?v=0.10.0';
import {
  encodeMorseDetailed,
  decodeMorseDetailed,
  textToMorseBlock,
  blockTimeline,
  blockDuration,
} from '../codecs/morse/index.js?v=0.10.0';
import { digestCanonical } from '../digest/index.js?v=0.10.0';

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else if (k === 'value') node.value = v;
    else if (k === 'disabled') node.disabled = !!v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else if (c) node.appendChild(c);
  }
  return node;
}

function formatDiagPanel(err) {
  const lines = [];
  lines.push('Unicode Core WASM — initialization failed');
  lines.push('');
  if (err?.message) lines.push(String(err.message));
  const d = getLoaderDiagnostics();
  if (d?.probes?.length) {
    lines.push('');
    lines.push('Asset probes:');
    for (const p of d.probes) {
      const st = p.ok ? 'OK' : (p.error || `HTTP ${p.status}`);
      lines.push(`  [${p.kind || 'asset'}] ${p.url} → ${st}`);
    }
  }
  const h = getHealthReport();
  if (h) {
    lines.push('');
    lines.push(`Health: ${h.ok ? 'ok' : 'failed'} engine=${h.engineVersion || 'n/a'}`);
    if (h.checks) {
      for (const c of h.checks) {
        lines.push(`  ${c.name}: ${c.ok ? 'ok' : (c.error || 'fail')}`);
      }
    }
  }
  lines.push('');
  lines.push('Build: npm run build:wasm');
  lines.push('Deploy must serve pkg/unicode_core.js and pkg/unicode_core_bg.wasm');
  lines.push('There is no JavaScript fallback for Unicode semantics.');
  return lines.join('\n');
}

export function createTextLab(container, opts = {}) {
  const onDiagnostic = opts.onDiagnostic || (() => {});
  container.textContent = '';
  container.classList.add('text-lab');

  container.appendChild(el('div', {
    className: 'panel-title',
    textContent: 'Text Lab — Unicode (Rust core) · Hebrew · Morse blocks',
  }));
  container.appendChild(el('p', {
    className: 'diag-meta',
    textContent:
      'Canonical v1 preserves source exactly. Unicode semantics are owned by the Rust WASM engine. ' +
      'Morse never transliterates unsupported scripts. Hebrew marks and final forms are retained.',
  }));

  const status = el('p', {
    className: 'diag-meta',
    textContent: 'Initializing Unicode Core…',
  });
  container.appendChild(status);

  // NOT inspect-out — tests and layout query that for the main output panel only
  const diagBox = el('pre', {
    className: 'mono wasm-diag-panel',
    textContent: '',
  });
  diagBox.style.display = 'none';
  diagBox.style.whiteSpace = 'pre-wrap';
  diagBox.style.wordBreak = 'break-word';
  diagBox.style.maxHeight = '40vh';
  diagBox.style.overflow = 'auto';
  diagBox.style.fontSize = '12px';
  container.appendChild(diagBox);

  const inputPanel = el('section', { className: 'panel lab-panel' });
  inputPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Source text' }));
  const input = el('textarea', { className: 'mono', rows: '3', spellcheck: 'false' });
  input.value = '\u05e9\u05b8\u05c1\u05dc\u05d5\u05b9\u05dd ABC';
  inputPanel.appendChild(input);

  const ctrl = el('div', { className: 'btn-row' });
  const btnCanon = el('button', { type: 'button', className: 'btn', textContent: 'Canonicalize' });
  btnCanon.disabled = true;
  const btnHebrew = el('button', { type: 'button', className: 'btn', textContent: 'Hebrew parse' });
  const btnMorse = el('button', { type: 'button', className: 'btn', textContent: 'Morse encode' });
  const btnDecode = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Morse decode' });
  const btnDigest = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Digest preview' });
  btnDigest.disabled = true;
  const btnRetry = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Retry WASM' });
  btnRetry.style.display = 'none';
  ctrl.append(btnCanon, btnHebrew, btnMorse, btnDecode, btnDigest, btnRetry);
  inputPanel.appendChild(ctrl);

  const outPanel = el('section', { className: 'panel lab-panel' });
  outPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Output' }));
  const out = el('pre', {
    className: 'mono inspect-out',
    textContent: 'Waiting for Unicode Core WASM…',
  });
  outPanel.appendChild(out);

  container.append(inputPanel, outPanel);

  let coreReady = false;

  function setReady(version) {
    coreReady = true;
    const ver = version || engineVersion() || 'unknown';
    status.textContent = `Unicode Core READY · engine ${ver} (Rust WASM)`;
    btnCanon.disabled = false;
    btnDigest.disabled = false;
    btnRetry.style.display = 'none';
    diagBox.style.display = 'none';
    out.textContent =
      'Ready. Enter text above and choose an operation (Canonicalize, Hebrew parse, Morse, Digest).';
    onDiagnostic(`unicode-core ready ${ver}`, 'ok');
  }

  function setFailed(err) {
    coreReady = false;
    status.textContent = 'Unicode Core FAILED — see diagnostics below';
    btnCanon.disabled = true;
    btnDigest.disabled = true;
    btnRetry.style.display = '';
    diagBox.style.display = 'block';
    diagBox.textContent = formatDiagPanel(err);
    out.textContent =
      'Unicode operations unavailable until WASM loads.\n' +
      'Hebrew parse and Morse (non-Unicode-core) still work.';
    onDiagnostic(String(err?.message || err), 'error');
  }

  function boot() {
    status.textContent = 'Initializing Unicode Core…';
    initializeUnicodeCore()
      .then(() => {
        const h = getHealthReport();
        setReady(h?.engineVersion);
      })
      .catch((err) => setFailed(err));
  }

  btnRetry.addEventListener('click', () => {
    resetUnicodeCoreInit();
    boot();
  });

  boot();

  btnCanon.addEventListener('click', async () => {
    if (!coreReady || !isUnicodeCoreReady()) {
      out.textContent = 'Unicode Core not ready.';
      return;
    }
    try {
      const c = await toCanonical(input.value);
      out.textContent = serializeCanonical(c);
      onDiagnostic(`script=${c.script} graphemes=${c.graphemes.length}`, 'ok');
    } catch (e) {
      out.textContent = String(e?.message || e);
      onDiagnostic(String(e?.message || e), 'error');
    }
  });

  btnHebrew.addEventListener('click', () => {
    const p = hebrewAdapter.parse(input.value);
    const g = hebrewAdapter.gematriaStandard(input.value);
    out.textContent = JSON.stringify({ parse: p, gematria: g }, null, 2);
    onDiagnostic(`letters=${p.letterCount} niqqud=${p.niqqudCount}`, 'ok');
  });

  btnMorse.addEventListener('click', () => {
    const enc = encodeMorseDetailed(input.value, { strict: false });
    const block = textToMorseBlock(input.value, { strict: false });
    const timeline = blockTimeline(block);
    out.textContent = JSON.stringify({
      encode: enc,
      block: {
        schema: block.schema,
        profile: block.profile,
        letters: block.letters,
        durationUnits: blockDuration(block),
        timelineSample: timeline.slice(0, 24),
      },
    }, null, 2);
    onDiagnostic(enc.ok ? 'Morse ok' : `${enc.diagnostics.length} diagnostic(s)`, enc.ok ? 'ok' : 'info');
  });

  btnDecode.addEventListener('click', () => {
    const r = decodeMorseDetailed(input.value, { strict: false });
    out.textContent = JSON.stringify(r, null, 2);
    onDiagnostic(r.ok ? `decoded: ${r.text}` : 'decode issues', r.ok ? 'ok' : 'info');
  });

  btnDigest.addEventListener('click', async () => {
    if (!coreReady || !isUnicodeCoreReady()) {
      out.textContent = 'Unicode Core not ready — digest requires canonicalization.';
      return;
    }
    try {
      const c = await toCanonical(input.value);
      const d = digestCanonical(c);
      out.textContent = JSON.stringify(d, null, 2);
      onDiagnostic(d.hex.slice(0, 16) + '\u2026', 'ok');
    } catch (e) {
      out.textContent = String(e?.message || e);
      onDiagnostic(String(e?.message || e), 'error');
    }
  });

  return { refresh() {} };
}
