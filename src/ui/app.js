/**
 * BabelCodec UI — conversion engine stays independent of DOM.
 * Security: all untrusted strings use textContent / esc(); no unsafe innerHTML.
 */
import * as BC from '../api/babelcodec.js?v=0.7.0';
import { createInspectorView } from './inspector-view.js?v=0.7.0';
import { createStructureView } from './structure-view.js?v=0.7.0';
import { createLogicView } from './logic-view.js?v=0.7.0';
import { createSha256Lab } from './sha256-lab.js?v=0.7.0';
import { createComputerLab } from './computer-lab.js?v=0.7.0';
import { createTextLab } from './text-lab.js?v=0.7.0';
import { createCpuLab } from './cpu-lab.js?v=0.7.0';
import { createMediaLab } from './media-lab.js?v=0.9.0';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
let currentBytes = null;
const $ = (s) => document.querySelector(s);
const els = {};
let inspectorView = null;
let structureView = null;
let logicView = null;
let sha256View = null;
let computerView = null;
let textView = null;
let cpuView = null;
let mediaView = null;

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
    viewCpu: $('#view-cpu'),
    viewText: $('#view-text'),
    viewMedia: $('#view-media'),
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
    pushBytesToViews(null);
    setDiagnostics('Cleared.', 'info');
  });
  $('#btn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.output.value);
      setDiagnostics('Copied output.', 'ok');
    } catch {
      setDiagnostics('Copy failed.', 'err');
    }
  });
  $('#btn-download').addEventListener('click', () => {
    const blob = new Blob([els.output.value], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'babelcodec-output.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#live-convert').addEventListener('change', () => {
    if ($('#live-convert').checked) runConvert();
  });
  els.input.addEventListener('input', () => {
    if ($('#live-convert').checked) runConvert();
  });
  els.fromFormat.addEventListener('change', () => {
    if ($('#live-convert').checked) runConvert();
  });
  els.toFormat.addEventListener('change', () => {
    if ($('#live-convert').checked) runConvert();
  });
  $('#btn-load').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setDiagnostics(`File exceeds ${MAX_FILE_BYTES} bytes`, 'err');
      return;
    }
    const buf = new Uint8Array(await f.arrayBuffer());
    currentBytes = buf;
    pushBytesToViews(buf);
    els.input.value = BC.encodeHex(buf);
    els.fromFormat.value = 'hex';
    els.fileMeta.textContent = `${f.name} · ${buf.length} bytes`;
    runConvert();
    setDiagnostics(`Loaded ${f.name}`, 'ok');
    e.target.value = '';
  });

  inspectorView = createInspectorView($('#hex-inspector-root'), {
    onDiagnostic: setDiagnostics,
    onSelectionChange: () => {
      const t = document.getElementById('btn-to-logic');
      if (t) t.disabled = false;
    },
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
  if ($('#text-root')) {
    textView = createTextLab($('#text-root'), { onDiagnostic: setDiagnostics });
  }
  if ($('#cpu-root')) {
    cpuView = createCpuLab($('#cpu-root'), { onDiagnostic: setDiagnostics });
  }
  if ($('#media-root')) {
    mediaView = createMediaLab($('#media-root'), {
      onDiagnostic: setDiagnostics,
      onBytes: (bytes) => {
        currentBytes = bytes;
        pushBytesToViews(bytes);
      },
      onNavigate: (tab) => {
        if (tab) switchTab(tab);
      },
    });
  }

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
    const on = btn.dataset.tab === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on && typeof btn.scrollIntoView === 'function') {
      try {
        btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
      } catch {
        btn.scrollIntoView(false);
      }
    }
  });
  els.viewConverter.hidden = name !== 'converter';
  els.viewInspector.hidden = name !== 'inspector';
  els.viewStructure.hidden = name !== 'structure';
  if (els.viewLogic) els.viewLogic.hidden = name !== 'logic';
  if (els.viewSha256) els.viewSha256.hidden = name !== 'sha256';
  if (els.viewComputer) els.viewComputer.hidden = name !== 'computer';
  if (els.viewCpu) els.viewCpu.hidden = name !== 'cpu';
  if (els.viewText) els.viewText.hidden = name !== 'text';
  if (els.viewMedia) els.viewMedia.hidden = name !== 'media';
  if (name === 'inspector' && inspectorView) inspectorView.refresh();
  if (name === 'computer' && computerView) computerView.refresh();
  if (name === 'structure' && structureView) structureView.refresh();
  if (name === 'logic' && logicView) logicView.refresh();
  if (name === 'cpu' && cpuView?.refresh) cpuView.refresh();
  if (name === 'text' && textView?.refresh) textView.refresh();
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
  try {
    const from = els.fromFormat.value;
    const to = els.toFormat.value;
    const enc = getTextEncoding();
    let bytes;
    if (from === 'text') {
      bytes = enc === 'ascii' ? BC.encodeAscii(els.input.value) : BC.encodeUtf8(els.input.value);
    } else if (from === 'bytes' || from === 'hex') {
      bytes = BC.decodeHex(els.input.value);
    } else if (from === 'binary') {
      bytes = BC.decodeBinary(els.input.value);
    } else if (from === 'base64') {
      bytes = BC.decodeBase64(els.input.value);
    } else if (from === 'decimal') {
      bytes = BC.decodeDecimal(els.input.value);
    } else if (from === 'octal') {
      bytes = BC.decodeOctal(els.input.value);
    } else if (from === 'ascii') {
      bytes = BC.encodeAscii(els.input.value);
    } else if (from === 'utf8') {
      bytes = BC.encodeUtf8(els.input.value);
    } else if (from === 'morse') {
      bytes = BC.decodeMorse(els.input.value);
    } else {
      bytes = BC.decodeHex(els.input.value);
    }
    currentBytes = bytes;
    pushBytesToViews(bytes);
    let out;
    if (to === 'text') {
      out = enc === 'ascii' ? BC.decodeAscii(bytes) : BC.decodeUtf8(bytes);
    } else if (to === 'bytes' || to === 'hex') {
      out = BC.encodeHex(bytes);
    } else if (to === 'binary') {
      out = BC.encodeBinary(bytes);
    } else if (to === 'base64') {
      out = BC.encodeBase64(bytes);
    } else if (to === 'decimal') {
      out = BC.encodeDecimal(bytes);
    } else if (to === 'octal') {
      out = BC.encodeOctal(bytes);
    } else if (to === 'ascii') {
      out = BC.decodeAscii(bytes);
    } else if (to === 'utf8') {
      out = BC.decodeUtf8(bytes);
    } else if (to === 'morse') {
      out = BC.encodeMorse(bytes);
    } else {
      out = BC.encodeHex(bytes);
    }
    els.output.value = out;
    setDiagnostics(`Converted ${from} → ${to} (${bytes.length} bytes)`, 'ok');
  } catch (e) {
    setDiagnostics(String(e.message || e), 'err');
  }
}

function setDiagnostics(msg, level = 'info') {
  if (!els.diagnostics) return;
  els.diagnostics.textContent = msg || '';
  els.diagnostics.className = 'diagnostics diag-' + (level === 'ok' ? 'ok' : level === 'err' ? 'err' : 'info');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
