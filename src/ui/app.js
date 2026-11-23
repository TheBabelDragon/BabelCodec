/**
 * BabelCodec UI v0.15.0 — Directional Converter + image-aware input port.
 * Security: textContent only for untrusted data.
 *
 * See PR #37 for full architecture. This file wires the four-stage Converter,
 * preserves original image bytes, supports drag/drop/clipboard, detection panel,
 * contextual image ops, and handoff to Image Studio / Inspector.
 */
import * as BC from '../api/babelcodec.js?v=0.15.0';
import { createInspectorView } from './inspector-view.js?v=0.15.0';
import { createStructureView } from './structure-view.js?v=0.15.0';
import { createLogicView } from './logic-view.js?v=0.15.0';
import { createSha256Lab } from './sha256-lab.js?v=0.15.0';
import { createComputerLab } from './computer-lab.js?v=0.15.0';
import { createTextLab } from './text-lab.js?v=0.15.0';
import { createCpuLab } from './cpu-lab.js?v=0.15.0';
import { createMediaLab } from './media-lab.js?v=0.15.0';
import {
  ingestInput, getDefaultLedger, restoreArtifactLedger,
  createRevision, withHash, analyzeArtifact,
} from '../media/artifacts/index.js?v=0.15.0';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const DETECT_DEBOUNCE_MS = 280;

let currentBytes = null;
let originalBytes = null;
let currentArtifact = null;
let originalArtifact = null;
let currentDetection = null;
let currentFile = null;
let currentThumbUrl = null;
let isImageInput = false;
let ingestToken = 0;
let inputSource = 'TEXT';

const $ = (s) => document.querySelector(s);
const els = {};
let inspectorView, structureView, logicView, sha256View, computerView, textView, cpuView, mediaView;
let detectTimer = null;

const FORMATS = [
  ['text','Text'],['bytes','Raw bytes (hex)'],['binary','Binary'],['hex','Hexadecimal'],
  ['base64','Base64'],['decimal','Decimal'],['octal','Octal'],['ascii','ASCII (strict)'],
  ['utf8','UTF-8'],['morse','Morse'],
];

function init() {
  Object.assign(els, {
    input: $('#input-area'), output: $('#output-area'),
    fromFormat: $('#from-format'), toFormat: $('#to-format'),
    textEncoding: $('#text-encoding'), diagnostics: $('#diagnostics'),
    fileMeta: $('#file-meta'),
    viewConverter: $('#view-converter'), viewInspector: $('#view-inspector'),
    viewStructure: $('#view-structure'), viewLogic: $('#view-logic'),
    viewSha256: $('#view-sha256'), viewComputer: $('#view-computer'),
    viewCpu: $('#view-cpu'), viewText: $('#view-text'), viewMedia: $('#view-media'),
    dropzone: $('#dropzone'), converterFileInput: $('#converter-file-input'),
    inputMeta: $('#input-meta'), inputFilename: $('#input-filename'),
    inputSize: $('#input-size'), inputMime: $('#input-mime'),
    inputDetected: $('#input-detected'), inputThumb: $('#input-thumb'),
    btnRemoveFile: $('#btn-remove-file'), btnOpenStudio: $('#btn-open-studio'),
    detectionPanel: $('#detection-panel'), detectStatus: $('#detect-status'),
    contextualOps: $('#contextual-ops'), outputPreview: $('#output-preview'),
    outputThumb: $('#output-thumb'),
  });

  for (const sel of [els.fromFormat, els.toFormat]) {
    if (!sel) continue;
    sel.textContent = '';
    for (const [v,l] of FORMATS) {
      const o = document.createElement('option'); o.value=v; o.textContent=l; sel.appendChild(o);
    }
  }
  if (els.fromFormat) els.fromFormat.value = 'text';
  if (els.toFormat) els.toFormat.value = 'hex';

  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); switchTab(btn.dataset.tab); });
  });
  const groupToggle = document.querySelector('[data-group="computing"]');
  const groupMenu = $('#nav-computing');
  if (groupToggle && groupMenu) {
    groupToggle.addEventListener('click', e => {
      e.stopPropagation();
      const open = groupMenu.hidden;
      groupMenu.hidden = !open;
      groupToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', () => {
      groupMenu.hidden = true;
      groupToggle.setAttribute('aria-expanded', 'false');
    });
  }

  $('#btn-convert')?.addEventListener('click', () => runConvert().catch(e => setDiagnostics(String(e.message||e),'err')));
  $('#btn-swap')?.addEventListener('click', () => {
    [els.input.value, els.output.value] = [els.output.value, els.input.value];
    [els.fromFormat.value, els.toFormat.value] = [els.toFormat.value, els.fromFormat.value];
    if ($('#live-convert')?.checked) runConvert().catch(()=>{});
  });
  $('#btn-clear')?.addEventListener('click', clearAll);
  $('#btn-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(els.output.value); setDiagnostics('Copied complete output.','ok'); }
    catch { setDiagnostics('Copy failed.','err'); }
  });
  $('#btn-download')?.addEventListener('click', downloadOutput);
  $('#btn-send-inspector')?.addEventListener('click', () => {
    const b = originalBytes || currentBytes;
    if (!b) { setDiagnostics('No bytes to send.','info'); return; }
    pushBytesToViews(b); switchTab('inspector');
  });
  $('#live-convert')?.addEventListener('change', () => { if ($('#live-convert').checked) runConvert().catch(()=>{}); });
  els.input?.addEventListener('input', onTextInput);
  els.fromFormat?.addEventListener('change', () => { if ($('#live-convert')?.checked) runConvert().catch(()=>{}); });
  els.toFormat?.addEventListener('change', () => { if ($('#live-convert')?.checked) runConvert().catch(()=>{}); });

  $('#btn-load')?.addEventListener('click', () => $('#file-input')?.click());
  $('#file-input')?.addEventListener('change', async e => {
    const f = e.target.files?.[0]; if (f) await handleFile(f, 'FILE'); e.target.value = '';
  });

  setupInputPort();
  els.contextualOps?.querySelectorAll('[data-op]').forEach(btn => {
    btn.addEventListener('click', () => handleImageOp(btn.dataset.op));
  });

  inspectorView = createInspectorView($('#hex-inspector-root'), {
    onDiagnostic: setDiagnostics,
    onSelectionChange: () => { const t = document.getElementById('btn-to-logic'); if (t) t.disabled = false; },
  });
  structureView = createStructureView($('#structure-root'), { onDiagnostic: setDiagnostics });
  logicView = createLogicView($('#logic-root'), { onDiagnostic: setDiagnostics });
  sha256View = createSha256Lab($('#sha256-root'), {
    onDiagnostic: setDiagnostics,
    onSendToComputer: bytes => { if (computerView) { computerView.loadBytes(bytes); switchTab('computer'); } },
  });
  computerView = createComputerLab($('#computer-root'), { onDiagnostic: setDiagnostics });
  if ($('#text-root')) textView = createTextLab($('#text-root'), { onDiagnostic: setDiagnostics });
  if ($('#cpu-root')) cpuView = createCpuLab($('#cpu-root'), { onDiagnostic: setDiagnostics });
  if ($('#media-root')) {
    mediaView = createMediaLab($('#media-root'), {
      onDiagnostic: setDiagnostics,
      onBytes: bytes => {
        if (bytes) {
          currentBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
          originalBytes = currentBytes;
          pushBytesToViews(currentBytes);
        }
      },
      onNavigate: tab => { if (tab) switchTab(tab); },
    });
  }

  const transferBtn = document.createElement('button');
  transferBtn.type = 'button'; transferBtn.className = 'btn btn-ghost'; transferBtn.id = 'btn-to-logic';
  transferBtn.textContent = '→ Logic'; transferBtn.title = 'Send selection to Logic Lab'; transferBtn.disabled = true;
  transferBtn.addEventListener('click', () => {
    if (!inspectorView) return;
    const bytes = inspectorView.getBytes?.(); const sel = inspectorView.getSelection?.();
    if (!bytes || !sel || !sel.length) { setDiagnostics('Select bytes first.','info'); return; }
    if (logicView) logicView.setOperandA(bytes.slice(sel.start, sel.end));
    switchTab('logic');
  });
  const transferSha = document.createElement('button');
  transferSha.type = 'button'; transferSha.className = 'btn btn-ghost'; transferSha.id = 'btn-to-sha256';
  transferSha.textContent = '→ SHA-256'; transferSha.title = 'Send selection to SHA-256 Lab';
  transferSha.addEventListener('click', () => {
    if (!inspectorView) return;
    const bytes = inspectorView.getBytes?.(); const sel = inspectorView.getSelection?.();
    if (!bytes || !sel || !sel.length) { setDiagnostics('Select bytes first.','info'); return; }
    if (sha256View) sha256View.setBytes(bytes.slice(sel.start, sel.end));
    switchTab('sha256');
  });
  const headerActions = document.querySelector('.header-actions');
  if (headerActions) {
    headerActions.insertBefore(transferSha, headerActions.firstChild);
    headerActions.insertBefore(transferBtn, headerActions.firstChild);
  }

  restoreArtifactLedger().then(r => {
    setDiagnostics(r.available && r.restored > 0
      ? `Ledger restored (${r.restored} records). Ready.`
      : 'Ready. Enter input, drop a file, or load an image.', 'info');
  }).catch(() => setDiagnostics('Ready. Enter input, drop a file, or load an image.', 'info'));

  switchTab('converter');
  window.addEventListener('babelcodec:suite-bytes', ev => {
    const bytes = ev.detail?.bytes; if (!bytes) return;
    currentBytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    originalBytes = currentBytes; pushBytesToViews(currentBytes);
  });
  window.addEventListener('babelcodec:suite-navigate', ev => { if (ev.detail?.tab) switchTab(ev.detail.tab); });
}

function setupInputPort() {
  const dz = els.dropzone, fileInput = els.converterFileInput;
  if (!dz || !fileInput) return;
  const openPicker = () => fileInput.click();
  dz.addEventListener('click', e => { if (e.target !== fileInput) openPicker(); });
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
  fileInput.addEventListener('change', async e => {
    const f = e.target.files?.[0]; if (f) await handleFile(f, 'FILE'); e.target.value = '';
  });
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.add('drag-over'); }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dz.classList.remove('drag-over'); }));
  dz.addEventListener('drop', async e => { const f = e.dataTransfer?.files?.[0]; if (f) await handleFile(f, 'FILE'); });

  $('#btn-paste-text')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text != null) {
        clearFileState(false); inputSource = 'CLIPBOARD'; isImageInput = false;
        els.input.value = text; originalBytes = null; currentBytes = null;
        currentArtifact = null; currentDetection = null; onTextInput();
        setDiagnostics('Pasted text from clipboard.', 'ok');
      }
    } catch { setDiagnostics('Clipboard text read not permitted.', 'err'); }
  });
  $('#btn-paste-image')?.addEventListener('click', async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith('image/'));
        if (type) {
          const blob = await item.getType(type);
          const file = new File([blob], `clipboard.${type.split('/')[1]||'png'}`, { type });
          await handleFile(file, 'CLIPBOARD'); return;
        }
      }
      setDiagnostics('No image found on clipboard.', 'info');
    } catch { setDiagnostics('Clipboard image read not permitted or unsupported.', 'err'); }
  });
  $('#btn-clear-input')?.addEventListener('click', () => {
    els.input.value = ''; clearFileState(true); scheduleDetect(); setDiagnostics('Input cleared.', 'info');
  });
  els.btnRemoveFile?.addEventListener('click', () => {
    clearFileState(true); els.input.value = ''; scheduleDetect(); setDiagnostics('File removed.', 'info');
  });
  els.btnOpenStudio?.addEventListener('click', () => handoffToStudio());
}

async function handleFile(file, source = 'FILE') {
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    setDiagnostics(`File exceeds ${MAX_FILE_BYTES.toLocaleString()} byte limit (${file.size.toLocaleString()} bytes).`, 'err'); return;
  }
  if (file.size === 0) { setDiagnostics('Empty file rejected.', 'err'); return; }

  const token = ++ingestToken;
  inputSource = source;
  setDiagnostics(`Loading ${file.name || 'file'}…`, 'info');
  if (els.detectStatus) els.detectStatus.textContent = 'Loading…';

  try {
    const result = await ingestInput(file, {
      filename: file.name || 'upload', mimeType: file.type || undefined,
      detectOptions: { decodeNested: true },
    });
    if (token !== ingestToken) return;

    currentArtifact = result.artifact; originalArtifact = result.artifact;
    currentDetection = result.detection;
    currentBytes = result.artifact.representations?.bytes || null;
    originalBytes = currentBytes ? new Uint8Array(currentBytes) : null;
    currentFile = file instanceof File ? file : new File([file], file.name || 'upload', { type: file.type });

    const findings = result.detection?.findings || [];
    const imageFinding = findings.find(f =>
      f.type === 'image' ||
      (f.subtype && /^(png|jpeg|jpg|webp|gif|bmp|heif|heic)$/i.test(String(f.subtype))) ||
      (f.mimeType && String(f.mimeType).startsWith('image/'))
    );
    const mime = file.type || result.artifact.metadata?.mimeType || '';
    isImageInput = !!(imageFinding || mime.startsWith('image/') || result.artifact.representations?.image);

    if (isImageInput && currentBytes) {
      const subtype = (imageFinding && (imageFinding.subtype || imageFinding.type)) || mime.replace(/^image\//,'') || 'image';
      els.input.value = `[Image: ${file.name||'upload'} · ${subtype} · ${currentBytes.length.toLocaleString()} bytes]\nOriginal bytes preserved. Use Transform or Image actions below.`;
      els.fromFormat.value = 'bytes';
      if (!['hex','base64','binary','decimal','octal'].includes(els.toFormat.value)) els.toFormat.value = 'base64';
      showContextualOps(true);
    } else {
      if (currentBytes) { els.input.value = BC.encodeHex(currentBytes); els.fromFormat.value = 'hex'; }
      showContextualOps(false);
    }

    updateInputMeta(file, result);
    pushBytesToViews(currentBytes);
    renderDetection(result.detection, result.analysis);
    await runConvert();
    if (token === ingestToken) setDiagnostics(formatDetectionSummary(result.detection, result.analysis), 'ok');
  } catch (err) {
    if (token === ingestToken) {
      setDiagnostics(String(err.message || err), 'err');
      if (els.detectStatus) els.detectStatus.textContent = 'Failed';
    }
  }
}

function updateInputMeta(file, result) {
  if (!els.inputMeta) return;
  els.inputMeta.hidden = false;
  if (els.inputFilename) els.inputFilename.textContent = file.name || 'upload';
  if (els.inputSize) els.inputSize.textContent = `${(file.size || currentBytes?.length || 0).toLocaleString()} bytes`;
  if (els.inputMime) els.inputMime.textContent = file.type || result?.artifact?.metadata?.mimeType || 'application/octet-stream';
  const top = (result?.detection?.findings || []).find(f => f.type !== 'unclassified');
  if (els.inputDetected) {
    els.inputDetected.textContent = top
      ? `detected: ${top.subtype || top.type}${top.confidence != null ? ` (${Math.round(top.confidence*100)}%)` : ''}`
      : 'detected: binary';
  }
  if (currentThumbUrl) { URL.revokeObjectURL(currentThumbUrl); currentThumbUrl = null; }
  if (isImageInput && file && els.inputThumb) {
    currentThumbUrl = URL.createObjectURL(file);
    els.inputThumb.src = currentThumbUrl; els.inputThumb.hidden = false;
  } else if (els.inputThumb) { els.inputThumb.hidden = true; els.inputThumb.removeAttribute('src'); }
  if (els.btnRemoveFile) els.btnRemoveFile.hidden = false;
  if (els.btnOpenStudio) els.btnOpenStudio.hidden = !isImageInput;
  if (els.fileMeta) els.fileMeta.textContent = `${file.name||'file'} · ${(currentBytes?.length||0).toLocaleString()} B`;
}

function clearFileState(clearBytes = true) {
  currentFile = null; isImageInput = false; inputSource = 'TEXT';
  if (currentThumbUrl) { URL.revokeObjectURL(currentThumbUrl); currentThumbUrl = null; }
  if (els.inputMeta) els.inputMeta.hidden = true;
  if (els.inputThumb) { els.inputThumb.hidden = true; els.inputThumb.removeAttribute('src'); }
  if (els.btnRemoveFile) els.btnRemoveFile.hidden = true;
  if (els.btnOpenStudio) els.btnOpenStudio.hidden = true;
  if (els.fileMeta) els.fileMeta.textContent = '';
  showContextualOps(false);
  if (clearBytes) {
    currentBytes = null; originalBytes = null;
    currentArtifact = null; originalArtifact = null; currentDetection = null;
  }
}

function showContextualOps(show) { if (els.contextualOps) els.contextualOps.hidden = !show; }

function handleImageOp(op) {
  const bytes = originalBytes || currentBytes;
  if (!bytes) { setDiagnostics('No image bytes loaded.', 'info'); return; }
  switch (op) {
    case 'hex': els.toFormat.value = 'hex'; els.fromFormat.value = 'bytes'; runConvert().catch(e => setDiagnostics(String(e.message||e),'err')); break;
    case 'base64': els.toFormat.value = 'base64'; els.fromFormat.value = 'bytes'; runConvert().catch(e => setDiagnostics(String(e.message||e),'err')); break;
    case 'binary': els.toFormat.value = 'binary'; els.fromFormat.value = 'bytes'; runConvert().catch(e => setDiagnostics(String(e.message||e),'err')); break;
    case 'inspect': pushBytesToViews(bytes); switchTab('inspector'); break;
    case 'studio': handoffToStudio(); break;
    case 'export-orig': downloadBytes(bytes, currentFile?.name || 'image.bin', currentFile?.type || 'application/octet-stream'); break;
  }
}

function handoffToStudio() {
  const bytes = originalBytes || currentBytes;
  if (!bytes) { setDiagnostics('No image to send to Image Studio.', 'info'); return; }
  window.dispatchEvent(new CustomEvent('babelcodec:suite-bytes', { detail: { bytes } }));
  if (mediaView && typeof mediaView.loadArtifact === 'function' && currentArtifact) {
    try { mediaView.loadArtifact(currentArtifact); } catch {}
  }
  switchTab('media');
  setDiagnostics('Opened in Image Studio with preserved bytes.', 'ok');
}

function onTextInput() {
  if (isImageInput && els.input.value && !els.input.value.startsWith('[Image:')) {
    isImageInput = false; showContextualOps(false); originalBytes = null;
  }
  scheduleDetect();
  if ($('#live-convert')?.checked) runConvert().catch(()=>{});
}

function scheduleDetect() {
  if (detectTimer) clearTimeout(detectTimer);
  detectTimer = setTimeout(() => runDetection().catch(()=>{}), DETECT_DEBOUNCE_MS);
}

async function runDetection() {
  const text = els.input?.value || '';
  if (!text && !currentBytes) {
    renderDetection(null, null);
    if (els.detectStatus) els.detectStatus.textContent = 'Automatic on input change';
    return;
  }
  try {
    if (els.detectStatus) els.detectStatus.textContent = 'Analyzing…';
    let inputForDetect = currentBytes || text;
    if (typeof inputForDetect === 'string' && inputForDetect.startsWith('[Image:')) inputForDetect = currentBytes;
    if (!inputForDetect) { renderDetection(null, null); return; }
    const result = await ingestInput(inputForDetect, {
      detectOptions: { decodeNested: true, limits: { maxBytes: MAX_FILE_BYTES } },
      filename: currentFile?.name, mimeType: currentFile?.type,
    });
    if (!currentArtifact || !isImageInput) {
      currentArtifact = result.artifact; currentDetection = result.detection;
      if (result.artifact.representations?.bytes) currentBytes = result.artifact.representations.bytes;
    } else currentDetection = result.detection;
    renderDetection(result.detection, result.analysis);
    if (els.detectStatus) els.detectStatus.textContent = 'Up to date';
  } catch {
    if (els.detectStatus) els.detectStatus.textContent = 'Detection skipped';
  }
}

function renderDetection(detection, analysis) {
  const panel = els.detectionPanel; if (!panel) return;
  panel.textContent = '';
  if (!detection) {
    const p = document.createElement('p'); p.className = 'empty-state';
    p.textContent = 'No input yet. Detection runs automatically.'; panel.appendChild(p); return;
  }
  const findings = detection.findings || [];
  const list = document.createElement('ul'); list.className = 'detect-list';
  for (const f of findings.slice(0, 8)) {
    if (f.type === 'unclassified') continue;
    const li = document.createElement('li');
    const conf = f.confidence != null ? ` · ${Math.round(f.confidence*100)}%` : '';
    li.textContent = `${f.subtype || f.type}${conf} @ ${f.offset ?? 0}`;
    list.appendChild(li);
  }
  if (!list.children.length) { const li = document.createElement('li'); li.textContent = 'Unclassified / binary'; list.appendChild(li); }
  panel.appendChild(list);
  if (analysis?.sha256) {
    const hash = document.createElement('p'); hash.className = 'detect-hash';
    hash.textContent = `sha256 ${analysis.sha256.slice(0,16)}…`; panel.appendChild(hash);
  }
  const alerts = detection.alerts || [];
  if (alerts.length) {
    const al = document.createElement('p'); al.className = 'detect-alerts';
    al.textContent = `${alerts.length} alert(s): ${alerts.map(a => a.code || a).join(', ')}`; panel.appendChild(al);
  }
  if (detection.analysisComplete === false) {
    const note = document.createElement('p'); note.className = 'detect-note';
    note.textContent = 'Analysis incomplete (resource limit). Bytes still available.'; panel.appendChild(note);
  }
  if (detection.truncated) {
    const tr = document.createElement('p'); tr.className = 'detect-note';
    tr.textContent = 'Input was truncated at acquisition limit.'; panel.appendChild(tr);
  }
}

function formatDetectionSummary(detection, analysis) {
  if (!detection) return 'Ingested.';
  const tops = (detection.findings || []).filter(f => f.type !== 'unclassified').slice(0,4)
    .map(f => `${f.subtype || f.type}@${f.offset ?? 0}`).join(', ');
  const hash = analysis?.sha256 ? analysis.sha256.slice(0,12) + '…' : 'no-hash';
  const alerts = (detection.alerts || []).length;
  return `Detected: ${tops || 'unclassified'} · sha256 ${hash}${alerts ? ` · ${alerts} alert(s)` : ''}`;
}

function switchTab(name) {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on && typeof btn.scrollIntoView === 'function') {
      try { btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }); }
      catch { btn.scrollIntoView(false); }
    }
  });
  const menu = $('#nav-computing'); const toggle = document.querySelector('[data-group="computing"]');
  if (menu) menu.hidden = true; if (toggle) toggle.setAttribute('aria-expanded', 'false');

  if (els.viewConverter) els.viewConverter.hidden = name !== 'converter';
  if (els.viewInspector) els.viewInspector.hidden = name !== 'inspector';
  if (els.viewStructure) els.viewStructure.hidden = name !== 'structure';
  if (els.viewLogic) els.viewLogic.hidden = name !== 'logic';
  if (els.viewSha256) els.viewSha256.hidden = name !== 'sha256';
  if (els.viewComputer) els.viewComputer.hidden = name !== 'computer';
  if (els.viewCpu) els.viewCpu.hidden = name !== 'cpu';
  if (els.viewText) els.viewText.hidden = name !== 'text';
  if (els.viewMedia) els.viewMedia.hidden = name !== 'media';
  if (name === 'inspector' && inspectorView) inspectorView.refresh?.();
  if (name === 'computer' && computerView) computerView.refresh?.();
  if (name === 'structure' && structureView) structureView.refresh?.();
  if (name === 'logic' && logicView) logicView.refresh?.();
  if (name === 'cpu' && cpuView?.refresh) cpuView.refresh();
  if (name === 'text' && textView?.refresh) textView.refresh();
}

function pushBytesToViews(bytes) {
  if (inspectorView?.setBytes) inspectorView.setBytes(bytes);
  if (structureView?.setBytes) structureView.setBytes(bytes);
  if (sha256View?.setBytes) sha256View.setBytes(bytes);
}

function clearAll() {
  els.input.value = ''; els.output.value = '';
  clearFileState(true); renderDetection(null, null);
  if (els.outputPreview) els.outputPreview.hidden = true;
  setDiagnostics('Cleared.', 'info');
}

function downloadOutput() {
  const text = els.output?.value; if (!text) { setDiagnostics('Nothing to download.', 'info'); return; }
  const to = els.toFormat?.value || 'text';
  let name = 'babelcodec-output.txt';
  if (to === 'hex' || to === 'bytes') name = 'babelcodec-output.hex.txt';
  else if (to === 'base64') name = 'babelcodec-output.b64.txt';
  else if (to === 'binary') name = 'babelcodec-output.bin.txt';
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function downloadBytes(bytes, filename, mime) {
  if (!bytes) return;
  const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename || 'download.bin'; a.click();
  URL.revokeObjectURL(url);
}

function resolveSourceBytes(from) {
  const raw = els.input?.value || '';
  if (isImageInput && originalBytes && (raw.startsWith('[Image:') || from === 'bytes' || from === 'hex')) return originalBytes;
  if (from === 'text' || from === 'utf8') return BC.encodeUtf8(raw);
  if (from === 'ascii') return BC.encodeAscii(raw);
  if (from === 'hex' || from === 'bytes') return BC.decodeHex(raw);
  if (from === 'binary') return BC.decodeBinary(raw);
  if (from === 'base64') return BC.decodeBase64(raw);
  if (from === 'decimal') return BC.decodeDecimal(raw);
  if (from === 'octal') return BC.decodeOctal(raw);
  if (from === 'morse') return BC.decodeMorse(raw);
  try { return BC.decodeHex(raw); } catch { return BC.encodeUtf8(raw); }
}

async function runConvert() {
  try {
    const from = els.fromFormat?.value || 'text';
    const to = els.toFormat?.value || 'hex';
    const enc = els.textEncoding?.value === 'ascii' ? 'ascii' : 'utf8';

    if (isImageInput && originalBytes && (to === 'text' || to === 'utf8' || to === 'ascii' || to === 'morse')) {
      setDiagnostics('Image bytes are not decoded as text. Choose Hex, Base64, Binary, Decimal, or Octal — or open in Image Studio.', 'err');
      return;
    }

    let bytes = resolveSourceBytes(from);
    if (!bytes || bytes.length === 0) {
      if (els.output) els.output.value = '';
      setDiagnostics('Empty input.', 'info'); return;
    }
    currentBytes = bytes; pushBytesToViews(bytes);

    if (!isImageInput && !currentArtifact) {
      try {
        const inputForDetect = from === 'text' || from === 'utf8' ? els.input.value : bytes;
        const result = await ingestInput(inputForDetect, { detectOptions: { decodeNested: true } });
        currentArtifact = result.artifact; currentDetection = result.detection;
      } catch {}
    }

    let out;
    if (to === 'text') out = enc === 'ascii' ? BC.decodeAscii(bytes) : BC.decodeUtf8(bytes);
    else if (to === 'bytes' || to === 'hex') out = BC.encodeHex(bytes);
    else if (to === 'binary') out = BC.encodeBinary(bytes);
    else if (to === 'base64') out = BC.encodeBase64(bytes);
    else if (to === 'decimal') out = BC.encodeDecimal(bytes);
    else if (to === 'octal') out = BC.encodeOctal(bytes);
    else if (to === 'ascii') out = BC.decodeAscii(bytes);
    else if (to === 'utf8') out = BC.decodeUtf8(bytes);
    else if (to === 'morse') out = BC.encodeMorse(bytes);
    else out = BC.encodeHex(bytes);
    if (els.output) els.output.value = out;

    if (currentArtifact || originalArtifact) {
      try {
        const parent = originalArtifact || currentArtifact;
        const outBytes = bytes;
        let rev = createRevision(parent, {
          representations: {
            bytes: outBytes,
            text: typeof out === 'string' ? out : null,
            image: isImageInput ? (parent.representations?.image || null) : null,
          },
          operation: 'convert', detail: { from, to, inputSource },
        });
        const analysis = analyzeArtifact(rev, { computeHash: true });
        if (analysis.sha256) rev = withHash(rev, analysis.sha256);
        await getDefaultLedger().commit(rev, {
          operationName: 'convert', operationParams: { from, to },
          sourceRepresentation: from, destinationRepresentation: to,
        });
        currentArtifact = rev;
      } catch {}
    }

    const det = currentDetection ? ` · ${formatDetectionSummary(currentDetection, null)}` : '';
    setDiagnostics(`Converted ${from} → ${to} (${bytes.length.toLocaleString()} bytes)${det}`, 'ok');
  } catch (e) {
    setDiagnostics(String(e.message || e), 'err');
  }
}

function setDiagnostics(msg, level = 'info') {
  if (!els.diagnostics) return;
  els.diagnostics.textContent = msg || '';
  els.diagnostics.className = 'diagnostics diag-' + (level === 'ok' ? 'ok' : level === 'err' ? 'err' : 'info');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
