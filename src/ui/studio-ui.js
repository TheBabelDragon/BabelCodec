/**
 * Image Studio — Create · Convert · Inspect · Batch · Generate
 * Extends Media Lab; offline Canvas/SVG; HEIF via existing structural decoder.
 * Generation pipeline is optional and offline-first (mock provider by default).
 */

import {
  decodeHEIF,
  inspectContainer,
  DEFAULT_MAX_BYTES,
} from '../media/heif/index.js';
import {
  detectImageFormat,
  inspectImageBytes,
  canEncodeMime,
  canvasToBlob,
  exportFilename,
} from '../media/image/index.js';
import {
  createScene,
  addObject,
  removeObject,
  updateObject,
  renderSceneToCanvas,
  sceneToSvg,
  CANVAS_PRESETS,
  createBatchQueue,
  processQueue,
} from '../media/studio/index.js';
import { buildGeneratePanel } from './generation-ui.js';

/**
 * @param {HTMLElement} root
 * @param {{ onDiagnostic?: Function, onBytes?: Function, onNavigate?: Function }} options
 */
export function createMediaLab(root, options = {}) {
  const onDiagnostic = options.onDiagnostic || (() => {});
  const onBytes = options.onBytes || (() => {});
  const onNavigate = options.onNavigate || (() => {});

  /** @type {'create'|'convert'|'inspect'|'batch'|'generate'} */
  let mode = 'convert';
  /** @type {Uint8Array|null} */
  let sourceBytes = null;
  let sourceName = '';
  /** @type {string|null} */
  let previewUrl = null;
  let loadGen = 0;
  /** @type {ReturnType<typeof createScene>} */
  let scene = createScene(800, 600, '#1c2029');
  let selectedId = null;
  /** @type {ReturnType<typeof createBatchQueue>} */
  const batch = createBatchQueue(24);
  /** @type {HTMLCanvasElement|null} */
  let createCanvas = null;
  let generateApi = null;

  root.textContent = '';
  root.classList.add('media-lab', 'image-studio');

  const shell = el('div', 'studio-shell');
  const modeNav = el('div', 'studio-mode-nav');
  const modes = [
    ['create', 'Create'],
    ['convert', 'Convert'],
    ['inspect', 'Inspect'],
    ['batch', 'Batch'],
    ['generate', 'Generate'],
  ];
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
    generate: el('div', 'studio-panel studio-panel-generate'),
  };

  const statusBar = el('div', 'media-status');
  statusBar.setAttribute('role', 'status');
  statusBar.textContent = 'Image Studio ready.';

  shell.append(
    modeNav,
    panels.create,
    panels.convert,
    panels.inspect,
    panels.batch,
    panels.generate,
    statusBar
  );
  root.appendChild(shell);

  buildCreate(panels.create);
  buildConvert(panels.convert);
  buildInspect(panels.inspect);
  buildBatch(panels.batch);
  generateApi = buildGeneratePanel(panels.generate, {
    el,
    btn,
    setStatus,
    notifyBytes,
    onNavigate,
  });
  setMode('convert');

  function el(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function btn(label, cls) {
    const b = el('button', cls || 'studio-btn');
    b.type = 'button';
    b.textContent = label;
    return b;
  }
  function setStatus(msg) {
    statusBar.textContent = msg || '';
    onDiagnostic(msg);
  }
  function setMode(id) {
    mode = id;
    for (const [k, p] of Object.entries(panels)) {
      p.hidden = k !== id;
      modeBtns[k]?.classList.toggle('active', k === id);
    }
    if (id === 'create') redrawCreate();
    if (id === 'inspect') refreshInspect();
    if (id === 'generate' && generateApi?.refresh) generateApi.refresh();
  }

  function revokePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  }

  function notifyBytes(bytes) {
    sourceBytes = bytes;
    onBytes(bytes);
  }

  let wInput, hInput, bgInput, objList;
  function buildCreate(panel) {
    const toolbar = el('div', 'studio-toolbar');
    const presets = el('div', 'studio-presets');
    const presetEntries = Array.isArray(CANVAS_PRESETS)
      ? CANVAS_PRESETS.map((p) => [p.label, [p.w, p.h]])
      : Object.entries(CANVAS_PRESETS || { '800×600': [800, 600] });
    for (const [name, dims] of presetEntries) {
      const [w, h] = dims;
      const b = btn(name, 'studio-chip');
      b.addEventListener('click', () => {
        wInput.value = String(w);
        hInput.value = String(h);
        applyCanvasSize();
      });
      presets.appendChild(b);
    }
    wInput = el('input', 'studio-input');
    wInput.type = 'number';
    wInput.value = '800';
    wInput.min = '1';
    hInput = el('input', 'studio-input');
    hInput.type = 'number';
    hInput.value = '600';
    hInput.min = '1';
    bgInput = el('input', 'studio-input');
    bgInput.type = 'color';
    bgInput.value = '#1c2029';
    const applyBtn = btn('Apply size', 'studio-btn');
    applyBtn.addEventListener('click', applyCanvasSize);
    bgInput.addEventListener('change', () => {
      scene.background = bgInput.value;
      redrawCreate();
    });
    toolbar.append(presets, labelWrap('W', wInput), labelWrap('H', hInput), labelWrap('BG', bgInput), applyBtn);

    const tools = el('div', 'studio-tools');
    for (const kind of ['rect', 'ellipse', 'text', 'line']) {
      const b = btn(kind, 'studio-chip');
      b.addEventListener('click', () => addShape(kind));
      tools.appendChild(b);
    }
    const exportRow = el('div', 'studio-export-row');
    for (const fmt of ['png', 'jpeg', 'webp', 'svg']) {
      const b = btn('Export ' + fmt.toUpperCase(), 'studio-btn');
      b.addEventListener('click', () => exportCreate(fmt));
      exportRow.appendChild(b);
    }
    const canvasWrap = el('div', 'studio-canvas-wrap');
    createCanvas = el('canvas', 'studio-canvas');
    canvasWrap.appendChild(createCanvas);
    objList = el('div', 'studio-obj-list');
    panel.append(toolbar, tools, canvasWrap, objList, exportRow);
    redrawCreate();
  }
  function labelWrap(lab, input) {
    const w = el('label', 'studio-field');
    w.textContent = lab + ' ';
    w.appendChild(input);
    return w;
  }
  function applyCanvasSize() {
    const w = Math.max(1, parseInt(wInput.value, 10) || 800);
    const h = Math.max(1, parseInt(hInput.value, 10) || 600);
    scene.width = w;
    scene.height = h;
    redrawCreate();
  }
  function addShape(kind) {
    const id = addObject(scene, {
      type: kind,
      x: 40 + scene.objects.length * 12,
      y: 40 + scene.objects.length * 12,
      w: kind === 'line' ? 120 : 100,
      h: kind === 'line' ? 0 : 60,
      fill: kind === 'text' ? '#e8eaed' : '#4a90d9',
      stroke: '#8ab4f8',
      text: kind === 'text' ? 'Text' : undefined,
      fontSize: 24,
    });
    selectedId = id;
    redrawCreate();
  }
  function redrawCreate() {
    if (!createCanvas) return;
    renderSceneToCanvas(scene, createCanvas);
    objList.textContent = '';
    for (const o of scene.objects) {
      const row = el('div', 'studio-obj-row' + (o.id === selectedId ? ' selected' : ''));
      row.textContent = `${o.type} #${o.id}`;
      row.addEventListener('click', () => {
        selectedId = o.id;
        redrawCreate();
      });
      const del = btn('×', 'studio-btn-icon');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        removeObject(scene, o.id);
        if (selectedId === o.id) selectedId = null;
        redrawCreate();
      });
      row.appendChild(del);
      objList.appendChild(row);
    }
  }
  async function exportCreate(fmt) {
    try {
      if (fmt === 'svg') {
        const svg = sceneToSvg(scene);
        downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), exportFilename(sourceName || 'scene', 'svg'));
        setStatus('Exported SVG');
        return;
      }
      const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png';
      if (!canEncodeMime(mime)) {
        setStatus(`Browser cannot encode ${mime}`);
        return;
      }
      const canvas = document.createElement('canvas');
      renderSceneToCanvas(scene, canvas);
      const blob = await canvasToBlob(canvas, { mimeType: mime, quality: 0.92 });
      downloadBlob(blob, exportFilename(sourceName || 'scene', fmt === 'jpeg' ? 'jpg' : fmt));
      setStatus(`Exported ${fmt.toUpperCase()}`);
    } catch (e) {
      setStatus('Export failed: ' + (e && e.message ? e.message : e));
    }
  }

  let convertPreview, convertInfo, qualityInput, formatSelect;
  function buildConvert(panel) {
    const drop = el('div', 'studio-dropzone');
    drop.textContent = 'Drop image or click to open (PNG/JPEG/WebP/GIF/BMP/HEIF)';
    drop.tabIndex = 0;
    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,.heic,.heif';
    fileInput.hidden = true;
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('drag');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
      const f = e.dataTransfer?.files?.[0];
      if (f) loadFile(f);
    });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files?.[0];
      if (f) loadFile(f);
      fileInput.value = '';
    });

    convertPreview = el('img', 'studio-preview');
    convertPreview.alt = 'Preview';
    convertInfo = el('div', 'studio-meta');
    qualityInput = el('input', 'studio-input');
    qualityInput.type = 'range';
    qualityInput.min = '0.1';
    qualityInput.max = '1';
    qualityInput.step = '0.01';
    qualityInput.value = '0.92';
    formatSelect = el('select', 'studio-select');
    for (const [v, t] of [
      ['image/png', 'PNG'],
      ['image/jpeg', 'JPEG'],
      ['image/webp', 'WebP'],
    ]) {
      const o = el('option');
      o.value = v;
      o.textContent = t;
      formatSelect.appendChild(o);
    }
    const exportBtn = btn('Export', 'studio-btn primary');
    exportBtn.addEventListener('click', exportConvert);
    const clearBtn = btn('Clear', 'studio-btn');
    clearBtn.addEventListener('click', clearSource);
    const toInspect = btn('Open in Hex', 'studio-btn');
    toInspect.addEventListener('click', () => onNavigate('inspector'));

    const controls = el('div', 'studio-controls');
    controls.append(labelWrap('Quality', qualityInput), labelWrap('Format', formatSelect), exportBtn, clearBtn, toInspect);
    panel.append(drop, fileInput, convertPreview, convertInfo, controls);
  }

  async function loadFile(file) {
    const gen = ++loadGen;
    setStatus('Loading ' + file.name + '…');
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      if (gen !== loadGen) return;
      if (buf.length > DEFAULT_MAX_BYTES) {
        setStatus(`File exceeds max size (${DEFAULT_MAX_BYTES} bytes)`);
        return;
      }
      sourceName = file.name || 'image';
      notifyBytes(buf);
      const det = detectImageFormat(buf);
      revokePreview();
      if (det.format === 'heif') {
        const info = inspectContainer(buf);
        convertInfo.textContent = `HEIF structural · ${info?.brands?.join(', ') || 'boxes'} · pixel decode only if backend registered`;
        convertPreview.removeAttribute('src');
        setStatus('HEIF loaded (structural). Register decoder backend for pixels.');
        return;
      }
      const blob = new Blob([buf], { type: det.mimeType || file.type || 'application/octet-stream' });
      previewUrl = URL.createObjectURL(blob);
      convertPreview.src = previewUrl;
      convertInfo.textContent = `${det.format} · ${buf.length} bytes · ${sourceName}`;
      setStatus(`Loaded ${det.format}`);
    } catch (e) {
      setStatus('Load failed: ' + (e && e.message ? e.message : e));
    }
  }

  function clearSource() {
    loadGen++;
    revokePreview();
    sourceName = '';
    notifyBytes(null);
    convertPreview.removeAttribute('src');
    convertInfo.textContent = '';
    setStatus('Cleared');
  }

  async function exportConvert() {
    if (!sourceBytes) {
      setStatus('No image loaded');
      return;
    }
    const mime = formatSelect.value;
    const quality = parseFloat(qualityInput.value) || 0.92;
    try {
      const det = detectImageFormat(sourceBytes);
      if (det.format === 'heif') {
        const decoded = await decodeHEIF(sourceBytes);
        if (!decoded || !decoded.imageData) {
          setStatus('HEIF pixel decode unavailable (no backend)');
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = decoded.imageData.width;
        canvas.height = decoded.imageData.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(decoded.imageData, 0, 0);
        const blob = await canvasToBlob(canvas, { mimeType: mime, quality });
        downloadBlob(blob, exportFilename(sourceName, mimeExt(mime)));
        setStatus('Exported from HEIF');
        return;
      }
      if (!previewUrl) {
        setStatus('No preview');
        return;
      }
      const img = convertPreview;
      if (!img.naturalWidth) {
        setStatus('Image not ready');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const blob = await canvasToBlob(canvas, { mimeType: mime, quality });
      downloadBlob(blob, exportFilename(sourceName, mimeExt(mime)));
      setStatus('Exported ' + mime);
    } catch (e) {
      setStatus('Export failed: ' + (e && e.message ? e.message : e));
    }
  }

  function mimeExt(mime) {
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/webp') return 'webp';
    return 'png';
  }

  let inspectMeta, inspectBoxes;
  function buildInspect(panel) {
    const jump = btn('Open bytes in Hex Inspector', 'studio-btn');
    jump.addEventListener('click', () => onNavigate('inspector'));
    inspectMeta = el('pre', 'studio-inspect-meta');
    inspectBoxes = el('pre', 'studio-inspect-boxes');
    panel.append(inspectMeta, inspectBoxes, jump);
  }
  function refreshInspect() {
    if (!sourceBytes) {
      inspectMeta.textContent = 'No file loaded. Use Convert, Batch, or Generate.';
      inspectBoxes.textContent = '';
      return;
    }
    const det = detectImageFormat(sourceBytes);
    const info = inspectImageBytes(sourceBytes);
    inspectMeta.textContent = JSON.stringify({ format: det.format, mime: det.mimeType, bytes: sourceBytes.length, ...info }, null, 2);
    if (det.format === 'heif') {
      try {
        const c = inspectContainer(sourceBytes);
        inspectBoxes.textContent = JSON.stringify(c, null, 2);
      } catch (e) {
        inspectBoxes.textContent = String(e);
      }
    } else {
      inspectBoxes.textContent = '';
    }
  }

  let batchListEl, batchFormat, batchQuality;
  function buildBatch(panel) {
    const drop = el('div', 'studio-dropzone');
    drop.textContent = 'Drop multiple images for batch convert';
    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.accept = 'image/*,.heic,.heif';
    fileInput.hidden = true;
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('dragover', (e) => e.preventDefault());
    drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files || [])];
      await enqueueFiles(files);
    });
    fileInput.addEventListener('change', async () => {
      await enqueueFiles([...(fileInput.files || [])]);
      fileInput.value = '';
    });
    batchFormat = el('select', 'studio-select');
    for (const [v, t] of [
      ['image/png', 'PNG'],
      ['image/jpeg', 'JPEG'],
      ['image/webp', 'WebP'],
    ]) {
      const o = el('option');
      o.value = v;
      o.textContent = t;
      batchFormat.appendChild(o);
    }
    batchQuality = el('input', 'studio-input');
    batchQuality.type = 'range';
    batchQuality.min = '0.1';
    batchQuality.max = '1';
    batchQuality.step = '0.01';
    batchQuality.value = '0.92';
    const runBtn = btn('Run batch', 'studio-btn primary');
    runBtn.addEventListener('click', runBatch);
    const clearBtn = btn('Clear queue', 'studio-btn');
    clearBtn.addEventListener('click', () => {
      batch.items.length = 0;
      renderBatchList();
    });
    batchListEl = el('div', 'studio-batch-list');
    panel.append(drop, fileInput, labelWrap('Format', batchFormat), labelWrap('Quality', batchQuality), runBtn, clearBtn, batchListEl);
  }

  async function enqueueFiles(files) {
    for (const f of files) {
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        batch.items.push({ name: f.name, bytes: buf, status: 'queued', error: null, result: null });
      } catch (e) {
        batch.items.push({ name: f.name, bytes: null, status: 'error', error: String(e), result: null });
      }
    }
    renderBatchList();
  }

  function renderBatchList() {
    batchListEl.textContent = '';
    for (const item of batch.items) {
      const row = el('div', 'studio-batch-row');
      row.textContent = `${item.name} — ${item.status}${item.error ? ': ' + item.error : ''}`;
      if (item.result) {
        const a = el('a');
        a.href = URL.createObjectURL(item.result);
        a.download = exportFilename(item.name, mimeExt(batchFormat.value));
        a.textContent = 'Download';
        row.appendChild(a);
      }
      batchListEl.appendChild(row);
    }
  }

  async function runBatch() {
    const mime = batchFormat.value;
    const quality = parseFloat(batchQuality.value) || 0.92;
    setStatus('Batch running…');
    await processQueue(batch, async (item) => {
      if (!item.bytes) throw new Error('no bytes');
      const det = detectImageFormat(item.bytes);
      if (det.format === 'heif') {
        const decoded = await decodeHEIF(item.bytes);
        if (!decoded?.imageData) throw new Error('HEIF pixel decode unavailable');
        const canvas = document.createElement('canvas');
        canvas.width = decoded.imageData.width;
        canvas.height = decoded.imageData.height;
        canvas.getContext('2d').putImageData(decoded.imageData, 0, 0);
        return canvasToBlob(canvas, { mimeType: mime, quality });
      }
      const blob = new Blob([item.bytes], { type: det.mimeType });
      const url = URL.createObjectURL(blob);
      try {
        const img = await loadImage(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        return canvasToBlob(canvas, { mimeType: mime, quality });
      } finally {
        URL.revokeObjectURL(url);
      }
    });
    renderBatchList();
    setStatus('Batch done');
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image load failed'));
      img.src = url;
    });
  }

  function downloadBlob(blob, name) {
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  return {
    setMode,
    loadBytes(bytes, name) {
      sourceName = name || 'image';
      notifyBytes(bytes);
      const det = detectImageFormat(bytes);
      revokePreview();
      if (det.format !== 'heif') {
        previewUrl = URL.createObjectURL(new Blob([bytes], { type: det.mimeType }));
        convertPreview.src = previewUrl;
      }
      convertInfo.textContent = `${det.format} · ${bytes.length} bytes`;
      if (mode === 'inspect') refreshInspect();
      if (mode === 'create') redrawCreate();
    },
  };
}
