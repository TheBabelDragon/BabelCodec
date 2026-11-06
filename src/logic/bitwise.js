/**
 * Integer bitwise operations with explicit width (1–64 bits).
 * Uses BigInt internally to avoid JS 32-bit truncation.
 */

import { ValidationError } from '../core/errors.js';

const MIN_WIDTH = 1;
const MAX_WIDTH = 64;

export function widthMask(width) {
  validateWidth(width);
  if (width === 64) return (1n << 64n) - 1n;
  return (1n << BigInt(width)) - 1n;
}

export function validateWidth(width) {
  if (!Number.isInteger(width) || width < MIN_WIDTH || width > MAX_WIDTH) {
    throw new ValidationError(
      `Bit width must be an integer from ${MIN_WIDTH} to ${MAX_WIDTH}, got ${width}`,
      { code: 'INVALID_WIDTH', details: { width } },
    );
  }
}

export function toBigInt(value, label = 'value') {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new ValidationError(
        `${label} must be a finite integer, got ${value}`,
        { code: 'INVALID_INTEGER', details: { value } },
      );
    }
    return BigInt(value);
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }
  throw new ValidationError(
    `${label} must be an integer (number, bigint, or numeric string)`,
    { code: 'INVALID_INTEGER', details: { value } },
  );
}

export function toUnsigned(value, width, label = 'value') {
  validateWidth(width);
  const mask = widthMask(width);
  let n = toBigInt(value, label);
  n = n & mask;
  if (n < 0n) n = (n + (1n << BigInt(width))) & mask;
  return n & mask;
}

function finalize(result, width, options = {}) {
  const masked = result & widthMask(width);
  if (options.asNumber) {
    if (width > 53) {
      throw new ValidationError(
        `Cannot return width ${width} as Number (exceeds safe integer range); omit asNumber or use BigInt`,
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

export function and(a, b, options = {}) {
  const w = resolveWidth(options);
  return finalize(toUnsigned(a, w, 'a') & toUnsigned(b, w, 'b'), w, options);
}

export function or(a, b, options = {}) {
  const w = resolveWidth(options);
  return finalize(toUnsigned(a, w, 'a') | toUnsigned(b, w, 'b'), w, options);
}

export function xor(a, b, options = {}) {
  const w = resolveWidth(options);
  return finalize(toUnsigned(a, w, 'a') ^ toUnsigned(b, w, 'b'), w, options);
}

export function not(a, options = {}) {
  const w = resolveWidth(options);
  return finalize(~toUnsigned(a, w, 'a'), w, options);
}

export function nand(a, b, options = {}) {
  const w = resolveWidth(options);
  return finalize(~(toUnsigned(a, w, 'a') & toUnsigned(b, w, 'b')), w, options);
}

export function nor(a, b, options = {}) {
  const w = resolveWidth(options);
  return finalize(~(toUnsigned(a, w, 'a') | toUnsigned(b, w, 'b')), w, options);
}

export function xnor(a, b, options = {}) {
  const w = resolveWidth(options);
  return finalize(~(toUnsigned(a, w, 'a') ^ toUnsigned(b, w, 'b')), w, options);
}

export function toBinaryString(value, width) {
  const u = toUnsigned(value, width);
  return u.toString(2).padStart(width, '0');
}

export function asSigned(value, width) {
  validateWidth(width);
  const u = toUnsigned(value, width);
  const signBit = 1n << BigInt(width - 1);
  if (u & signBit) return u - (1n << BigInt(width));
  return u;
}
