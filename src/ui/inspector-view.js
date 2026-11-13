/**
 * Hex-grid inspector view — virtualized rendering for large buffers.
 *
 * Selection model:
 * - Offsets are zero-based.
 * - selection.end is exclusive.
 * - Copy All always uses the full buffer, even when a selection exists.
 * - Copy Selection requires a non-empty selection.
 */

import * as HexGrid from '../core/hexgrid.js?v=0.2.1';
import * as Search from '../core/search.js?v=0.2.1';
import { encodeHex } from '../core/hex.js';
import { encodeBase64 } from '../core/base64.js';
import { encodeBinary } from '../core/binary.js';
import {
  resolveExportBytes,
  encodeExportText,
  exportFilename,
  writeClipboardText,
} from '../core/inspector-export.js';

/** Bound to core modules so a stale babelcodec.js cache cannot break the inspector. */
const BC = {
  buildHexGrid: HexGrid.buildHexGrid,
  parseOffset: HexGrid.parseOffset,
  selectionFromClick: HexGrid.selectionFromClick,
  sliceSelection: HexGrid.sliceSelection,
  searchBytes: Search.searchBytes,
  encodeHex,
  encodeBase64,
  encodeBinary,
  resolveExportBytes,
  encodeExportText,
  exportFilename,
  writeClipboardText,
};

const ROW_HEIGHT = 22;
const MAX_DOM_ROWS = 64;

export function createInspectorView(container, opts = {}) {
  const state = {
    bytes: null,
    bytesPerRow: 16,
    selection: null,
    searchMatches: [],
    searchIndex: -1,
    scrollOffset: 0,
    currentOffset: 0,
  };

  const onSelectionChange = opts.onSelectionChange || (() => {});
  const onDiagnostic = opts.onDiagnostic || (() => {});

  container.innerHTML = '';
  container.classList.add('hex-inspector');

  // —— Status bar (always visible) ——
  const statusBar = el('div', { className: 'hex-status', role: 'status', 'aria-live': 'polite' });
  const statusTotal = el('span', { className: 'hex-status-item', dataset: { key: 'total' }, textContent: 'Total: 0 B' });
  const statusSel = el('span', { className: 'hex-status-item', dataset: { key: 'sel' }, textContent: 'Sel: none' });
  const statusOffset = el('span', { className: 'hex-status-item', dataset: { key: 'offset' }, textContent: 'Offset: —' });
  const statusWidth = el('span', { className: 'hex-status-item', dataset: { key: 'width' }, textContent: 'Width: 16' });
  const statusMatches = el('span', { className: 'hex-status-item', dataset: { key: 'matches' }, textContent: 'Matches: 0' });
  statusBar.append(statusTotal, statusSel, statusOffset, statusWidth, statusMatches);

  // —— Toolbar ——
  const toolbar = el('div', { className: 'hex-toolbar' });
  const bprSelect = el('select', { 'aria-label': 'Bytes per row' });
  for (const n of [8, 16, 32]) {
    const o = el('option', { value: String(n), textContent: `${n} / row` });
    if (n === 16) o.selected = true;
    bprSelect.appendChild(o);
  }
  const jumpInput = el('input', {
    type: 'text',
    placeholder: 'Offset (dec or 0x…)',
    'aria-label': 'Jump to offset',
    className: 'hex-jump',
  });
  const jumpBtn = el('button', { type: 'button', className: 'btn', textContent: 'Go' });
  const searchInput = el('input', {
    type: 'text',
    placeholder: 'Search hex / text',
    'aria-label': 'Search pattern',
    className: 'hex-search',
  });
  const searchMode = el('select', { 'aria-label': 'Search mode' });
  for (const [v, l] of [['hex', 'Hex'], ['ascii', 'ASCII'], ['utf8', 'UTF-8']]) {
    searchMode.appendChild(el('option', { value: v, textContent: l }));
  }
  const searchBtn = el('button', { type: 'button', className: 'btn', textContent: 'Find' });
  const prevBtn = el('button', { type: 'button', className: 'btn', textContent: '◀' });
  const nextBtn = el('button', { type: 'button', className: 'btn', textContent: '▶' });
  const clearSearchBtn = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Clear search' });
  const matchMeta = el('span', { className: 'diag-meta', textContent: '' });
  const selMeta = el('span', { className: 'sel-meta', textContent: 'No selection' });

  toolbar.append(
    el('label', {}, [document.createTextNode('Width '), bprSelect]),
    jumpInput, jumpBtn, searchInput, searchMode, searchBtn, prevBtn, nextBtn, clearSearchBtn, matchMeta, selMeta,
  );

  // —— Explicit Copy / Download bar ——
  // Copy All is independent of selection. Copy Selection requires a non-empty selection.
  const copyBar = el('div', { className: 'hex-copybar' });
  const copyActions = [
    { scope: 'all', format: 'hex', label: 'Copy All Hex' },
    { scope: 'selection', format: 'hex', label: 'Copy Sel Hex' },
    { scope: 'all', format: 'base64', label: 'Copy All Base64' },
    { scope: 'selection', format: 'base64', label: 'Copy Sel Base64' },
    { scope: 'all', format: 'binary', label: 'Copy All Binary' },
    { scope: 'selection', format: 'binary', label: 'Copy Sel Binary' },
    { scope: 'all', format: 'bin', label: 'Download All' },
    { scope: 'selection', format: 'bin', label: 'Download Sel' },
  ];
  for (const a of copyActions) {
    const btn = el('button', {
      type: 'button',
      className: 'btn btn-ghost',
      textContent: a.label,
      dataset: { scope: a.scope, format: a.format },
    });
    copyBar.appendChild(btn);
  }

  const scroll = el('div', { className: 'hex-scroll', tabIndex: 0, role: 'grid', 'aria-label': 'Hex inspector grid' });
  const spacer = el('div', { className: 'hex-spacer' });
  const viewport = el('div', { className: 'hex-viewport' });
  scroll.append(spacer, viewport);
  container.append(statusBar, toolbar, copyBar, scroll);

  function updateStatus() {
    const total = state.bytes ? state.bytes.length : 0;
    statusTotal.textContent = `Total: ${total} B`;

    if (state.selection && state.selection.length > 0) {
      const { start, end, length } = state.selection;
      // end is exclusive; display inclusive last byte for human readability
      const last = end - 1;
      statusSel.textContent = `Sel: ${start}–${last} (len ${length}, end exclusive ${end})`;
    } else {
      statusSel.textContent = 'Sel: none';
    }

    statusOffset.textContent =
      state.bytes && state.bytes.length
        ? `Offset: ${state.currentOffset} (0x${state.currentOffset.toString(16).toUpperCase()})`
        : 'Offset: —';

    statusWidth.textContent = `Width: ${state.bytesPerRow}`;
    statusMatches.textContent = `Matches: ${state.searchMatches.length}`;

    // Enable / disable selection-scoped buttons
    const hasSel = !!(state.selection && state.selection.length > 0);
    for (const btn of copyBar.querySelectorAll('button[data-scope="selection"]')) {
      btn.disabled = !hasSel;
      btn.title = hasSel ? '' : 'Select one or more bytes first';
    }
  }

  function setBytes(bytes) {
    state.bytes = bytes && bytes.length ? new Uint8Array(bytes) : null;
    state.selection = null;
    state.searchMatches = [];
    state.searchIndex = -1;
    state.scrollOffset = 0;
    state.currentOffset = 0;
    render();
    updateSelMeta();
    updateStatus();
    matchMeta.textContent = '';
  }

  function totalRows() {
    if (!state.bytes) return 0;
    return Math.ceil(state.bytes.length / state.bytesPerRow) || 1;
  }

  function render() {
    if (!state.bytes || state.bytes.length === 0) {
      spacer.style.height = '0px';
      viewport.textContent = '';
      viewport.appendChild(el('div', { className: 'empty-inspector', textContent: 'No bytes to inspect. Convert or load a file.' }));
      updateStatus();
      return;
    }

    const rows = totalRows();
    spacer.style.height = `${rows * ROW_HEIGHT}px`;
    const viewH = scroll.clientHeight || 240;
    const visible = Math.ceil(viewH / ROW_HEIGHT) + 4;
    const first = Math.max(0, Math.floor(scroll.scrollTop / ROW_HEIGHT) - 2);
    const last = Math.min(rows, first + Math.max(visible, MAX_DOM_ROWS));
    state.scrollOffset = first;

    const startByte = first * state.bytesPerRow;
    const endByte = Math.min(state.bytes.length, last * state.bytesPerRow);
    const grid = BC.buildHexGrid(state.bytes, {
      bytesPerRow: state.bytesPerRow,
      startOffset: startByte,
      endOffset: endByte,
    });

    viewport.textContent = '';
    viewport.style.transform = `translateY(${first * ROW_HEIGHT}px)`;

    const table = el('div', { className: 'hex-grid' });
    for (const row of grid.rows) {
      const rowEl = el('div', { className: 'hex-row', role: 'row', dataset: { offset: String(row.offset) } });
      rowEl.style.height = `${ROW_HEIGHT}px`;
      rowEl.appendChild(el('span', { className: 'hex-offset', textContent: row.offsetHex }));

      const hexGroup = el('span', { className: 'hex-bytes' });
      for (let c = 0; c < state.bytesPerRow; c++) {
        const abs = row.offset + c;
        const cell = el('span', { className: 'hex-byte', role: 'gridcell', dataset: { offset: String(abs) } });
        if (c < row.hexCells.length && row.hexCells[c]) {
          cell.textContent = row.hexCells[c];
          if (state.selection && abs >= state.selection.start && abs < state.selection.end) cell.classList.add('selected');
          if (state.searchMatches.includes(abs)) cell.classList.add('match');
        } else {
          cell.textContent = '  ';
          cell.classList.add('empty');
        }
        if (c > 0 && c % 8 === 0) cell.classList.add('group-break');
        hexGroup.appendChild(cell);
      }
      rowEl.appendChild(hexGroup);

      const ascii = el('span', { className: 'hex-ascii', textContent: row.ascii });
      if (state.selection) {
        const rowEnd = row.offset + state.bytesPerRow;
        if (state.selection.start < rowEnd && state.selection.end > row.offset) ascii.classList.add('selected-row');
      }
      rowEl.appendChild(ascii);
      table.appendChild(rowEl);
    }
    viewport.appendChild(table);
    updateStatus();
  }

  function updateSelMeta() {
    if (!state.selection || !state.bytes) {
      selMeta.textContent = 'No selection';
      onSelectionChange(null, null);
      updateStatus();
      return;
    }
    const { start, end, length } = state.selection;
    const slice = BC.sliceSelection(state.bytes, state.selection);
    const hex = BC.encodeHex(slice, { separator: ' ' });
    selMeta.textContent = `Sel ${start}–${end - 1} (${length} byte${length === 1 ? '' : 's'}) · ${hex.slice(0, 48)}${hex.length > 48 ? '…' : ''}`;
    onSelectionChange(state.selection, slice);
    updateStatus();
  }

  function selectByte(offset, extend) {
    if (!state.bytes || offset < 0 || offset >= state.bytes.length) return;
    const anchor = state.selection?.anchor ?? state.selection?.start ?? null;
    state.selection = BC.selectionFromClick(offset, anchor, state.bytes.length, extend);
    state.currentOffset = offset;
    render();
    updateSelMeta();
  }

  bprSelect.addEventListener('change', () => {
    state.bytesPerRow = Number(bprSelect.value) || 16;
    render();
  });

  jumpBtn.addEventListener('click', () => {
    if (!state.bytes) return;
    try {
      const off = BC.parseOffset(jumpInput.value, state.bytes.length);
      selectByte(off, false);
      scroll.scrollTop = Math.floor(off / state.bytesPerRow) * ROW_HEIGHT;
      onDiagnostic(`Jumped to offset ${off} (0x${off.toString(16).toUpperCase()})`, 'ok');
    } catch (e) {
      onDiagnostic(e.message, 'err');
    }
  });
  jumpInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') jumpBtn.click(); });

  function runSearch() {
    if (!state.bytes) return;
    const pattern = searchInput.value;
    if (!pattern.trim()) {
      onDiagnostic('Empty search pattern rejected.', 'err');
      return;
    }
    try {
      const result = BC.searchBytes(state.bytes, pattern, { mode: searchMode.value, maxResults: 5000 });
      state.searchMatches = result.matches.slice();
      state.searchIndex = result.count > 0 ? 0 : -1;
      matchMeta.textContent =
        result.count === 0 ? 'No matches' : `${result.count} match${result.count === 1 ? '' : 'es'}${result.truncated ? ' (truncated)' : ''}`;
      if (state.searchIndex >= 0) {
        const off = result.matches[0];
        selectByte(off, false);
        scroll.scrollTop = Math.floor(off / state.bytesPerRow) * ROW_HEIGHT;
      }
      render();
      updateStatus();
      onDiagnostic(result.count ? `Found ${result.count} match(es)` : 'No matches', result.count ? 'ok' : 'info');
    } catch (e) {
      onDiagnostic(e.message, 'err');
    }
  }

  searchBtn.addEventListener('click', runSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });

  clearSearchBtn.addEventListener('click', () => {
    state.searchMatches = [];
    state.searchIndex = -1;
    matchMeta.textContent = '';
    render();
    updateStatus();
    onDiagnostic('Search cleared.', 'info');
  });

  nextBtn.addEventListener('click', () => {
    if (!state.searchMatches.length) return;
    state.searchIndex = (state.searchIndex + 1) % state.searchMatches.length;
    const off = state.searchMatches[state.searchIndex];
    selectByte(off, false);
    scroll.scrollTop = Math.floor(off / state.bytesPerRow) * ROW_HEIGHT;
    matchMeta.textContent = `Match ${state.searchIndex + 1}/${state.searchMatches.length}`;
    updateStatus();
  });
  prevBtn.addEventListener('click', () => {
    if (!state.searchMatches.length) return;
    state.searchIndex = (state.searchIndex - 1 + state.searchMatches.length) % state.searchMatches.length;
    const off = state.searchMatches[state.searchIndex];
    selectByte(off, false);
    scroll.scrollTop = Math.floor(off / state.bytesPerRow) * ROW_HEIGHT;
    matchMeta.textContent = `Match ${state.searchIndex + 1}/${state.searchMatches.length}`;
    updateStatus();
  });

  scroll.addEventListener('scroll', () => { window.requestAnimationFrame(render); });

  viewport.addEventListener('click', (e) => {
    const cell = e.target.closest('.hex-byte');
    if (!cell || cell.classList.contains('empty')) return;
    selectByte(Number(cell.dataset.offset), e.shiftKey);
  });

  scroll.addEventListener('keydown', (e) => {
    if (!state.bytes || !state.selection) return;
    let next = state.selection.anchor ?? state.selection.start;
    if (e.key === 'ArrowRight') next += 1;
    else if (e.key === 'ArrowLeft') next -= 1;
    else if (e.key === 'ArrowDown') next += state.bytesPerRow;
    else if (e.key === 'ArrowUp') next -= state.bytesPerRow;
    else return;
    e.preventDefault();
    next = Math.max(0, Math.min(state.bytes.length - 1, next));
    selectByte(next, e.shiftKey);
    const row = Math.floor(next / state.bytesPerRow);
    const top = row * ROW_HEIGHT;
    if (top < scroll.scrollTop) scroll.scrollTop = top;
    if (top >= scroll.scrollTop + scroll.clientHeight - ROW_HEIGHT) {
      scroll.scrollTop = top - scroll.clientHeight + ROW_HEIGHT * 2;
    }
  });

  async function performExport(scope, format) {
    if (!state.bytes) {
      onDiagnostic('No buffer loaded.', 'info');
      return;
    }

    const resolved = BC.resolveExportBytes(state.bytes, scope, state.selection);
    if (!resolved.ok) {
      onDiagnostic(resolved.error, 'err');
      return;
    }

    const { data, start, end, length } = resolved;
    const scopeLabel = scope === 'all' ? 'All' : `Sel ${start}–${end - 1}`;

    // Raw binary download
    if (format === 'bin') {
      try {
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = BC.exportFilename(scope, 'bin', { start, end, length });
        a.click();
        URL.revokeObjectURL(url);
        onDiagnostic(`Downloaded ${scopeLabel}: ${length} byte(s) → ${a.download}`, 'ok');
      } catch (err) {
        onDiagnostic(`Download failed: ${err.message}`, 'err');
      }
      return;
    }

    // Textual representations
    let text;
    try {
      text = BC.encodeExportText(data, format);
    } catch (err) {
      onDiagnostic(err.message, 'err');
      return;
    }

    const clip = await BC.writeClipboardText(text);
    if (clip.ok) {
      onDiagnostic(`Copied ${format} (${scopeLabel}, ${length} byte(s)).`, 'ok');
    } else {
      onDiagnostic(clip.error || 'Clipboard write failed.', 'err');
    }
  }

  copyBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-scope][data-format]');
    if (!btn || btn.disabled) return;
    const scope = btn.dataset.scope;
    const format = btn.dataset.format;
    performExport(scope, format);
  });

  render();
  updateStatus();
  return {
    setBytes,
    getSelection: () => state.selection,
    getBytes: () => state.bytes,
    refresh: render,
    // Test / programmatic surface
    _state: state,
    _performExport: performExport,
    _updateStatus: updateStatus,
  };
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else if (k === 'dataset') {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    } else if (k.startsWith('aria-') || k === 'role' || k === 'tabIndex') {
      node.setAttribute(k === 'tabIndex' ? 'tabindex' : k, v);
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const c of children) node.appendChild(c);
  return node;
}
