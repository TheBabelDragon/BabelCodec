/**
 * Media Decoder lab — HEIC/HEIF import, preview, metadata, export, binary link.
 * Follows existing lab pattern: createMediaLab(root, { onDiagnostic, onBytes })
 */

import {
  decodeHEIF,
  inspectContainer,
  convertDecodedImage,
  canEncode,
  extensionSuggestsHeif,
  DEFAULT_MAX_BYTES,
} from '../media/heif/index.js';

/**
 * @param {HTMLElement} root
 * @param {{ onDiagnostic?: Function, onBytes?: Function }} options
 */
export function createMediaLab(root, options = {}) {
  const onDiagnostic = options.onDiagnostic || (() => {});
  const onBytes = options.onBytes || (() => {});

  /** @type {Uint8Array|null} */
  let sourceBytes = null;
  /** @type {string} */
  let sourceName = '';
  /** @type {import('../media/heif/decoder.js').DecodeResult|null} */
  let lastResult = null;
  /** @type {string|null} */
  let previewUrl = null;
  /** @type {AbortController|null} */
  let activeAbort = null;

  root.textContent = '';
  root.classList.add('media-lab');

  // --- layout ---
  const toolbar = el('div', 'media-toolbar toolbar');
  const dropZone = el('div', 'media-dropzone');
  dropZone.tabIndex = 0;
  dropZone.setAttribute('role', 'button');
  dropZone.setAttribute('aria-label', 'Drop HEIC or HEIF file here or click to choose');
  dropZone.innerHTML = ''; // text via textContent children
  const dropLabel = el('div', 'media-drop-label');
  dropLabel.textContent = 'Drop HEIC / HEIF file here, or click to choose';
  const dropHint = el('div', 'media-drop-hint');
  dropHint.textContent = `Max ${Math.round(DEFAULT_MAX_BYTES / (1024 * 1024))} MiB · offline · original bytes stay available for Hex Inspector`;
  dropZone.append(dropLabel, dropHint);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.heic,.heif,.heics,.heifs,.hif,image/heic,image/heif';
  fileInput.hidden = true;

  const btnClear = btn('Clear', 'btn');
  const btnInspect = btn('→ Hex Inspector', 'btn btn-ghost');
  btnInspect.title = 'Send original file bytes to Hex Inspector';
  btnInspect.disabled = true;

  toolbar.append(btnClear, btnInspect);

  const statusBar = el('div', 'media-status');
  statusBar.setAttribute('role', 'status');
  statusBar.textContent = 'No file loaded.';

  const grid = el('div', 'media-grid');

  // Preview panel
  const previewPanel = el('section', 'panel media-preview-panel');
  const previewHeader = el('div', 'panel-header');
  previewHeader.append(el('span', 'panel-title', 'Preview'));
  const previewBody = el('div', 'panel-body media-preview-body');
  const imgEl = document.createElement('img');
  imgEl.alt = 'Decoded image preview';
  imgEl.className = 'media-preview-img';
  imgEl.hidden = true;
  const previewPlaceholder = el('div', 'media-preview-placeholder');
  previewPlaceholder.textContent = 'Decoded image will appear here';
  previewBody.append(imgEl, previewPlaceholder);
  previewPanel.append(previewHeader, previewBody);

  // Info panel
  const infoPanel = el('section', 'panel media-info-panel');
  const infoHeader = el('div', 'panel-header');
  infoHeader.append(el('span', 'panel-title', 'File & Image'));
  const infoBody = el('div', 'panel-body');
  const infoList = el('dl', 'media-info-list');
  infoBody.append(infoList);
  infoPanel.append(infoHeader, infoBody);

  // Export panel
  const exportPanel = el('section', 'panel media-export-panel');
  const exportHeader = el('div', 'panel-header');
  exportHeader.append(el('span', 'panel-title', 'Export'));
  const exportBody = el('div', 'panel-body');
  const exportRow = el('div', 'media-export-row');
  const formatSelect = document.createElement('select');
  formatSelect.setAttribute('aria-label', 'Export format');
  for (const [v, l] of [['png', 'PNG (lossless)'], ['jpeg', 'JPEG'], ['webp', 'WebP']]) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = l;
    formatSelect.appendChild(o);
  }
  const qualityLabel = el('label', '');
  qualityLabel.textContent = 'JPEG quality ';
  const qualityInput = document.createElement('input');
  qualityInput.type = 'range';
  qualityInput.min = '0.1';
  qualityInput.max = '1';
  qualityInput.step = '0.05';
  qualityInput.value = '0.92';
  qualityInput.setAttribute('aria-label', 'JPEG quality');
  const qualityVal = el('span', 'media-quality-val');
  qualityVal.textContent = '0.92';
  qualityLabel.append(qualityInput, qualityVal);
  const btnExport = btn('Download converted', 'btn btn-primary');
  btnExport.disabled = true;
  exportRow.append(formatSelect, qualityLabel, btnExport);
  const exportNote = el('p', 'media-export-note');
  exportNote.textContent = 'Original HEIC/HEIF file is never overwritten. PNG is lossless relative to the decoded raster; JPEG/WebP are lossy.';
  exportBody.append(exportRow, exportNote);
  exportPanel.append(exportHeader, exportBody);

  // Metadata panel
  const metaPanel = el('section', 'panel media-meta-panel');
  const metaHeader = el('div', 'panel-header');
  metaHeader.append(el('span', 'panel-title', 'Metadata & Container'));
  const metaBody = el('div', 'panel-body');
  const metaPre = el('pre', 'media-meta-pre');
  metaPre.textContent = '—';
  const btnMetaJson = btn('Download metadata JSON', 'btn btn-ghost');
  btnMetaJson.disabled = true;
  metaBody.append(metaPre, btnMetaJson);
  metaPanel.append(metaHeader, metaBody);

  // Box tree panel
  const boxPanel = el('section', 'panel media-box-panel');
  const boxHeader = el('div', 'panel-header');
  boxHeader.append(el('span', 'panel-title', 'ISOBMFF Boxes'));
  const boxBody = el('div', 'panel-body');
  const boxTable = document.createElement('table');
  boxTable.className = 'media-box-table';
  boxTable.innerHTML = '<thead><tr><th>Type</th><th>Offset</th><th>Size</th><th>Header</th><th>Path</th></tr></thead>';
  const boxTbody = document.createElement('tbody');
  boxTable.appendChild(boxTbody);
  boxBody.append(boxTable);
  boxPanel.append(boxHeader, boxBody);

  grid.append(previewPanel, infoPanel, exportPanel, metaPanel, boxPanel);
  root.append(toolbar, dropZone, fileInput, statusBar, grid);

  // --- helpers ---
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

  function revokePreview() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    imgEl.removeAttribute('src');
    imgEl.hidden = true;
    previewPlaceholder.hidden = false;
  }

  function clearAll() {
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }
    sourceBytes = null;
    sourceName = '';
    lastResult = null;
    revokePreview();
    infoList.textContent = '';
    metaPre.textContent = '—';
    boxTbody.textContent = '';
    btnExport.disabled = true;
    btnMetaJson.disabled = true;
    btnInspect.disabled = true;
    fileInput.value = '';
    setStatus('Cleared.', 'info');
  }

  function renderInfo(result, fileName, fileSize) {
    infoList.textContent = '';
    const rows = [
      ['Filename', fileName || '—'],
      ['Size', `${fileSize} bytes`],
      ['Status', result.status],
      ['Codec', result.codec || '—'],
      ['Images', String(result.imageCount)],
      ['Primary index', result.primaryIndex != null ? String(result.primaryIndex) : '—'],
    ];
    const primary = result.images[result.primaryIndex ?? 0];
    if (primary) {
      rows.push(
        ['Width', String(primary.width)],
        ['Height', String(primary.height)],
        ['Aspect', primary.height ? (primary.width / primary.height).toFixed(4) : '—'],
        ['Pixels decoded', primary.rgba ? 'yes' : 'no (structural only)'],
      );
    }
    if (result.container?.classification) {
      const c = result.container.classification;
      rows.push(
        ['Major brand', c.majorBrand || '—'],
        ['Compatible', (c.compatibleBrands || []).join(', ') || '—'],
      );
    }
    for (const [k, v] of rows) {
      const dt = el('dt', '', k);
      const dd = el('dd', '', v);
      infoList.append(dt, dd);
    }
  }

  function renderMeta(result) {
    const payload = {
      status: result.status,
      codec: result.codec,
      imageCount: result.imageCount,
      primaryIndex: result.primaryIndex,
      metadata: result.metadata,
      container: {
        classification: result.container?.classification,
        topLevelTypes: result.container?.topLevelTypes,
        boxCount: result.container?.boxCount,
      },
      warnings: result.warnings,
      errors: result.errors,
    };
    metaPre.textContent = JSON.stringify(payload, null, 2);
    btnMetaJson.disabled = false;
  }

  function renderBoxes(bytes) {
    boxTbody.textContent = '';
    try {
      const { flat, errors } = inspectContainer(bytes);
      if (errors?.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = errors.join('; ');
        tr.appendChild(td);
        boxTbody.appendChild(tr);
      }
      for (const b of flat.slice(0, 200)) {
        const tr = document.createElement('tr');
        for (const val of [
          b.type,
          `0x${b.offset.toString(16)} (${b.offset})`,
          String(b.size) + (b.truncated ? ' ⚠ trunc' : ''),
          String(b.headerSize),
          b.path || b.type,
        ]) {
          const td = document.createElement('td');
          td.textContent = val;
          tr.appendChild(td);
        }
        boxTbody.appendChild(tr);
      }
      if (flat.length > 200) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = `… ${flat.length - 200} more boxes omitted`;
        tr.appendChild(td);
        boxTbody.appendChild(tr);
      }
    } catch (e) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = String(e.message || e);
      tr.appendChild(td);
      boxTbody.appendChild(tr);
    }
  }

  async function showPreview(result) {
    revokePreview();
    const idx = result.primaryIndex ?? 0;
    const image = result.images[idx];
    if (!image?.rgba) {
      previewPlaceholder.textContent = result.status === 'structural_only'
        ? 'Structural inspection only — no pixel decoder backend or decode failed'
        : 'No pixel data';
      previewPlaceholder.hidden = false;
      return;
    }
    try {
      const { rgbaToBlob } = await import('../media/heif/convert.js');
      const blob = await rgbaToBlob(image, 'image/png');
      previewUrl = URL.createObjectURL(blob);
      imgEl.src = previewUrl;
      imgEl.hidden = false;
      previewPlaceholder.hidden = true;
    } catch (e) {
      previewPlaceholder.textContent = `Preview failed: ${e.message || e}`;
      previewPlaceholder.hidden = false;
    }
  }

  async function loadFile(file) {
    if (!file) return;
    if (file.size > DEFAULT_MAX_BYTES) {
      setStatus(`File too large: ${file.size} bytes (limit ${DEFAULT_MAX_BYTES}).`, 'err');
      return;
    }
    if (activeAbort) activeAbort.abort();
    activeAbort = new AbortController();
    const signal = activeAbort.signal;

    setStatus(`Loading ${file.name}…`, 'info');
    try {
      const buffer = await file.arrayBuffer();
      if (signal.aborted) return;
      sourceBytes = new Uint8Array(buffer);
      sourceName = file.name;

      // Push original bytes to shared inspector immediately
      onBytes(sourceBytes);
      btnInspect.disabled = false;

      setStatus(`Decoding ${file.name}…`, 'info');
      const result = await decodeHEIF(sourceBytes, {
        filename: file.name,
        maxBytes: DEFAULT_MAX_BYTES,
      });
      if (signal.aborted) return;
      lastResult = result;

      renderInfo(result, file.name, sourceBytes.length);
      renderMeta(result);
      renderBoxes(sourceBytes);
      await showPreview(result);

      const hasPixels = result.images.some((im) => im.rgba);
      btnExport.disabled = !hasPixels;

      if (result.errors.length) {
        setStatus(`Completed with errors: ${result.errors.join('; ')}`, 'err');
      } else if (result.status === 'decoded') {
        setStatus(`Decoded ${result.imageCount} image(s) from ${file.name}.`, 'ok');
      } else if (result.status === 'structural_only') {
        setStatus(`Structural inspection of ${file.name} (pixel decode unavailable).`, 'info');
      } else if (result.status === 'unsupported') {
        setStatus(`Unsupported codec for ${file.name}: ${result.codec || 'unknown'}`, 'err');
      } else {
        setStatus(`Loaded ${file.name}: ${result.status}`, 'info');
      }
    } catch (e) {
      if (signal.aborted) return;
      setStatus(`Failed: ${e.message || e}`, 'err');
    }
  }

  // Events
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) loadFile(f);
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('media-dropzone-active');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('media-dropzone-active');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('media-dropzone-active');
    const f = e.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });

  btnClear.addEventListener('click', clearAll);
  btnInspect.addEventListener('click', () => {
    if (sourceBytes) {
      onBytes(sourceBytes);
      setStatus('Original bytes sent to Hex Inspector.', 'ok');
    }
  });

  qualityInput.addEventListener('input', () => {
    qualityVal.textContent = Number(qualityInput.value).toFixed(2);
  });

  btnExport.addEventListener('click', async () => {
    if (!lastResult) return;
    try {
      const format = formatSelect.value;
      if (format === 'webp' && !canEncode('image/webp')) {
        setStatus('WebP encoding not supported in this browser.', 'err');
        return;
      }
      setStatus('Converting…', 'info');
      const out = await convertDecodedImage(lastResult, {
        format,
        quality: Number(qualityInput.value),
        originalName: sourceName,
      });
      const a = document.createElement('a');
      const url = URL.createObjectURL(out.blob);
      a.href = url;
      a.download = out.filename;
      a.click();
      URL.revokeObjectURL(url);
      setStatus(`Downloaded ${out.filename} (${out.mimeType}${out.lossless ? ', lossless' : ''}).`, 'ok');
    } catch (e) {
      setStatus(`Export failed: ${e.message || e}`, 'err');
    }
  });

  btnMetaJson.addEventListener('click', () => {
    if (!lastResult) return;
    const payload = {
      filename: sourceName,
      status: lastResult.status,
      codec: lastResult.codec,
      metadata: lastResult.metadata,
      container: lastResult.container,
      warnings: lastResult.warnings,
      errors: lastResult.errors,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = (sourceName || 'heif').replace(/\.(heic|heif)$/i, '') + '-metadata.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  return {
    loadFile,
    loadBytes(bytes, name = 'buffer.heic') {
      const file = new File([bytes], name, { type: 'image/heic' });
      return loadFile(file);
    },
    getSourceBytes: () => sourceBytes,
    getResult: () => lastResult,
    clear: clearAll,
    refresh() {},
  };
}
