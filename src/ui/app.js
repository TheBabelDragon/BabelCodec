/**
 * BabelCodec UI — conversion engine stays independent of DOM.
 */
import * as BC from '../api/babelcodec.js';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
let currentBytes = null;
const $ = (s) => document.querySelector(s);
const els = {};

function init() {
  Object.assign(els, {
    input: $('#input-area'),
    output: $('#output-area'),
    fromFormat: $('#from-format'),
    toFormat: $('#to-format'),
    textEncoding: $('#text-encoding'),
    diagnostics: $('#diagnostics'),
    inspectorBody: $('#inspector-body'),
    liveToggle: $('#live-convert'),
    fileMeta: $('#file-meta'),
  });
  const formats = [
    ['text', 'Text'], ['bytes', 'Raw bytes'], ['binary', 'Binary'],
    ['hex', 'Hexadecimal'], ['base64', 'Base64'], ['decimal', 'Decimal'],
    ['octal', 'Octal'], ['ascii', 'ASCII (strict)'], ['utf8', 'UTF-8'], ['morse', 'Morse'],
  ];
  for (const sel of [els.fromFormat, els.toFormat]) {
    sel.innerHTML = formats.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  }
  els.fromFormat.value = 'text';
  els.toFormat.value = 'hex';
  $('#btn-convert').addEventListener('click', runConvert);
  $('#btn-swap').addEventListener('click', () => {
    [els.input.value, els.output.value] = [els.output.value, els.input.value];
    [els.fromFormat.value, els.toFormat.value] = [els.toFormat.value, els.fromFormat.value];
    if (els.liveToggle.checked) runConvert();
  });
  $('#btn-clear').addEventListener('click', () => {
    els.input.value = ''; els.output.value = ''; currentBytes = null;
    els.fileMeta.textContent = ''; $('#file-input').value = '';
    renderEmptyInspector(); setDiagnostics('Cleared.', 'info');
  });
  $('#btn-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(els.output.value); setDiagnostics('Copied.', 'ok'); }
    catch { els.output.select(); document.execCommand('copy'); setDiagnostics('Copied.', 'ok'); }
  });
  $('#btn-download').addEventListener('click', () => {
    const blob = currentBytes
      ? new Blob([currentBytes], { type: 'application/octet-stream' })
      : new Blob([els.output.value], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = currentBytes ? 'babelcodec-output.bin' : 'babelcodec-output.txt';
    a.click(); URL.revokeObjectURL(a.href);
  });
  $('#btn-load').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', onFileSelected);
  els.input.addEventListener('input', () => { if (els.liveToggle.checked) runConvert(); });
  for (const el of [els.fromFormat, els.toFormat, els.textEncoding]) {
    el.addEventListener('change', () => { if (els.liveToggle.checked) runConvert(); });
  }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runConvert(); }
  });
  setDiagnostics('Ready. Enter input or load a file.', 'info');
  renderEmptyInspector();
}

function getTextEncoding() {
  return els.textEncoding.value === 'ascii' ? 'ascii' : 'utf8';
}

function runConvert() {
  const from = els.fromFormat.value;
  const to = els.toFormat.value;
  const encoding = getTextEncoding();
  const input = els.input.value;
  try {
    let fromFmt = from, toFmt = to;
    const opts = { encoding };
    if (from === 'ascii') { fromFmt = 'text'; opts.encoding = 'ascii'; }
    else if (from === 'utf8') { fromFmt = 'text'; opts.encoding = 'utf8'; }
    if (to === 'ascii') { toFmt = 'text'; opts.encoding = 'ascii'; }
    else if (to === 'utf8') { toFmt = 'text'; opts.encoding = 'utf8'; }

    let result;
    if (from === 'bytes') {
      const bytes = new Uint8Array(input.length);
      for (let i = 0; i < input.length; i++) bytes[i] = input.charCodeAt(i) & 0xff;
      result = BC.convert(bytes, 'bytes', toFmt, opts);
    } else {
      result = BC.convert(input, fromFmt, toFmt, opts);
    }
    const out = result.output;
    if (out instanceof Uint8Array) {
      currentBytes = out;
      els.output.value = BC.encodeHex(out, { separator: ' ' });
      setDiagnostics(`OK · ${out.length} byte(s) → hex · ${from} → ${to}`, 'ok');
      renderInspector(out);
    } else {
      els.output.value = out;
      try {
        if (['hex','binary','base64','decimal','octal'].includes(to)) {
          currentBytes = BC.convert(out, to, 'bytes').output;
          renderInspector(currentBytes);
          setDiagnostics(`OK · ${currentBytes.length} byte(s) · ${from} → ${to}`, 'ok');
        } else if (['text','ascii','utf8'].includes(from)) {
          currentBytes = BC.convert(input, 'text', 'bytes', { encoding: opts.encoding }).output;
          renderInspector(currentBytes);
          setDiagnostics(`OK · ${currentBytes.length} byte(s) · ${from} → ${to}`, 'ok');
        } else {
          currentBytes = null;
          renderEmptyInspector('Output is text; convert via a binary format to inspect.');
          setDiagnostics(`OK · ${from} → ${to}`, 'ok');
        }
      } catch {
        currentBytes = null;
        renderEmptyInspector();
        setDiagnostics(`OK · ${from} → ${to}`, 'ok');
      }
    }
  } catch (e) {
    const code = e.code ? ` [${e.code}]` : '';
    setDiagnostics(`Error${code}: ${e.message || e}`, 'err');
    els.output.value = '';
  }
}

async function onFileSelected(ev) {
  const file = ev.target.files?.[0];
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    setDiagnostics(`File too large: ${file.size} bytes (limit ${MAX_FILE_BYTES}).`, 'err');
    return;
  }
  try {
    currentBytes = new Uint8Array(await file.arrayBuffer());
    els.fileMeta.textContent = `${file.name} · ${file.size} bytes`;
    els.input.value = BC.encodeHex(currentBytes, { separator: ' ' });
    els.fromFormat.value = 'hex';
    els.toFormat.value = 'base64';
    renderInspector(currentBytes);
    setDiagnostics(`Loaded ${file.name}: ${currentBytes.length} bytes.`, 'ok');
    if (els.liveToggle.checked) runConvert();
  } catch (e) {
    setDiagnostics(`File read failed: ${e.message}`, 'err');
  }
}

function renderInspector(bytes) {
  if (!bytes || bytes.length === 0) {
    renderEmptyInspector(bytes && bytes.length === 0 ? 'Empty buffer (0 bytes).' : null);
    return;
  }
  const inspection = BC.inspectBytes(bytes, { mode: 'utf8' });
  const maxRows = 4096;
  const rows = inspection.rows.slice(0, maxRows);
  let html = `<table class="inspector-table" role="table" aria-label="Byte inspector">
    <thead><tr><th>Offset</th><th>Dec</th><th>Hex</th><th>Binary</th><th>Char</th><th>UTF-8</th></tr></thead><tbody>`;
  for (const r of rows) {
    const utf8 = r.utf8Error
      ? `<span class="utf8-error">${esc(r.utf8Error)}</span>`
      : (r.isLead && r.utf8Char != null ? esc(r.utf8Char) : (r.isLead ? '' : '·'));
    html += `<tr><td class="col-offset">${r.offset}</td><td class="col-dec">${r.decimal}</td>
      <td class="col-hex">${r.hex}</td><td class="col-bin">${r.binary}</td>
      <td class="col-char ${r.printable ? '' : 'nonprint'}">${esc(r.display)}</td><td>${utf8}</td></tr>`;
  }
  html += '</tbody></table>';
  if (inspection.rows.length > maxRows) {
    html += `<p class="empty-inspector">Showing first ${maxRows} of ${inspection.rows.length} bytes.</p>`;
  }
  els.inspectorBody.innerHTML = html;
}

function renderEmptyInspector(msg) {
  els.inspectorBody.innerHTML = `<div class="empty-inspector">${esc(msg || 'No bytes to inspect. Convert or load a file.')}</div>`;
}

function setDiagnostics(message, kind) {
  const cls = kind === 'ok' ? 'diag-ok' : kind === 'err' ? 'diag-err' : 'diag-info';
  els.diagnostics.innerHTML = `<span class="${cls}">${esc(message)}</span>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
