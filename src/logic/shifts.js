/**
 * Logical and arithmetic shifts with explicit width.
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

export function validateShiftAmount(amount, width) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new ValidationError(
      `Shift amount must be a non-negative integer, got ${amount}`,
      { code: 'INVALID_SHIFT', details: { amount, width } },
    );
  }
  if (amount > width) {
    throw new ValidationError(
      `Shift amount ${amount} exceeds width ${width}`,
      { code: 'INVALID_SHIFT', details: { amount, width } },
    );
  }
}

export function leftShift(value, amount, options = {}) {
  const w = resolveWidth(options);
  validateShiftAmount(amount, w);
  if (amount === w) return finalize(0n, w, options);
  return finalize(toUnsigned(value, w) << BigInt(amount), w, options);
}

export function rightShift(value, amount, options = {}) {
  const w = resolveWidth(options);
  validateShiftAmount(amount, w);
  if (amount === w) {
    if (options.arithmetic) {
      const u = toUnsigned(value, w);
      const sign = (u >> BigInt(w - 1)) & 1n;
      return finalize(sign === 1n ? widthMask(w) : 0n, w, options);
    }
    return finalize(0n, w, options);
  }
  const u = toUnsigned(value, w);
  if (options.arithmetic) {
    const sign = (u >> BigInt(w - 1)) & 1n;
    let shifted = u >> BigInt(amount);
    if (sign === 1n) {
      const fill = widthMask(w) ^ ((1n << BigInt(w - amount)) - 1n);
      shifted = shifted | fill;
    }
    return finalize(shifted, w, options);
  }
  return finalize(u >> BigInt(amount), w, options);
}
