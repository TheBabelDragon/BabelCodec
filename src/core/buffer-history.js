/**
 * Immutable buffer history for the Hex Inspector byte workspace.
 *
 * Every edit creates a new Uint8Array state. Undo/redo restore exact prior
 * sequences. Selection is tracked alongside the buffer but is not part of
 * the history stack (callers re-validate selection after undo/redo).
 *
 * Offsets are zero-based. Ranges use exclusive end.
 */

import { toUint8Array, cloneBytes, bytesEqual } from './utils.js';
import { ValidationError } from './errors.js';

const MAX_HISTORY = 200;

/**
 * @typedef {{ start: number, end: number, length: number, anchor?: number }} Selection
 */

/**
 * @param {Uint8Array|ArrayBuffer|number[]|null} [initial]
 * @returns {BufferHistory}
 */
export function createBufferHistory(initial = null) {
  const initialBytes = initial == null ? new Uint8Array(0) : cloneBytes(toUint8Array(initial));
  /** @type {Uint8Array[]} */
  const stack = [initialBytes];
  let index = 0;

  function current() {
    return stack[index];
  }

  function push(next) {
    // Drop any redo states
    stack.length = index + 1;
    stack.push(cloneBytes(next));
    if (stack.length > MAX_HISTORY) {
      stack.shift();
    } else {
      index += 1;
    }
    // After shift, index stays at last
    if (index >= stack.length) index = stack.length - 1;
    return current();
  }

  return {
    getBytes() {
      return current();
    },

    /** Replace entire buffer (e.g. load file). Clears redo. */
    setBytes(bytes) {
      const next = bytes == null ? new Uint8Array(0) : cloneBytes(toUint8Array(bytes));
      return push(next);
    },

    canUndo() {
      return index > 0;
    },

    canRedo() {
      return index < stack.length - 1;
    },

    undo() {
      if (index <= 0) return null;
      index -= 1;
      return current();
    },

    redo() {
      if (index >= stack.length - 1) return null;
      index += 1;
      return current();
    },

    historySize() {
      return stack.length;
    },

    historyIndex() {
      return index;
    },
  };
}

/**
 * Edit a single byte at offset. Value must be an integer 0–255.
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {number} value
 * @returns {Uint8Array}
 */
export function editByte(bytes, offset, value) {
  const data = toUint8Array(bytes);
  if (!Number.isInteger(offset) || offset < 0 || offset >= data.length) {
    throw new ValidationError(`editByte: offset ${offset} out of range (length ${data.length})`);
  }
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new ValidationError(`editByte: value ${value} is not a byte (0–255)`);
  }
  const next = cloneBytes(data);
  next[offset] = value;
  return next;
}

/**
 * Insert bytes at offset (before the byte currently at offset).
 * offset === length appends.
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {Uint8Array|ArrayBuffer|number[]} insert
 * @returns {Uint8Array}
 */
export function insertBytes(bytes, offset, insert) {
  const data = toUint8Array(bytes);
  const ins = toUint8Array(insert);
  if (!Number.isInteger(offset) || offset < 0 || offset > data.length) {
    throw new ValidationError(`insertBytes: offset ${offset} out of range (length ${data.length})`);
  }
  if (ins.length === 0) return cloneBytes(data);
  const next = new Uint8Array(data.length + ins.length);
  next.set(data.subarray(0, offset), 0);
  next.set(ins, offset);
  next.set(data.subarray(offset), offset + ins.length);
  return next;
}

/**
 * Delete the half-open range [start, end).
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end exclusive
 * @returns {Uint8Array}
 */
export function deleteRange(bytes, start, end) {
  const data = toUint8Array(bytes);
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new ValidationError('deleteRange: start and end must be integers');
  }
  if (start < 0 || end > data.length || start > end) {
    throw new ValidationError(
      `deleteRange: invalid range [${start}, ${end}) for length ${data.length}`,
    );
  }
  if (start === end) return cloneBytes(data);
  const next = new Uint8Array(data.length - (end - start));
  next.set(data.subarray(0, start), 0);
  next.set(data.subarray(end), start);
  return next;
}

/**
 * Replace the half-open range [start, end) with replacement bytes.
 * @param {Uint8Array} bytes
 * @param {number} start
 * @param {number} end exclusive
 * @param {Uint8Array|ArrayBuffer|number[]} replacement
 * @returns {Uint8Array}
 */
export function replaceRange(bytes, start, end, replacement) {
  const data = toUint8Array(bytes);
  const rep = toUint8Array(replacement);
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new ValidationError('replaceRange: start and end must be integers');
  }
  if (start < 0 || end > data.length || start > end) {
    throw new ValidationError(
      `replaceRange: invalid range [${start}, ${end}) for length ${data.length}`,
    );
  }
  const next = new Uint8Array(data.length - (end - start) + rep.length);
  next.set(data.subarray(0, start), 0);
  next.set(rep, start);
  next.set(data.subarray(end), start + rep.length);
  return next;
}

/**
 * @param {number} byteLength
 * @returns {Selection|null}
 */
export function selectAll(byteLength) {
  if (!Number.isInteger(byteLength) || byteLength <= 0) return null;
  return { start: 0, end: byteLength, length: byteLength, anchor: 0 };
}

/**
 * @returns {null}
 */
export function clearSelection() {
  return null;
}

/**
 * Select a range by start + length. Clamps to buffer bounds; rejects negative length.
 * @param {number} start
 * @param {number} length
 * @param {number} byteLength
 * @returns {Selection}
 */
export function selectRangeByStartLength(start, length, byteLength) {
  if (!Number.isInteger(start) || !Number.isInteger(length) || !Number.isInteger(byteLength)) {
    throw new ValidationError('selectRangeByStartLength: start, length, and byteLength must be integers');
  }
  if (length < 0) {
    throw new ValidationError('selectRangeByStartLength: length must be >= 0');
  }
  if (byteLength <= 0) {
    throw new ValidationError('selectRangeByStartLength: buffer is empty');
  }
  if (start < 0 || start >= byteLength) {
    throw new ValidationError(
      `selectRangeByStartLength: start ${start} out of range (length ${byteLength})`,
    );
  }
  const end = Math.min(byteLength, start + length);
  return { start, end, length: end - start, anchor: start };
}

/**
 * After an edit, clamp or clear a selection so it remains valid for the new buffer.
 * @param {Selection|null} selection
 * @param {number} newLength
 * @returns {Selection|null}
 */
export function revalidateSelection(selection, newLength) {
  if (!selection || newLength <= 0) return null;
  let { start, end, anchor } = selection;
  start = Math.max(0, Math.min(start, newLength));
  end = Math.max(start, Math.min(end, newLength));
  if (end <= start) return null;
  const a = anchor != null ? Math.max(0, Math.min(anchor, newLength - 1)) : start;
  return { start, end, length: end - start, anchor: a };
}

/**
 * Parse a byte value from user input: decimal 0-255, hex 0xNN / NNh / NN.
 * @param {string|number} input
 * @returns {number} 0–255
 */
export function parseByteValue(input) {
  if (typeof input === 'number') {
    if (!Number.isInteger(input) || input < 0 || input > 255) {
      throw new ValidationError(`Invalid byte value: ${input}`);
    }
    return input;
  }
  if (typeof input !== 'string') {
    throw new ValidationError('Byte value must be a number or string');
  }
  const s = input.trim().toLowerCase();
  if (s === '') throw new ValidationError('Empty byte value');
  let v;
  if (s.startsWith('0x')) {
    if (!/^0x[0-9a-f]{1,2}$/i.test(s)) throw new ValidationError(`Invalid hex byte: ${input}`);
    v = Number.parseInt(s.slice(2), 16);
  } else if (/^[0-9a-f]{1,2}h$/i.test(s)) {
    v = Number.parseInt(s.slice(0, -1), 16);
  } else if (/^[0-9a-f]{2}$/i.test(s) && /[a-f]/i.test(s)) {
    v = Number.parseInt(s, 16);
  } else if (/^\d+$/.test(s)) {
    v = Number.parseInt(s, 10);
  } else {
    throw new ValidationError(`Invalid byte value: ${input}`);
  }
  if (!Number.isInteger(v) || v < 0 || v > 255) {
    throw new ValidationError(`Byte value out of range: ${input}`);
  }
  return v;
}

export { bytesEqual, cloneBytes };
