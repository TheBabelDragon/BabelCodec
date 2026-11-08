/**
 * Image Studio — Create · Convert · Inspect · Batch
 */
import { decodeHEIF, inspectContainer, DEFAULT_MAX_BYTES } from '../media/heif/index.js';
import { detectImageFormat, inspectImageBytes, canEncodeMime, canvasToBlob, exportFilename } from '../media/image/index.js';
import { createScene, addObject, removeObject, renderSceneToCanvas, sceneToSvg, CANVAS_PRESETS, createBatchQueue, processQueue } from '../media/studio/index.js';

export function createMediaLab(root, options = {}) {
  const onDiagnostic = options.onDiagnostic || (() => {});
  const onBytes = options.onBytes || (() => {});
  const onNavigate = options.onNavigate || (() => {});

  let mode = 'convert';
  let sourceBytes = null;
  let sourceName = '';
  let previewUrl = null;
  let activeAbort = null;
  let loadGen = 0;
  let scene = createScene(800, 600, '#1c2029');
  let selectedId = null;
  const batch = createBatchQueue(24);
  let createCanvas = null;

  root.textContent = '';
  root.classList.add('media-lab', 'image-studio');

  const shell = el('div', 'studio-shell');
  const modeNav = el('div', 'studio-mode-nav');
  const modes = [['create', 'Create'], ['convert', 'Convert'], ['inspect', 'Inspect'], ['batch', 'Batch']];
  const modeBtns = {};
  for (const [id, label] of modes) {
    const b = btn(label, 'studio-mode-btn');
    b.dataset.mode = id;
    b.addEventListener('click', () => setMode(id));
    modeNav.appendChild(b);
    modeBtns[id] = b;
  }
  const panels = {
    create: el('div', 'studio-panel studio-panel-create'),
    convert: el('div', 'studio-panel studio-panel-convert'),
    inspect: el('div', 'studio-panel studio-panel-inspect'),
    batch: el('div', 'studio-panel studio-panel-batch'),
  };
  const statusBar = el('div', 'media-status');
  statusBar.setAttribute('role', 'status');
  statusBar.textContent = 'Image Studio ready.';
  shell.append(modeNav, panels.create, panels.convert, panels.inspect, panels.batch, statusBar);
  root.appendChild(shell);

  let wInput, hInput, bgInput, objList, convertPreview, convertInfo, qualityInput, formatSelect, inspectMeta, inspectBoxes, batchListEl, batchFormat, batchQuality;

  buildCreate(panels.create);
  buildConvert(panels.convert);
  buildInspect(panels.inspect);
  buildBatch(panels.batch);
  setMode('convert');

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function btn(label, cls) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls || 'btn';
    b.textContent = label;
    return b;
  }
  function setStatus(msg, kind) {
    statusBar.textContent = msg;
    statusBar.className = 'media-status' + (kind ? ` media-status-${kind}` : '');
    onDiagnostic(msg, kind === 'err' ? 'err' : kind === 'ok' ? 'ok' : 'info');
  }
  function setMode(m) {
    mode = m;
    for (const [id, b] of Object.entries(modeBtns)) b.classList.toggle('active', id === m);
    for (const [id, p] of Object.entries(panels)) p.hidden = id !== m;
    if (m === 'create') redrawCreate();
  }
  function revokePreview() {
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  }
  function notifyBytes(bytes) {
    sourceBytes = bytes;
    onBytes(bytes);
    if (mode === 'inspect') refreshInspect();
  }
  function clearAll() {
    if (activeAbort) { activeAbort.abort(); activeAbort = null; }
    loadGen++;
    sourceBytes = null;
    sourceName = '';
    revokePreview();
    notifyBytes(null);
    batch.clear();
    renderBatchList();
    clearInspectUi();
    clearConvertPreview();
    setStatus('Cleared.', 'info');
  }
  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }
  function bindDrop(zone, onFile, multi) {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('media-dropzone-active'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('media-dropzone-active'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('media-dropzone-active');
      const files = [...(e.dataTransfer?.files || [])];
      if (!files.length) return;
      if (multi) files.forEach(onFile);
      else onFile(files[0]);
    });
  }

  function buildCreate(panel) {
    const layout = el('div', 'studio-create-layout');
    const tools = el('div', 'studio-side studio-tools');
    const center = el('div', 'studio-center');
    const props = el('div', 'studio-side studio-props');
    tools.appendChild(el('div', 'studio-side-title', 'Canvas'));
    const sizeRow = el('div', 'studio-field-row');
    wInput = document.createElement('input');
    wInput.type = 'number'; wInput.min = '1'; wInput.max = '8192'; wInput.value = String(scene.width);
    hInput = document.createElement('input');
    hInput.type = 'number'; hInput.min = '1'; hInput.max = '8192'; hInput.value = String(scene.height);
    sizeRow.append(el('span', '', 'W'), wInput, el('span', '', 'H'), hInput);
    tools.appendChild(sizeRow);
    const presetSel = document.createElement('select');
    for (const p of CANVAS_PRESETS) {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.label;
      presetSel.appendChild(o);
    }
    presetSel.addEventListener('change', () => {
      const p = CANVAS_PRESETS.find((x) => x.id === presetSel.value);
      if (!p) return;
      scene.width = p.w; scene.height = p.h;
      wInput.value = String(p.w); hInput.value = String(p.h);
      redrawCreate();
    });
    tools.appendChild(presetSel);
    bgInput = document.createElement('input');
    bgInput.type = 'color'; bgInput.value = '#1c2029';
    const bgClear = btn('Transparent bg', 'btn btn-ghost');
    bgClear.addEventListener('click', () => { scene.background = 'transparent'; redrawCreate(); });
    bgInput.addEventListener('input', () => { scene.background = bgInput.value; redrawCreate(); });
    tools.append(el('div', 'studio-side-title', 'Background'), bgInput, bgClear);
    tools.appendChild(el('div', 'studio-side-title', 'Add'));
    const addRow = el('div', 'studio-btn-row');
    for (const [type, label] of [['rect', 'Rect'], ['ellipse', 'Ellipse'], ['text', 'Text'], ['line', 'Line']]) {
      const b = btn(label, 'btn');
      b.addEventListener('click', () => {
        const o = addObject(scene, {
          type,
          text: type === 'text' ? 'BabelCodec' : '',
          fill: type === 'line' ? '#e6eaf0' : '#4a7dff',
          stroke: type === 'line' ? '#e6eaf0' : 'transparent',
          strokeWidth: type === 'line' ? 3 : 0,
          w: type === 'text' ? 200 : 120,
          h: type === 'text' ? 40 : 80,
        });
        selectedId = o.id;
        redrawCreate();
        renderObjList();
      });
      addRow.appendChild(b);
    }
    tools.appendChild(addRow);
    objList = el('div', 'studio-obj-list');
    tools.append(el('div', 'studio-side-title', 'Layers'), objList);
    const previewWrap = el('div', 'studio-preview-frame');
    createCanvas = document.createElement('canvas');
    createCanvas.className = 'studio-create-canvas';
    previewWrap.appendChild(createCanvas);
    center.appendChild(previewWrap);
    props.appendChild(el('div', 'studio-side-title', 'Export'));
    const expRow = el('div', 'studio-btn-row');
    const bPng = btn('PNG', 'btn btn-primary');
    const bJpg = btn('JPEG', 'btn');
    const bWebp = btn('WebP', 'btn');
    const bSvg = btn('SVG', 'btn');
    bPng.addEventListener('click', () => exportCreate('image/png', 'png'));
    bJpg.addEventListener('click', () => exportCreate('image/jpeg', 'jpeg'));
    bWebp.addEventListener('click', () => exportCreate('image/webp', 'webp'));
    bSvg.addEventListener('click', () => {
      downloadBlob(new Blob([sceneToSvg(scene)], { type: 'image/svg+xml' }), 'studio-design.svg');
      setStatus('Downloaded studio-design.svg (vector).', 'ok');
    });
    expRow.append(bPng, bJpg, bWebp, bSvg);
    props.appendChild(expRow);
    props.appendChild(el('p', 'studio-hint', 'PNG is lossless. JPEG/WebP are lossy. SVG is vector-only (Create scene).'));
    const delBtn = btn('Delete selected', 'btn btn-ghost');
    delBtn.addEventListener('click', () => {
      if (!selectedId) return;
      removeObject(scene, selectedId);
      selectedId = null;
      redrawCreate();
      renderObjList();
    });
    props.appendChild(delBtn);
    wInput.addEventListener('change', () => { scene.width = Math.max(1, Math.min(8192, Number(wInput.value) || 800)); redrawCreate(); });
    hInput.addEventListener('change', () => { scene.height = Math.max(1, Math.min(8192, Number(hInput.value) || 600)); redrawCreate(); });
    layout.append(tools, center, props);
    panel.appendChild(layout);
    redrawCreate();
    renderObjList();
  }

  function redrawCreate() {
    if (!createCanvas) return;
    renderSceneToCanvas(scene, createCanvas);
  }
  function renderObjList() {
    objList.textContent = '';
    for (const o of scene.objects) {
      const row = el('button', 'studio-obj-item' + (o.id === selectedId ? ' active' : ''));
      row.type = 'button';
      row.textContent = `${o.type} · ${Math.round(o.w)}×${Math.round(o.h)}`;
      row.addEventListener('click', () => { selectedId = o.id; renderObjList(); });
      objList.appendChild(row);
    }
  }
  async function exportCreate(mime, format) {
    if (mime !== 'image/png' && !canEncodeMime(mime)) {
      setStatus(`${format} not supported in this browser.`, 'err');
      return;
    }
    redrawCreate();
    try {
      const blob = await canvasToBlob(createCanvas, { mimeType: mime, quality: format === 'png' ? undefined : 0.92 });
      downloadBlob(blob, exportFilename('studio-design', format));
      setStatus(`Downloaded studio-design.${format === 'jpeg' ? 'jpg' : format}.`, 'ok');
    } catch (e) {
      setStatus(`Export failed: ${e.message || e}`, 'err');
    }
  }

  function buildConvert(panel) {
    const layout = el('div', 'studio-convert-layout');
    const convertDrop = el('div', 'media-dropzone');
    convertDrop.tabIndex = 0;
    convertDrop.append(el('div', 'media-drop-label', 'Drop image or click to open'), el('div', 'media-drop-hint', 'PNG · JPEG · WebP · GIF · BMP · HEIC/HEIF · max 8 MiB'));
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,.heic,.heif,.hif';
    fileInput.hidden = true;
    convertDrop.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f) loadConvertFile(f); });
    bindDrop(convertDrop, (f) => loadConvertFile(f));
    const body = el('div', 'studio-convert-body');
    const prevPanel = el('section', 'panel');
    const ph = el('div', 'panel-header');
    ph.appendChild(el('span', 'panel-title', 'Preview'));
    convertPreview = el('div', 'studio-preview-frame media-preview-body');
    convertPreview.appendChild(el('div', 'media-preview-placeholder', 'Import an image to preview'));
    prevPanel.append(ph, convertPreview);
    convertInfo = el('dl', 'media-info-list');
    const infoPanel = el('section', 'panel');
    const ih = el('div', 'panel-header');
    ih.appendChild(el('span', 'panel-title', 'Source'));
    const ib = el('div', 'panel-body');
    ib.appendChild(convertInfo);
    infoPanel.append(ih, ib);
    const expPanel = el('section', 'panel');
    const eh = el('div', 'panel-header');
    eh.appendChild(el('span', 'panel-title', 'Export'));
    const eb = el('div', 'panel-body');
    formatSelect = document.createElement('select');
    for (const [v, l] of [['png', 'PNG (lossless)'], ['jpeg', 'JPEG (lossy)'], ['webp', 'WebP']]) {
      const o = document.createElement('option');
      o.value = v; o.textContent = l;
      formatSelect.appendChild(o);
    }
    qualityInput = document.createElement('input');
    qualityInput.type = 'range'; qualityInput.min = '0.1'; qualityInput.max = '1'; qualityInput.step = '0.05'; qualityInput.value = '0.92';
    const qLab = el('label', '');
    const qVal = el('span', 'media-quality-val', '0.92');
    qLab.append(document.createTextNode('Quality '), qualityInput, qVal);
    qualityInput.addEventListener('input', () => { qVal.textContent = Number(qualityInput.value).toFixed(2); });
    const expBtn = btn('Download converted', 'btn btn-primary');
    expBtn.addEventListener('click', () => exportConvert());
    const toHex = btn('\u2192 Hex Inspector', 'btn btn-ghost');
    toHex.addEventListener('click', () => {
      if (sourceBytes) { notifyBytes(sourceBytes); onNavigate('inspector'); setStatus('Opened Hex Inspector with original bytes.', 'ok'); }
    });
    const clearBtn = btn('Clear', 'btn');
    clearBtn.addEventListener('click', clearAll);
    eb.append(formatSelect, qLab, expBtn, toHex, clearBtn);
    eb.appendChild(el('p', 'studio-hint', 'Original file is never overwritten. Raster\u2192SVG is not offered.'));
    expPanel.append(eh, eb);
    const side = el('div', 'studio-convert-side');
    side.append(infoPanel, expPanel);
    body.append(prevPanel, side);
    layout.append(convertDrop, fileInput, body);
    panel.appendChild(layout);
  }

  function clearConvertPreview() {
    revokePreview();
    if (convertPreview) {
      convertPreview.textContent = '';
      convertPreview.appendChild(el('div', 'media-preview-placeholder', 'Import an image to preview'));
    }
    if (convertInfo) convertInfo.textContent = '';
  }

  async function loadConvertFile(file) {
    if (!file) return;
    if (file.size > DEFAULT_MAX_BYTES) {
      setStatus(`File too large: ${file.size} bytes (limit ${DEFAULT_MAX_BYTES}).`, 'err');
      return;
    }
    if (activeAbort) activeAbort.abort();
    activeAbort = new AbortController();
    const gen = ++loadGen;
    setStatus(`Loading ${file.name}\u2026`, 'info');
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (gen !== loadGen) return;
      sourceName = file.name;
      notifyBytes(buf);
      const det = detectImageFormat(buf);
      let width = null, height = null, previewOk = false, heifNote = '';
      if (det.format === 'heif') {
        const result = await decodeHEIF(buf, { filename: file.name, maxBytes: DEFAULT_MAX_BYTES });
        if (gen !== loadGen) return;
        heifNote = result.status;
        const img = result.images?.[result.primaryIndex ?? 0];
        if (img?.rgba) {
          width = img.width; height = img.height;
          await showRgbaPreview(img);
          previewOk = true;
        } else {
          heifNote = result.status === 'structural_only' ? 'HEIF structural only (no pixel backend)' : result.status;
        }
      } else if (det.format !== 'unknown') {
        const blob = new Blob([buf], { type: det.mimeType });
        revokePreview();
        previewUrl = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Browser could not decode image')); img.src = previewUrl; });
        if (gen !== loadGen) return;
        width = img.naturalWidth; height = img.naturalHeight;
        convertPreview.textContent = '';
        img.className = 'media-preview-img'; img.alt = file.name;
        convertPreview.appendChild(img);
        previewOk = true;
      } else throw new Error('Unrecognized image format');
      const info = await inspectImageBytes(buf, { width, height });
      convertInfo.textContent = '';
      const rows = [['Name', file.name], ['Format', info.format], ['Size', `${info.byteLength} bytes`], ['Dimensions', width && height ? `${width} \u00d7 ${height}` : '\u2014'], ['SHA-256', info.sha256 ? info.sha256.slice(0, 16) + '\u2026' : '\u2014']];
      if (heifNote) rows.push(['HEIF', heifNote]);
      for (const [k, v] of rows) convertInfo.append(el('dt', '', k), el('dd', '', v));
      setStatus(previewOk ? `Loaded ${file.name} (${info.format}).` : `Loaded ${file.name}: ${heifNote || 'preview unavailable'}.`, previewOk ? 'ok' : 'info');
    } catch (e) {
      if (gen !== loadGen) return;
      setStatus(`Failed: ${e.message || e}`, 'err');
    }
  }

  async function showRgbaPreview(image) {
    const c = document.createElement('canvas');
    c.width = image.width; c.height = image.height;
    c.getContext('2d').putImageData(new ImageData(image.rgba, image.width, image.height), 0, 0);
    const blob = await canvasToBlob(c, { mimeType: 'image/png' });
    revokePreview();
    previewUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.className = 'media-preview-img'; img.alt = 'Decoded preview'; img.src = previewUrl;
    convertPreview.textContent = '';
    convertPreview.appendChild(img);
  }

  async function exportConvert() {
    if (!sourceBytes) { setStatus('No image loaded.', 'err'); return; }
    const format = formatSelect.value;
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    if (format !== 'png' && !canEncodeMime(mime)) { setStatus(`${format} encoding not supported here.`, 'err'); return; }
    try {
      setStatus('Converting\u2026', 'info');
      const det = detectImageFormat(sourceBytes);
      let canvas;
      if (det.format === 'heif') {
        const result = await decodeHEIF(sourceBytes, { filename: sourceName });
        const im = result.images?.[result.primaryIndex ?? 0];
        if (!im?.rgba) throw new Error('No pixel data for HEIF export (decoder unavailable)');
        canvas = document.createElement('canvas');
        canvas.width = im.width; canvas.height = im.height;
        canvas.getContext('2d').putImageData(new ImageData(im.rgba, im.width, im.height), 0, 0);
      } else {
        const url = URL.createObjectURL(new Blob([sourceBytes], { type: det.mimeType }));
        try {
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Decode failed')); img.src = url; });
          canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          canvas.getContext('2d').drawImage(img, 0, 0);
        } finally { URL.revokeObjectURL(url); }
      }
      const out = await canvasToBlob(canvas, { mimeType: mime, quality: Number(qualityInput.value) });
      const name = exportFilename(sourceName || 'image', format);
      downloadBlob(out, name);
      setStatus(`Downloaded ${name}.`, 'ok');
    } catch (e) {
      setStatus(`Export failed: ${e.message || e}`, 'err');
    }
  }

  function buildInspect(panel) {
    const tip = el('p', 'studio-hint', 'Technical view of the current file. Original bytes feed Hex Inspector.');
    inspectMeta = el('pre', 'media-meta-pre', '\u2014');
    inspectBoxes = el('div', 'studio-box-host');
    const toHex = btn('\u2192 Hex Inspector', 'btn btn-ghost');
    toHex.addEventListener('click', () => {
      if (sourceBytes) { notifyBytes(sourceBytes); onNavigate('inspector'); }
      else setStatus('No bytes loaded.', 'info');
    });
    const refresh = btn('Refresh', 'btn');
    refresh.addEventListener('click', () => refreshInspect());
    panel.append(tip, toHex, refresh, el('div', 'studio-side-title', 'Metadata'), inspectMeta, el('div', 'studio-side-title', 'Container (HEIF)'), inspectBoxes);
  }
  function clearInspectUi() {
    if (inspectMeta) inspectMeta.textContent = '\u2014';
    if (inspectBoxes) inspectBoxes.textContent = '';
  }
  async function refreshInspect() {
    if (!sourceBytes) { clearInspectUi(); return; }
    const info = await inspectImageBytes(sourceBytes);
    const det = detectImageFormat(sourceBytes);
    const payload = { ...info, detection: det };
    if (det.format === 'heif') {
      try {
        const c = inspectContainer(sourceBytes);
        payload.container = { classification: c.classification, boxCount: c.boxCount, topLevelTypes: c.topLevelTypes };
        inspectBoxes.textContent = '';
        const table = document.createElement('table');
        table.className = 'media-box-table';
        table.innerHTML = '<thead><tr><th>Type</th><th>Offset</th><th>Size</th></tr></thead>';
        const tb = document.createElement('tbody');
        for (const b of (c.flat || []).slice(0, 100)) {
          const tr = document.createElement('tr');
          for (const v of [b.type, String(b.offset), String(b.size)]) {
            const td = document.createElement('td');
            td.textContent = v;
            tr.appendChild(td);
          }
          tb.appendChild(tr);
        }
        table.appendChild(tb);
        inspectBoxes.appendChild(table);
      } catch (e) {
        inspectBoxes.textContent = String(e.message || e);
      }
    } else {
      inspectBoxes.textContent = 'Not an ISOBMFF/HEIF container.';
    }
    inspectMeta.textContent = JSON.stringify(payload, null, 2);
  }

  function buildBatch(panel) {
    const drop = el('div', 'media-dropzone');
    drop.append(el('div', 'media-drop-label', 'Drop multiple images'), el('div', 'media-drop-hint', 'Isolated failures \u00b7 max 24 files'));
    const fin = document.createElement('input');
    fin.type = 'file'; fin.multiple = true; fin.accept = 'image/*,.heic,.heif'; fin.hidden = true;
    drop.addEventListener('click', () => fin.click());
    fin.addEventListener('change', () => { for (const f of fin.files || []) addBatchFile(f); fin.value = ''; });
    bindDrop(drop, (f) => addBatchFile(f), true);
    batchListEl = el('div', 'studio-batch-list');
    const controls = el('div', 'studio-btn-row');
    batchFormat = document.createElement('select');
    for (const [v, l] of [['png', 'PNG'], ['jpeg', 'JPEG'], ['webp', 'WebP']]) {
      const o = document.createElement('option');
      o.value = v; o.textContent = l;
      batchFormat.appendChild(o);
    }
    batchQuality = document.createElement('input');
    batchQuality.type = 'range'; batchQuality.min = '0.1'; batchQuality.max = '1'; batchQuality.step = '0.05'; batchQuality.value = '0.92';
    const run = btn('Convert all', 'btn btn-primary');
    run.addEventListener('click', () => runBatch());
    const clr = btn('Clear queue', 'btn');
    clr.addEventListener('click', () => { batch.clear(); renderBatchList(); });
    controls.append(batchFormat, batchQuality, run, clr);
    panel.append(drop, fin, controls, batchListEl);
  }

  async function addBatchFile(file) {
    if (!file || file.size > DEFAULT_MAX_BYTES) { setStatus(`Skip ${file?.name || '?'}: size limit`, 'err'); return; }
    try {
      batch.add(file.name, new Uint8Array(await file.arrayBuffer()));
      renderBatchList();
    } catch (e) {
      setStatus(String(e.message || e), 'err');
    }
  }
  function renderBatchList() {
    batchListEl.textContent = '';
    for (const item of batch.items) {
      const row = el('div', 'studio-batch-item');
      row.append(el('span', 'studio-batch-name', item.name), el('span', 'studio-batch-status', item.status + (item.error ? `: ${item.error}` : '')));
      const rm = btn('\u2715', 'btn btn-ghost');
      rm.addEventListener('click', () => { batch.remove(item.id); renderBatchList(); });
      row.appendChild(rm);
      batchListEl.appendChild(row);
    }
  }
  async function runBatch() {
    if (!batch.items.length) { setStatus('Queue empty.', 'info'); return; }
    const format = batchFormat.value;
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    setStatus('Batch converting\u2026', 'info');
    await processQueue(batch.items, async (item) => {
      const det = detectImageFormat(item.bytes);
      if (det.format === 'unknown') throw new Error('unknown format');
      if (det.format === 'heif') {
        const r = await decodeHEIF(item.bytes, { filename: item.name });
        const im = r.images?.[r.primaryIndex ?? 0];
        if (!im?.rgba) throw new Error('HEIF pixels unavailable');
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        c.getContext('2d').putImageData(new ImageData(im.rgba, im.width, im.height), 0, 0);
        item.resultBlob = await canvasToBlob(c, { mimeType: mime, quality: Number(batchQuality.value) });
      } else {
        const url = URL.createObjectURL(new Blob([item.bytes], { type: det.mimeType }));
        try {
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('decode failed')); img.src = url; });
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          item.resultBlob = await canvasToBlob(c, { mimeType: mime, quality: Number(batchQuality.value) });
        } finally { URL.revokeObjectURL(url); }
      }
      item.resultName = exportFilename(item.name, format);
      downloadBlob(item.resultBlob, item.resultName);
      item.status = 'done';
    }, { concurrency: 2 });
    renderBatchList();
    const err = batch.items.filter((i) => i.status === 'error').length;
    setStatus(`Batch done \u00b7 ${batch.items.length - err} ok \u00b7 ${err} failed`, err ? 'info' : 'ok');
  }

  return {
    loadFile: loadConvertFile,
    loadBytes(bytes, name = 'buffer') { return loadConvertFile(new File([bytes], name)); },
    getSourceBytes: () => sourceBytes,
    clear: clearAll,
    refresh() {
      if (mode === 'inspect') refreshInspect();
      if (mode === 'create') redrawCreate();
    },
  };
}
