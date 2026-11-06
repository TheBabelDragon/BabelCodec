/**
 * Hex-grid data model for the inspector.
 * Pure computation — no DOM. Supports virtualization via windowed rows.
 */

import { toUint8Array, byteToHex, isPrintableAscii } from './utils.js';
import { ValidationError } from './errors.js';

export function buildHexGrid(bytes, options = {}) {
  const data = toUint8Array(bytes);
  const bpr = normalizeBytesPerRow(options.bytesPerRow);
  const start = Math.max(0, Number(options.startOffset ?? 0) | 0);
  const end = Math.min(
    data.length,
    options.endOffset != null ? Number(options.endOffset) | 0 : data.length,
  );

  if (start > end) {
    throw new ValidationError(`Invalid grid window: start=${start} end=${end}`);
  }

  const alignedStart = Math.floor(start / bpr) * bpr;
  const rows = [];

  for (let off = alignedStart; off < end; off += bpr) {
    const rowEnd = Math.min(off + bpr, data.length);
    const hexCells = [];
    let ascii = '';
    for (let i = off; i < off + bpr; i++) {
      if (i < data.length) {
        const b = data[i];
        hexCells.push(byteToHex(b));
        ascii += isPrintableAscii(b) ? String.fromCharCode(b) : '.';
      } else {
        hexCells.push('');
        ascii += ' ';
      }
    }
    rows.push({
      offset: off,
      offsetHex: formatOffset(off),
      hexCells,
      ascii,
      length: rowEnd - off,
    });
  }

  return {
    bytesPerRow: bpr,
    byteLength: data.length,
    startOffset: alignedStart,
    endOffset: end,
    rows,
  };
}

export function offsetToCell(offset, bytesPerRow = 16) {
  const bpr = normalizeBytesPerRow(bytesPerRow);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new ValidationError(`Invalid offset: ${offset}`);
  }
  return {
    row: Math.floor(offset / bpr),
    col: offset % bpr,
    rowOffset: Math.floor(offset / bpr) * bpr,
  };
}

export function parseOffset(input, byteLength) {
  if (input == null || String(input).trim() === '') {
    throw new ValidationError('Offset is required');
  }
  const s = String(input).trim().toLowerCase();
  let value;
  if (s.startsWith('0x')) {
    if (!/^0x[0-9a-f]+$/i.test(s)) {
      throw new ValidationError(`Invalid hex offset: ${input}`);
    }
    value = Number.parseInt(s.slice(2), 16);
  } else if (/^[0-9a-f]+h$/i.test(s)) {
    value = Number.parseInt(s.slice(0, -1), 16);
  } else if (/^\d+$/.test(s)) {
    value = Number.parseInt(s, 10);
  } else if (/^[0-9a-f]+$/i.test(s) && /[a-f]/i.test(s)) {
    value = Number.parseInt(s, 16);
  } else {
    throw new ValidationError(`Invalid offset: ${input}`);
  }

  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new ValidationError(`Invalid offset: ${input}`);
  }
  if (byteLength != null && value >= byteLength && byteLength > 0) {
    throw new ValidationError(
      `Offset ${value} out of range (buffer length ${byteLength})`,
    );
  }
  if (byteLength === 0 && value !== 0) {
    throw new ValidationError('Buffer is empty');
  }
  return value;
}

export function normalizeSelection(anchor, focus, byteLength) {
  let a = Number(anchor);
  let b = Number(focus);
  if (!Number.isInteger(a) || !Number.isInteger(b)) {
    return null;
  }
  a = Math.max(0, Math.min(a, byteLength));
  b = Math.max(0, Math.min(b, byteLength));
  const endEx =
    a === b ? Math.min(Math.min(a, b) + 1, byteLength) : Math.min(Math.max(a, b) + 1, byteLength);
  return {
    start: Math.min(a, b),
    end: endEx,
    length: endEx - Math.min(a, b),
  };
}

export function selectionFromClick(offset, anchor, byteLength, extend) {
  if (!Number.isInteger(offset) || offset < 0 || offset >= byteLength) {
    return null;
  }
  if (!extend || anchor == null || !Number.isInteger(anchor)) {
    return { start: offset, end: offset + 1, length: 1, anchor: offset };
  }
  const start = Math.min(anchor, offset);
  const end = Math.max(anchor, offset) + 1;
  return { start, end, length: end - start, anchor };
}

export function formatOffset(offset, width = 8) {
  return offset.toString(16).toUpperCase().padStart(width, '0');
}

function normalizeBytesPerRow(n) {
  const v = Number(n) || 16;
  if (v === 8 || v === 16 || v === 32) return v;
  return 16;
}

export function sliceSelection(bytes, selection) {
  const data = toUint8Array(bytes);
  if (!selection || selection.length === 0) return new Uint8Array(0);
  const start = Math.max(0, selection.start);
  const end = Math.min(data.length, selection.end);
  if (start >= end) return new Uint8Array(0);
  return new Uint8Array(data.subarray(start, end));
}
