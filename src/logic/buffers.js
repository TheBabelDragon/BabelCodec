/**
 * Byte-buffer Boolean operations.
 * Never mutates caller-owned buffers; always returns new Uint8Array.
 */

import { ValidationError } from '../core/errors.js';
import { toUint8Array } from '../core/utils.js';

function pair(a, b, op) {
  const aa = toUint8Array(/** @type {any} */ (a));
  const bb = toUint8Array(/** @type {any} */ (b));
  if (aa.length !== bb.length) {
    throw new ValidationError(
      `${op}: buffer lengths must match (${aa.length} vs ${bb.length})`,
      { code: 'LENGTH_MISMATCH', details: { lenA: aa.length, lenB: bb.length } },
    );
  }
  return [aa, bb];
}

export function andBytes(a, b) {
  const [aa, bb] = pair(a, b, 'andBytes');
  const out = new Uint8Array(aa.length);
  for (let i = 0; i < aa.length; i++) out[i] = aa[i] & bb[i];
  return out;
}

export function orBytes(a, b) {
  const [aa, bb] = pair(a, b, 'orBytes');
  const out = new Uint8Array(aa.length);
  for (let i = 0; i < aa.length; i++) out[i] = aa[i] | bb[i];
  return out;
}

export function xorBytes(a, b) {
  const [aa, bb] = pair(a, b, 'xorBytes');
  const out = new Uint8Array(aa.length);
  for (let i = 0; i < aa.length; i++) out[i] = aa[i] ^ bb[i];
  return out;
}

export function notBytes(a) {
  const aa = toUint8Array(/** @type {any} */ (a));
  const out = new Uint8Array(aa.length);
  for (let i = 0; i < aa.length; i++) out[i] = (~aa[i]) & 0xff;
  return out;
}

export function applyMaskBytes(bytes, mask) {
  const aa = toUint8Array(/** @type {any} */ (bytes));
  const mm = toUint8Array(/** @type {any} */ (mask));
  if (mm.length === 0) {
    throw new ValidationError('applyMaskBytes: mask must not be empty', { code: 'EMPTY_MASK' });
  }
  const out = new Uint8Array(aa.length);
  for (let i = 0; i < aa.length; i++) {
    out[i] = aa[i] & mm[i % mm.length];
  }
  return out;
}

export function diffBytes(previous, current) {
  const [prev, curr] = pair(previous, current, 'diffBytes');
  const difference = new Uint8Array(prev.length);
  const changedOffsets = [];
  const changedBits = [];
  let changedBitCount = 0;

  for (let i = 0; i < prev.length; i++) {
    const d = prev[i] ^ curr[i];
    difference[i] = d;
    if (d !== 0) {
      changedOffsets.push(i);
      for (let bit = 0; bit < 8; bit++) {
        if ((d >> bit) & 1) {
          changedBitCount += 1;
          changedBits.push({
            offset: i,
            bit,
            previous: (prev[i] >> bit) & 1,
            current: (curr[i] >> bit) & 1,
          });
        }
      }
    }
  }

  return {
    difference,
    changedOffsets,
    changedByteCount: changedOffsets.length,
    changedBitCount,
    changedBits,
  };
}
