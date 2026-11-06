/**
 * Structure analyzer + packet layout panels.
 * DOM construction only — no innerHTML with user data.
 */

import * as BC from '../api/babelcodec.js';

export function createStructureView(container, opts = {}) {
  const onDiagnostic = opts.onDiagnostic || (() => {});
  let currentBytes = null;
  let selection = null;

  container.textContent = '';
  container.classList.add('structure-view');

  const structPanel = el('div', { className: 'struct-panel' });
  const structHeader = el('div', { className: 'panel-header' });
  structHeader.appendChild(el('span', { className: 'panel-title', textContent: 'Structure analyzer' }));
  const endianSelect = el('select', { 'aria-label': 'Endianness' });
  endianSelect.append(
    el('option', { value: 'little', textContent: 'Little-endian' }),
    el('option', { value: 'big', textContent: 'Big-endian' }),
  );
  const rangeMeta = el('span', { className: 'diag-meta', textContent: 'Select bytes in the inspector' });
  structHeader.append(endianSelect, rangeMeta);
  const structBody = el('div', { className: 'struct-body' });
  structPanel.append(structHeader, structBody);

  const layoutPanel = el('div', { className: 'layout-panel' });
  const layoutHeader = el('div', { className: 'panel-header' });
  layoutHeader.appendChild(el('span', { className: 'panel-title', textContent: 'Packet layout' }));
  const layoutActions = el('div', { className: 'layout-actions' });
  const applyBtn = el('button', { type: 'button', className: 'btn btn-primary', textContent: 'Apply layout' });
  const exportBtn = el('button', { type: 'button', className: 'btn', textContent: 'Export JSON' });
  const importBtn = el('button', { type: 'button', className: 'btn', textContent: 'Import JSON' });
  const importInput = el('input', { type: 'file', accept: 'application/json,.json' });
  importInput.style.display = 'none';
  layoutActions.append(applyBtn, exportBtn, importBtn, importInput);
  layoutHeader.appendChild(layoutActions);

  const layoutEditor = el('textarea', {
    className: 'layout-editor',
    spellcheck: 'false',
    'aria-label': 'Packet layout JSON',
  });
  layoutEditor.value = exampleLayout();
  const layoutResults = el('div', { className: 'layout-results' });
  layoutPanel.append(layoutHeader, layoutEditor, layoutResults);
  container.append(structPanel, layoutPanel);

  function setBytes(bytes) {
    currentBytes = bytes && bytes.length ? new Uint8Array(bytes) : null;
    refreshStructure();
  }

  function setSelection(sel, slice) {
    selection = sel;
    if (sel && slice) {
      rangeMeta.textContent = `Range ${sel.start}–${sel.end - 1} (${sel.length} byte${sel.length === 1 ? '' : 's'})`;
    } else {
      rangeMeta.textContent = 'Select bytes in the inspector';
    }
    refreshStructure();
  }

  function refreshStructure() {
    structBody.textContent = '';
    if (!currentBytes || !selection || selection.length === 0) {
      structBody.appendChild(el('div', {
        className: 'empty-inspector',
        textContent: 'Select a byte range in the Hex Inspector to interpret.',
      }));
      return;
    }
    try {
      const result = BC.interpretBytes(currentBytes, {
        offset: selection.start,
        length: selection.length,
        endian: endianSelect.value,
      });
      const preview = el('div', { className: 'struct-preview' });
      preview.append(
        el('span', { className: 'diag-meta', textContent: 'Bytes: ' }),
        el('code', { textContent: result.preview || '(empty)' }),
      );
      structBody.appendChild(preview);

      const table = el('table', { className: 'struct-table', role: 'table' });
      const thead = el('thead');
      const hr = el('tr');
      for (const h of ['Type', 'Value', 'Size', 'Status']) hr.appendChild(el('th', { textContent: h }));
      thead.appendChild(hr);
      table.appendChild(thead);
      const tbody = el('tbody');
      const order = [
        'uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32',
        'uint64', 'int64', 'float32', 'float64',
        'hex', 'decimal', 'binary', 'ascii', 'utf8',
      ];
      for (const type of order) {
        const entry = result.values[type];
        if (!entry) continue;
        const tr = el('tr');
        tr.appendChild(el('td', { textContent: type }));
        const valTd = el('td', { className: 'struct-value' });
        if (entry.ok) {
          let display;
          if (typeof entry.value === 'bigint') display = entry.valueString || entry.value.toString();
          else if (entry.value instanceof Uint8Array) {
            display = Array.from(entry.value).map((b) => b.toString(16).padStart(2, '0')).join(' ');
          } else if (entry.valueString != null) display = entry.valueString;
          else display = String(entry.value);
          valTd.textContent = display;
        } else {
          valTd.textContent = entry.error || '—';
          valTd.classList.add('struct-err');
        }
        tr.appendChild(valTd);
        tr.appendChild(el('td', { textContent: String(entry.size ?? '') }));
        tr.appendChild(el('td', {
          textContent: entry.ok ? 'ok' : 'error',
          className: entry.ok ? 'diag-ok' : 'diag-err',
        }));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      structBody.appendChild(table);
    } catch (e) {
      structBody.appendChild(el('div', { className: 'diag-err', textContent: e.message }));
    }
  }

  endianSelect.addEventListener('change', refreshStructure);

  applyBtn.addEventListener('click', () => {
    if (!currentBytes) {
      onDiagnostic('Load or convert bytes before applying a layout.', 'err');
      return;
    }
    let layout;
    try {
      layout = JSON.parse(layoutEditor.value);
    } catch (e) {
      onDiagnostic(`Invalid JSON: ${e.message}`, 'err');
      return;
    }
    const decoded = BC.decodeLayout(currentBytes, layout);
    layoutResults.textContent = '';
    if (!decoded.ok) {
      for (const err of decoded.errors) {
        layoutResults.appendChild(el('div', { className: 'diag-err', textContent: err }));
      }
      onDiagnostic('Layout validation failed.', 'err');
      return;
    }
    if (decoded.validation.warnings?.length) {
      for (const w of decoded.validation.warnings) {
        layoutResults.appendChild(el('div', { className: 'diag-info', textContent: `Warning: ${w}` }));
      }
    }
    const table = el('table', { className: 'struct-table' });
    const thead = el('thead');
    const hr = el('tr');
    for (const h of ['Field', 'Offset', 'Len', 'Type', 'Value', 'Preview']) hr.appendChild(el('th', { textContent: h }));
    thead.appendChild(hr);
    table.appendChild(thead);
    const tbody = el('tbody');
    for (const f of decoded.fields) {
      const tr = el('tr');
      tr.appendChild(el('td', { textContent: f.name }));
      tr.appendChild(el('td', { textContent: String(f.offset) }));
      tr.appendChild(el('td', { textContent: String(f.length) }));
      tr.appendChild(el('td', { textContent: `${f.type}${f.endian ? ' ' + f.endian : ''}` }));
      const valTd = el('td', { className: 'struct-value' });
      if (f.error) {
        valTd.textContent = f.error;
        valTd.classList.add('struct-err');
      } else if (typeof f.value === 'bigint') {
        valTd.textContent = f.valueString || f.value.toString();
      } else if (f.value instanceof Uint8Array) {
        valTd.textContent = f.valueString || '';
      } else {
        valTd.textContent = f.valueString != null ? f.valueString : String(f.value);
      }
      tr.appendChild(valTd);
      tr.appendChild(el('td', { textContent: f.preview || '' }));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    layoutResults.appendChild(table);
    layoutResults.appendChild(el('div', {
      className: 'diag-meta',
      textContent: `Coverage: ${decoded.validation.coveredBytes}/${decoded.byteLength} bytes · gaps: ${decoded.validation.gapBytes}`,
    }));
    onDiagnostic('Layout applied.', 'ok');
  });

  exportBtn.addEventListener('click', () => {
    try {
      const layout = JSON.parse(layoutEditor.value);
      const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = 'babelcodec-layout.json';
      a.click();
      URL.revokeObjectURL(url);
      onDiagnostic('Layout exported.', 'ok');
    } catch (e) {
      onDiagnostic(`Export failed: ${e.message}`, 'err');
    }
  });

  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const layout = JSON.parse(text);
      if (!layout || !Array.isArray(layout.fields)) throw new Error('Layout must contain a fields array');
      layoutEditor.value = JSON.stringify(layout, null, 2);
      onDiagnostic(`Imported layout from ${file.name}`, 'ok');
    } catch (e) {
      onDiagnostic(`Import failed: ${e.message}`, 'err');
    }
    importInput.value = '';
  });

  return { setBytes, setSelection, refresh: refreshStructure };
}

function exampleLayout() {
  return JSON.stringify({
    name: 'example',
    fields: [
      { name: 'msgId', offset: 0, length: 2, type: 'uint16', endian: 'big', description: 'Message ID' },
      { name: 'length', offset: 2, length: 2, type: 'uint16', endian: 'big' },
      { name: 'sequence', offset: 4, length: 4, type: 'uint32', endian: 'little' },
      { name: 'payload', offset: 8, length: 4, type: 'bytes' },
    ],
  }, null, 2);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else if (k === 'placeholder') node.placeholder = v;
    else if (k === 'spellcheck') node.spellcheck = v;
    else if (k.startsWith('aria-') || k === 'role' || k === 'type' || k === 'accept') {
      node.setAttribute(k, v);
    } else {
      try { node.setAttribute(k, v); } catch { /* ignore */ }
    }
  }
  for (const c of children) node.appendChild(c);
  return node;
}
