/**
 * Text Lab — Unicode (Rust WASM core), Hebrew, Morse blocks, canonical view.
 */

import {
  initializeUnicodeCore,
  toCanonical,
  serializeCanonical,
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
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else if (c) node.appendChild(c);
  }
  return node;
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

  const inputPanel = el('section', { className: 'panel lab-panel' });
  inputPanel.appendChild(el('div', { className: 'panel-title', textContent: 'Source text' }));
  const input = el('textarea', { className: 'mono', rows: '3', spellcheck: 'false' });
  input.value = '\u05e9\u05b8\u05c1\u05dc\u05d5\u05b9\u05dd ABC';
  inputPanel.appendChild(input);

  const ctrl = el('div', { className: 'btn-row' });
  const btnCanon = el('button', { type: 'button', className: 'btn', textContent: 'Canonicalize', disabled: 'true' });
  const btnHebrew = el('button', { type: 'button', className: 'btn', textContent: 'Hebrew parse' });
  const btnMorse = el('button', { type: 'button', className: 'btn', textContent: 'Morse encode' });
  const btnDecode = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Morse decode' });
  const btnDigest = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Digest preview', disabled: 'true' });
  ctrl.append(btnCanon, btnHebrew, btnMorse, btnDecode, btnDigest);
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

  initializeUnicodeCore()
    .then(() => {
      coreReady = true;
      status.textContent = 'Unicode Core ready (Rust WASM).';
      btnCanon.disabled = false;
      btnDigest.disabled = false;
      out.textContent =
        'Ready. Enter text above and choose an operation (Canonicalize, Hebrew parse, Morse, Digest).';
      onDiagnostic('unicode-core initialized', 'ok');
    })
    .catch((err) => {
      status.textContent = 'Unicode Core failed to load.';
      out.textContent =
        'ERROR: ' + (err?.message || err) +
        '\n\nBuild the WASM package and ensure pkg/unicode_core.js is served.\n' +
        'There is no JavaScript fallback implementation.';
      onDiagnostic(String(err?.message || err), 'error');
    });

  btnCanon.addEventListener('click', async () => {
    if (!coreReady) {
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
    if (!coreReady) {
      out.textContent = 'Unicode Core not ready.';
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
