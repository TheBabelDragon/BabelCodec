/**
 * Hex-grid inspector view — virtualized rendering for large buffers.
 *
 * Selection model:
 * - Offsets are zero-based.
 * - selection.end is exclusive.
 * - Copy All always uses the full buffer, even when a selection exists.
 * - Copy Selection requires a non-empty selection.
 *
 * Editing (Phase 2):
 * - Every edit creates a new immutable buffer via BufferHistory.
 * - Undo/redo restore exact prior byte sequences.
 */

import * as HexGrid from '../core/hexgrid.js?v=0.2.1';
import * as Search from '../core/search.js?v=0.2.1';
import { encodeHex, decodeHex } from '../core/hex.js';
import { encodeBase64 } from '../core/base64.js';
import { encodeBinary } from '../core/binary.js';
import {
  resolveExportBytes,
  encodeExportText,
  exportFilename,
  writeClipboardText,
} from '../core/inspector-export.js';
import {
  createBufferHistory,
  editByte,
  insertBytes,
  deleteRange,
  replaceRange,
  selectAll as selAll,
  clearSelection as selClear,
  selectRangeByStartLength,
  revalidateSelection,
  parseByteValue,
} from '../core/buffer-history.js';
import { byteDiff, exportDiffJson } from '../core/byte-diff.js';

const BC = {
  buildHexGrid: HexGrid.buildHexGrid,
  parseOffset: HexGrid.parseOffset,
  selectionFromClick: HexGrid.selectionFromClick,
  sliceSelection: HexGrid.sliceSelection,
  searchBytes: Search.searchBytes,
  encodeHex,
  encodeBase64,
  encodeBinary,
  decodeHex,
  resolveExportBytes,
  encodeExportText,
  exportFilename,
  writeClipboardText,
  createBufferHistory,
  editByte,
  insertBytes,
  deleteRange,
  replaceRange,
  selAll,
  selClear,
  selectRangeByStartLength,
  revalidateSelection,
  parseByteValue,
  byteDiff,
  exportDiffJson,
};

const ROW_HEIGHT = 22;
const MAX_DOM_ROWS = 64;

export function createInspectorView(container, opts = {}) {
  const history = BC.createBufferHistory(null);
  const state = {
    bytes: null,
    bytesPerRow: 16,
    selection: null,
    searchMatches: [],
    searchIndex: -1,
    scrollOffset: 0,
    currentOffset: 0,
    diffBytes: null,
  };

  const onSelectionChange = opts.onSelectionChange || (() => {});
  const onDiagnostic = opts.onDiagnostic || (() => {});
  const onBytesChange = opts.onBytesChange || (() => {});

  container.innerHTML = '';
  container.classList.add('hex-inspector');

  const statusBar = el('div', { className: 'hex-status', role: 'status', 'aria-live': 'polite' });
  const statusTotal = el('span', { className: 'hex-status-item', dataset: { key: 'total' }, textContent: 'Total: 0 B' });
  const statusSel = el('span', { className: 'hex-status-item', dataset: { key: 'sel' }, textContent: 'Sel: none' });
  const statusOffset = el('span', { className: 'hex-status-item', dataset: { key: 'offset' }, textContent: 'Offset: —' });
  const statusWidth = el('span', { className: 'hex-status-item', dataset: { key: 'width' }, textContent: 'Width: 16' });
  const statusMatches = el('span', { className: 'hex-status-item', dataset: { key: 'matches' }, textContent: 'Matches: 0' });
  const statusHist = el('span', { className: 'hex-status-item', dataset: { key: 'hist' }, textContent: 'Hist: 0/0' });
  statusBar.append(statusTotal, statusSel, statusOffset, statusWidth, statusMatches, statusHist);

  const toolbar = el('div', { className: 'hex-toolbar' });
  const bprSelect = el('select', { 'aria-label': 'Bytes per row' });
  for (const n of [8, 16, 32]) {
    const o = el('option', { value: String(n), textContent: `${n} / row` });
    if (n === 16) o.selected = true;
    bprSelect.appendChild(o);
  }
  const jumpInput = el('input', { type: 'text', placeholder: 'Offset (dec or 0x…)', 'aria-label': 'Jump to offset', className: 'hex-jump' });
  const jumpBtn = el('button', { type: 'button', className: 'btn', textContent: 'Go' });
  const searchInput = el('input', { type: 'text', placeholder: 'Search hex / text', 'aria-label': 'Search pattern', className: 'hex-search' });
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
  toolbar.append(el('label', {}, [document.createTextNode('Width '), bprSelect]), jumpInput, jumpBtn, searchInput, searchMode, searchBtn, prevBtn, nextBtn, clearSearchBtn, matchMeta, selMeta);

  const editBar = el('div', { className: 'hex-editbar' });
  const btnSelectAll = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Select All' });
  const btnClearSel = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Clear Sel' });
  const rangeStart = el('input', { type: 'text', className: 'hex-jump', placeholder: 'Start', 'aria-label': 'Range start' });
  const rangeLen = el('input', { type: 'text', className: 'hex-jump', placeholder: 'Len', 'aria-label': 'Range length' });
  const btnRange = el('button', { type: 'button', className: 'btn', textContent: 'Select Range' });
  const editVal = el('input', { type: 'text', className: 'hex-jump', placeholder: 'Byte 0–FF', 'aria-label': 'Edit byte value' });
  const btnEdit = el('button', { type: 'button', className: 'btn', textContent: 'Edit Byte' });
  const insertHex = el('input', { type: 'text', className: 'hex-jump', placeholder: 'Insert hex…', 'aria-label': 'Insert hex bytes' });
  const btnInsert = el('button', { type: 'button', className: 'btn', textContent: 'Insert' });
  const btnDelete = el('button', { type: 'button', className: 'btn', textContent: 'Delete Sel' });
  const btnReplace = el('button', { type: 'button', className: 'btn', textContent: 'Replace Sel' });
  const btnUndo = el('button', { type: 'button', className: 'btn', textContent: 'Undo' });
  const btnRedo = el('button', { type: 'button', className: 'btn', textContent: 'Redo' });
  const btnDiff = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Diff vs Snapshot' });
  const btnSnap = el('button', { type: 'button', className: 'btn btn-ghost', textContent: 'Take Snapshot' });
  editBar.append(btnSelectAll, btnClearSel, rangeStart, rangeLen, btnRange, editVal, btnEdit, insertHex, btnInsert, btnDelete, btnReplace, btnUndo, btnRedo, btnSnap, btnDiff);

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
    copyBar.appendChild(el('button', { type: 'button', className: 'btn btn-ghost', textContent: a.label, dataset: { scope: a.scope, format: a.format } }));
  }

  const scroll = el('div', { className: 'hex-scroll', tabIndex: 0, role: 'grid', 'aria-label': 'Hex inspector grid' });
  const spacer = el('div', { className: 'hex-spacer' });
  const viewport = el('div', { className: 'hex-viewport' });
  scroll.append(spacer, viewport);
  container.append(statusBar, toolbar, editBar, copyBar, scroll);

  function syncFromHistory() {
    const b = history.getBytes();
    state.bytes = b;
    state.selection = BC.revalidateSelection(state.selection, state.bytes ? state.bytes.length : 0);
    onBytesChange(state.bytes);
  }

  function applyEdit(nextBytes) {
    history.setBytes(nextBytes);
    syncFromHistory();
    render();
    updateSelMeta();
    updateStatus();
  }

  function updateStatus() {
    const total = state.bytes ? state.bytes.length : 0;
    statusTotal.textContent = `Total: ${total} B`;
    if (state.selection && state.selection.length > 0) {
      const { start, end, length } = state.selection;
      statusSel.textContent = `Sel: ${start}–${end - 1} (len ${length}, end exclusive ${end})`;
    } else {
      statusSel.textContent = 'Sel: none';
    }
    statusOffset.textContent = state.bytes && state.bytes.length
      ? `Offset: ${state.currentOffset} (0x${state.currentOffset.toString(16).toUpperCase()})`
      : 'Offset: —';
    statusWidth.textContent = `Width: ${state.bytesPerRow}`;
    statusMatches.textContent = `Matches: ${state.searchMatches.length}`;
    statusHist.textContent = `Hist: ${history.historyIndex()}/${Math.max(0, history.historySize() - 1)}`;
    const hasSel = !!(state.selection && state.selection.length > 0);
    for (const btn of copyBar.querySelectorAll('button[data-scope="selection"]')) {
      btn.disabled = !hasSel;
      btn.title = hasSel ? '' : 'Select one or more bytes first';
    }
    btnDelete.disabled = !hasSel;
    btnReplace.disabled = !hasSel;
    btnUndo.disabled = !history.canUndo();
    btnRedo.disabled = !history.canRedo();
  }

  function setBytes(bytes) {
    history.setBytes(bytes && bytes.length ? bytes : new Uint8Array(0));
    state.selection = null;
    state.searchMatches = [];
    state.searchIndex = -1;
    state.scrollOffset = 0;
    state.currentOffset = 0;
    syncFromHistory();
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
    const grid = BC.buildHexGrid(state.bytes, { bytesPerRow: state.bytesPerRow, startOffset: startByte, endOffset: endByte });
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

  bprSelect.addEventListener('change', () => { state.bytesPerRow = Number(bprSelect.value) || 16; render(); });
  jumpBtn.addEventListener('click', () => {
    if (!state.bytes) return;
    try {
      const off = BC.parseOffset(jumpInput.value, state.bytes.length);
      selectByte(off, false);
      scroll.scrollTop = Math.floor(off / state.bytesPerRow) * ROW_HEIGHT;
      onDiagnostic(`Jumped to offset ${off} (0x${off.toString(16).toUpperCase()})`, 'ok');
    } catch (e) { onDiagnostic(e.message, 'err'); }
  });
  jumpInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') jumpBtn.click(); });

  function runSearch() {
    if (!state.bytes) return;
    const pattern = searchInput.value;
    if (!pattern.trim()) { onDiagnostic('Empty search pattern rejected.', 'err'); return; }
    try {
      const result = BC.searchBytes(state.bytes, pattern, { mode: searchMode.value, maxResults: 5000 });
      state.searchMatches = result.matches.slice();
      state.searchIndex = result.count > 0 ? 0 : -1;
      matchMeta.textContent = result.count === 0 ? 'No matches' : `${result.count} match${result.count === 1 ? '' : 'es'}${result.truncated ? ' (truncated)' : ''}`;
      if (state.searchIndex >= 0) {
        const off = result.matches[0];
        selectByte(off, false);
        scroll.scrollTop = Math.floor(off / state.bytesPerRow) * ROW_HEIGHT;
      }
      render(); updateStatus();
      onDiagnostic(result.count ? `Found ${result.count} match(es)` : 'No matches', result.count ? 'ok' : 'info');
    } catch (e) { onDiagnostic(e.message, 'err'); }
  }
  searchBtn.addEventListener('click', runSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
  clearSearchBtn.addEventListener('click', () => {
    state.searchMatches = []; state.searchIndex = -1; matchMeta.textContent = '';
    render(); updateStatus(); onDiagnostic('Search cleared.', 'info');
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
    if (!state.bytes) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); btnUndo.click(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); btnRedo.click(); return; }
    if (!state.selection) return;
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
    if (top >= scroll.scrollTop + scroll.clientHeight - ROW_HEIGHT) scroll.scrollTop = top - scroll.clientHeight + ROW_HEIGHT * 2;
  });

  btnSelectAll.addEventListener('click', () => {
    if (!state.bytes || !state.bytes.length) { onDiagnostic('Nothing to select.', 'info'); return; }
    state.selection = BC.selAll(state.bytes.length);
    state.currentOffset = 0;
    render(); updateSelMeta();
    onDiagnostic(`Selected all ${state.bytes.length} byte(s).`, 'ok');
  });
  btnClearSel.addEventListener('click', () => {
    state.selection = BC.selClear();
    render(); updateSelMeta();
    onDiagnostic('Selection cleared.', 'info');
  });
  btnRange.addEventListener('click', () => {
    if (!state.bytes) return;
    try {
      const start = BC.parseOffset(rangeStart.value || '0', state.bytes.length);
      const len = Number.parseInt(String(rangeLen.value).trim(), 10);
      if (!Number.isInteger(len)) throw new Error('Length must be an integer');
      state.selection = BC.selectRangeByStartLength(start, len, state.bytes.length);
      state.currentOffset = start;
      render(); updateSelMeta();
      onDiagnostic(`Selected range start=${start} length=${state.selection.length}.`, 'ok');
    } catch (e) { onDiagnostic(e.message, 'err'); }
  });

  btnEdit.addEventListener('click', () => {
    if (!state.bytes || !state.bytes.length) { onDiagnostic('No buffer to edit.', 'info'); return; }
    try {
      const off = state.selection && state.selection.length === 1 ? state.selection.start : state.currentOffset;
      const val = BC.parseByteValue(editVal.value);
      applyEdit(BC.editByte(state.bytes, off, val));
      state.selection = { start: off, end: off + 1, length: 1, anchor: off };
      updateSelMeta();
      onDiagnostic(`Edited offset ${off} → 0x${val.toString(16).toUpperCase().padStart(2, '0')}.`, 'ok');
    } catch (e) { onDiagnostic(e.message, 'err'); }
  });
  btnInsert.addEventListener('click', () => {
    if (!state.bytes) state.bytes = new Uint8Array(0);
    try {
      const hex = insertHex.value.trim();
      if (!hex) { onDiagnostic('Insert hex is empty.', 'err'); return; }
      const ins = BC.decodeHex(hex);
      const off = state.selection ? state.selection.start : state.currentOffset;
      applyEdit(BC.insertBytes(state.bytes, off, ins));
      state.selection = { start: off, end: off + ins.length, length: ins.length, anchor: off };
      updateSelMeta();
      onDiagnostic(`Inserted ${ins.length} byte(s) at ${off}.`, 'ok');
    } catch (e) { onDiagnostic(e.message, 'err'); }
  });
  btnDelete.addEventListener('click', () => {
    if (!state.bytes || !state.selection || !state.selection.length) { onDiagnostic('No selection to delete.', 'err'); return; }
    try {
      const { start, end, length } = state.selection;
      applyEdit(BC.deleteRange(state.bytes, start, end));
      state.selection = null;
      updateSelMeta();
      onDiagnostic(`Deleted ${length} byte(s) at ${start}.`, 'ok');
    } catch (e) { onDiagnostic(e.message, 'err'); }
  });
  btnReplace.addEventListener('click', () => {
    if (!state.bytes || !state.selection || !state.selection.length) { onDiagnostic('No selection to replace.', 'err'); return; }
    try {
      const hex = insertHex.value.trim();
      if (!hex) { onDiagnostic('Replacement hex is empty (use Insert field).', 'err'); return; }
      const rep = BC.decodeHex(hex);
      const { start, end } = state.selection;
      applyEdit(BC.replaceRange(state.bytes, start, end, rep));
      state.selection = rep.length ? { start, end: start + rep.length, length: rep.length, anchor: start } : null;
      updateSelMeta();
      onDiagnostic(`Replaced selection with ${rep.length} byte(s).`, 'ok');
    } catch (e) { onDiagnostic(e.message, 'err'); }
  });
  btnUndo.addEventListener('click', () => {
    if (!history.canUndo()) { onDiagnostic('Nothing to undo.', 'info'); return; }
    history.undo(); syncFromHistory(); render(); updateSelMeta(); onDiagnostic('Undo.', 'ok');
  });
  btnRedo.addEventListener('click', () => {
    if (!history.canRedo()) { onDiagnostic('Nothing to redo.', 'info'); return; }
    history.redo(); syncFromHistory(); render(); updateSelMeta(); onDiagnostic('Redo.', 'ok');
  });
  btnSnap.addEventListener('click', () => {
    if (!state.bytes) { onDiagnostic('No buffer to snapshot.', 'info'); return; }
    state.diffBytes = new Uint8Array(state.bytes);
    onDiagnostic(`Snapshot taken (${state.diffBytes.length} B) for byte-level diff.`, 'ok');
  });
  btnDiff.addEventListener('click', () => {
    if (!state.bytes) { onDiagnostic('No current buffer.', 'info'); return; }
    if (!state.diffBytes) { onDiagnostic('No snapshot. Click Take Snapshot first.', 'err'); return; }
    const d = BC.byteDiff(state.diffBytes, state.bytes);
    const json = BC.exportDiffJson(d);
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url; a.download = 'babelcodec-byte-diff.json'; a.click();
      URL.revokeObjectURL(url);
    } catch (_) {}
    const s = d.summary;
    onDiagnostic(d.identical ? 'Byte diff: identical to snapshot.' : `Byte diff (byte-level only): equal=${s.equal} changed≈${s.changed} inserted=${s.inserted} removed=${s.removed}. JSON exported.`, d.identical ? 'ok' : 'info');
  });

  async function performExport(scope, format) {
    if (!state.bytes) { onDiagnostic('No buffer loaded.', 'info'); return; }
    const resolved = BC.resolveExportBytes(state.bytes, scope, state.selection);
    if (!resolved.ok) { onDiagnostic(resolved.error, 'err'); return; }
    const { data, start, end, length } = resolved;
    const scopeLabel = scope === 'all' ? 'All' : `Sel ${start}–${end - 1}`;
    if (format === 'bin') {
      try {
        const blob = new Blob([data], { type: 'application/octet-stream' });
        const a = document.createElement('a');
        const url = URL.createObjectURL(blob);
        a.href = url; a.download = BC.exportFilename(scope, 'bin', { start, end, length }); a.click();
        URL.revokeObjectURL(url);
        onDiagnostic(`Downloaded ${scopeLabel}: ${length} byte(s) → ${a.download}`, 'ok');
      } catch (err) { onDiagnostic(`Download failed: ${err.message}`, 'err'); }
      return;
    }
    let text;
    try { text = BC.encodeExportText(data, format); } catch (err) { onDiagnostic(err.message, 'err'); return; }
    const clip = await BC.writeClipboardText(text);
    if (clip.ok) onDiagnostic(`Copied ${format} (${scopeLabel}, ${length} byte(s)).`, 'ok');
    else onDiagnostic(clip.error || 'Clipboard write failed.', 'err');
  }

  copyBar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-scope][data-format]');
    if (!btn || btn.disabled) return;
    performExport(btn.dataset.scope, btn.dataset.format);
  });

  render();
  updateStatus();
  return {
    setBytes,
    getSelection: () => state.selection,
    getBytes: () => state.bytes,
    refresh: render,
    _state: state,
    _history: history,
    _performExport: performExport,
    _updateStatus: updateStatus,
  };
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'textContent') node.textContent = v;
    else if (k === 'dataset') { for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv; }
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('aria-') || k === 'role' || k === 'tabIndex') node.setAttribute(k === 'tabIndex' ? 'tabindex' : k, v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(c);
  return node;
}
