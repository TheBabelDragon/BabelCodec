/**
 * Bit mask and single-bit operations with explicit width.
 */

import { ValidationError } from '../core/errors.js';
import { toUnsigned, validateWidth, widthMask } from './bitwise.js';

function finalize(result, width, options = {}) {
  const masked = result & widthMask(width);
  if (options.asNumber) {
    if (width > 53) {
      throw new ValidationError(
        `Cannot return width ${width} as Number; omit asNumber`,
        { code: 'UNSAFE_NUMBER', details: { width } },
      );
    }
    return Number(masked);
  }
  return masked;
}

function resolveWidth(options = {}) {
  const width = options.width ?? 32;
  validateWidth(width);
  return width;
}

export function validateBit(bit, width) {
  if (!Number.isInteger(bit) || bit < 0 || bit >= width) {
    throw new ValidationError(
      `Bit index must be an integer in [0, ${width}), got ${bit}`,
      { code: 'INVALID_BIT', details: { bit, width } },
    );
  }
}

export function applyMask(value, mask, options = {}) {
  const w = resolveWidth(options);
  return finalize(toUnsigned(value, w, 'value') & toUnsigned(mask, w, 'mask'), w, options);
}

export function testBit(value, bit, options = {}) {
  const w = resolveWidth(options);
  validateBit(bit, w);
  return ((toUnsigned(value, w) >> BigInt(bit)) & 1n) === 1n;
}

export function setBit(value, bit, options = {}) {
  const w = resolveWidth(options);
  validateBit(bit, w);
  return finalize(toUnsigned(value, w) | (1n << BigInt(bit)), w, options);
}

export function clearBit(value, bit, options = {}) {
  const w = resolveWidth(options);
  validateBit(bit, w);
  return finalize(toUnsigned(value, w) & ~(1n << BigInt(bit)), w, options);
}

export function toggleBit(value, bit, options = {}) {
  const w = resolveWidth(options);
  validateBit(bit, w);
  return finalize(toUnsigned(value, w) ^ (1n << BigInt(bit)), w, options);
}
