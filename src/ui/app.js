/**
 * BabelCodec UI — conversion engine stays independent of DOM.
 * Security: all untrusted strings use textContent / esc(); no unsafe innerHTML.
 */
import * as BC from '../api/babelcodec.js?v=0.4.0';
import { createInspectorView } from './inspector-view.js?v=0.4.0';
import { createStructureView } from './structure-view.js?v=0.4.0';
import { createLogicView } from './logic-view.js?v=0.4.0';
import { createSha256Lab } from './sha256-lab.js?v=0.4.0';
import { createComputerLab } from './computer-lab.js?v=0.4.0';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
let currentBytes = null;
const $ = (s) => document.querySelector(s);
const els = {};
let inspectorView = null;
let structureView = null;
let logicView = null;
let sha256View = null;
let computerView = null;

function init() {
  Object.assign(els, {
    input: $('#input-area'),
    output: $('#output-area'),
    fromFormat: $('#from-format'),
    toFormat: $('#to-format'),
    textEncoding: $('#text-encoding'),
    diagnostics: $('#diagnostics'),
    fileMeta: $('#file-meta'),
    viewConverter: $('#view-converter'),
    viewInspector: $('#view-inspector'),
    viewStructure: $('#view-structure'),
    viewLogic: $('#view-logic'),
    viewSha256: $('#view-sha256'),
    viewComputer: $('#view-computer'),
  });

  const formats = [
    ['text', 'Text'],
    ['bytes', 'Raw bytes (hex)'],
    ['binary', 'Binary'],
    ['hex', 'Hexadecimal'],
    ['base64', 'Base64'],
    ['decimal', 'Decimal'],
    ['octal', 'Octal'],
    ['ascii', 'ASCII (strict)'],
    ['utf8', 'UTF-8'],
    ['morse', 'Morse'],
  ];
  for (const sel of [els.fromFormat, els.toFormat]) {
    sel.textContent = '';
    for (const [v, l] of formats) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = l;
      sel.appendChild(opt);
    }
  }
  els.fromFormat.value = 'text';
  els.toFormat.value = 'hex';

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  $('#btn-convert').addEventListener('click', runConvert);
  $('#btn-swap').addEventListener('click', () => {
    [els.input.value, els.output.value] = [els.output.value, els.input.value];
    [els.fromFormat.value, els.toFormat.value] = [els.toFormat.value, els.fromFormat.value];
    if ($('#live-convert').checked) runConvert();
  });
  $('#btn-clear').addEventListener('click', () => {
    els.input.value = '';
    els.output.value = '';
    currentBytes = null;
    els.fileMeta.textContent = '';
    $('#file-input').value = '';
    pushBytesToViews(null);
    setDiagnostics('Cleared.', 'info');
  });
  $('#btn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.output.value);
      setDiagnostics('Copied.', 'ok');
    } catch {
      els.output.select();
      document.execCommand('copy');
      setDiagnostics('Copied.', 'ok');
    }
  });
  $('#btn-download').addEventListener('click', () => {
    if (!currentBytes && !els.output.value) {
      setDiagnostics('Nothing to download.', 'err');
      return;
    }
    const blob = currentBytes
      ? new Blob([currentBytes], { type: 'application/octet-stream' })
      : new Blob([els.output.value], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = currentBytes ? 'babelcodec-output.bin' : 'babelcodec-output.txt';
    a.click();
    URL.revokeObjectURL(url);
    setDiagnostics(
      currentBytes
        ? `Downloaded ${currentBytes.length} byte(s).`
        : 'Downloaded text output.',
      'ok',
    );
  });
  $('#btn-load').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', onFileSelected);
  els.input.addEventListener('input', () => {
    if ($('#live-convert').checked) runConvert();
  });
  for (const el of [els.fromFormat, els.toFormat, els.textEncoding]) {
    el.addEventListener('change', () => {
      if ($('#live-convert').checked) runConvert();
    });
  }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runConvert();
    }
  });

  inspectorView = createInspectorView($('#hex-inspector-root'), {
    onSelectionChange: (sel, slice) => {
      if (structureView) structureView.setSelection(sel, slice);
      const transferBtn = document.getElementById('btn-to-logic');
      if (transferBtn) transferBtn.disabled = !(slice && slice.length);
    },
    onDiagnostic: setDiagnostics,
  });
  structureView = createStructureView($('#structure-root'), {
    onDiagnostic: setDiagnostics,
  });
  logicView = createLogicView($('#logic-root'), {
    onDiagnostic: setDiagnostics,
  });
  sha256View = createSha256Lab($('#sha256-root'), {
    onDiagnostic: setDiagnostics,
    onSendToComputer: (bytes) => {
      if (computerView) {
        computerView.loadBytes(bytes);
        switchTab('computer');
      }
    },
  });
  computerView = createComputerLab($('#computer-root'), {
    onDiagnostic: setDiagnostics,
  });

  const transferBtn = document.createElement('button');
  transferBtn.type = 'button';
  transferBtn.className = 'btn btn-ghost';
  transferBtn.id = 'btn-to-logic';
  transferBtn.textContent = '\u2192 Logic Lab';
  transferBtn.title = 'Send current selection to Logic Lab operand A';
  transferBtn.disabled = true;
  transferBtn.addEventListener('click', () => {
    if (!inspectorView) return;
    const bytes = inspectorView.getBytes?.();
    const sel = inspectorView.getSelection?.();
    if (!bytes || !sel || !sel.length) {
      setDiagnostics('Select bytes in the Hex Inspector first.', 'info');
      return;
    }
    const slice = bytes.slice(sel.start, sel.end);
    if (logicView) logicView.setOperandA(slice);
    switchTab('logic');
  });
  const transferSha = document.createElement('button');
  transferSha.type = 'button';
  transferSha.className = 'btn btn-ghost';
  transferSha.id = 'btn-to-sha256';
  transferSha.textContent = '\u2192 SHA-256';
  transferSha.title = 'Send current selection to SHA-256 Lab';
  transferSha.addEventListener('click', () => {
    if (!inspectorView) return;
    const bytes = inspectorView.getBytes?.();
    const sel = inspectorView.getSelection?.();
    if (!bytes || !sel || !sel.length) {
      setDiagnostics('Select bytes in the Hex Inspector first.', 'info');
      return;
    }
    const slice = bytes.slice(sel.start, sel.end);
    if (sha256View) sha256View.setBytes(slice);
    switchTab('sha256');
  });
  const headerActions = document.querySelector('.header-actions');
  if (headerActions) {
    headerActions.insertBefore(transferSha, headerActions.firstChild);
    headerActions.insertBefore(transferBtn, headerActions.firstChild);
  }

  setDiagnostics('Ready. Enter input or load a file.', 'info');
  switchTab('converter');
}

function switchTab(name) {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === name);
    btn.setAttribute('aria-selected', btn.dataset.tab === name ? 'true' : 'false');
  });
  els.viewConverter.hidden = name !== 'converter';
  els.viewInspector.hidden = name !== 'inspector';
  els.viewStructure.hidden = name !== 'structure';
  if (els.viewLogic) els.viewLogic.hidden = name !== 'logic';
  if (els.viewSha256) els.viewSha256.hidden = name !== 'sha256';
  if (els.viewComputer) els.viewComputer.hidden = name !== 'computer';
  if (name === 'inspector' && inspectorView) inspectorView.refresh();
  if (name === 'computer' && computerView) computerView.refresh();
  if (name === 'structure' && structureView) structureView.refresh();
  if (name === 'logic' && logicView) logicView.refresh();
}

function pushBytesToViews(bytes) {
  if (inspectorView) inspectorView.setBytes(bytes);
  if (structureView) structureView.setBytes(bytes);
}

function getTextEncoding() {
  return els.textEncoding.value === 'ascii' ? 'ascii' : 'utf8';
}

function parseRawBytesInput(text) {
  return BC.decodeHex(text);
}

function runConvert() {
  const from = els.fromFormat.value;
  const to = els.toFormat.value;
  const encoding = getTextEncoding();
  const input = els.input.value;
  try {
    let fromFmt = from;
    let toFmt = to;
    const opts = { encoding };
    if (from === 'ascii') {
      fromFmt = 'text';
      opts.encoding = 'ascii';
    } else if (from === 'utf8') {
      fromFmt = 'text';
      opts.encoding = 'utf8';
    }
    if (to === 'ascii') {
      toFmt = 'text';
      opts.encoding = 'ascii';
    } else if (to === 'utf8') {
      toFmt = 'text';
      opts.encoding = 'utf8';
    }

    let result;
    if (from === 'bytes') {
      const bytes = parseRawBytesInput(input);
      result = BC.convert(bytes, 'bytes', toFmt, opts);
    } else {
      result = BC.convert(input, fromFmt, toFmt, opts);
    }
    const out = result.output;
    if (out instanceof Uint8Array) {
      currentBytes = out;
      els.output.value = BC.encodeHex(out, { separator: ' ' });
      setDiagnostics(`OK \u00b7 ${out.length} byte(s) -> hex \u00b7 ${from} -> ${to}`, 'ok');
      pushBytesToViews(out);
    } else {
      els.output.value = out;
      try {
        if (['hex', 'binary', 'base64', 'decimal', 'octal'].includes(to)) {
          currentBytes = BC.convert(out, to, 'bytes').output;
          pushBytesToViews(currentBytes);
          setDiagnostics(`OK \u00b7 ${currentBytes.length} byte(s) \u00b7 ${from} -> ${to}`, 'ok');
        } else if (['text', 'ascii', 'utf8'].includes(from)) {
          currentBytes = BC.convert(input, 'text', 'bytes', {
            encoding: opts.encoding,
          }).output;
          pushBytesToViews(currentBytes);
          setDiagnostics(`OK \u00b7 ${currentBytes.length} byte(s) \u00b7 ${from} -> ${to}`, 'ok');
        } else {
          currentBytes = null;
          pushBytesToViews(null);
          setDiagnostics(`OK \u00b7 ${from} -> ${to}`, 'ok');
        }
      } catch {
        currentBytes = null;
        pushBytesToViews(null);
        setDiagnostics(`OK \u00b7 ${from} -> ${to}`, 'ok');
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
    setDiagnostics(
      `File too large: ${file.size} bytes (limit ${MAX_FILE_BYTES}).`,
      'err',
    );
    return;
  }
  try {
    currentBytes = new Uint8Array(await file.arrayBuffer());
    els.fileMeta.textContent = `${file.name} \u00b7 ${file.size} bytes`;
    els.input.value = BC.encodeHex(currentBytes, { separator: ' ' });
    els.fromFormat.value = 'hex';
    els.toFormat.value = 'base64';
    pushBytesToViews(currentBytes);
    setDiagnostics(`Loaded ${file.name}: ${currentBytes.length} bytes.`, 'ok');
    if ($('#live-convert').checked) runConvert();
  } catch (e) {
    setDiagnostics(`File read failed: ${e.message}`, 'err');
  }
}

function esc(s) {
  const amp = String.fromCharCode(38);
  const entity = (name) => amp + name + ';';
  return String(s)
    .replace(/&/g, entity('amp'))
    .replace(/</g, entity('lt'))
    .replace(/>/g, entity('gt'))
    .replace(/"/g, entity('quot'))
    .replace(/'/g, entity('#39'));
}

function setDiagnostics(message, kind) {
  const cls =
    kind === 'ok' ? 'diag-ok' : kind === 'err' ? 'diag-err' : 'diag-info';
  els.diagnostics.textContent = '';
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = message;
  els.diagnostics.appendChild(span);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
