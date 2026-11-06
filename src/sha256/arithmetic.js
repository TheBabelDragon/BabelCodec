/**
 * Explicit unsigned 32-bit arithmetic for SHA-256.
 * All results are BigInt in [0, 2^32).
 */

import { MASK32 } from './constants.js';

/**
 * Modular addition of one or more unsigned 32-bit words (mod 2^32).
 * @param {...bigint|number} words
 * @returns {bigint}
 */
export function add32(...words) {
  let sum = 0n;
  for (const w of words) {
    sum += BigInt(w) & MASK32;
  }
  return sum & MASK32;
}

/**
 * Circular right rotation of a 32-bit word.
 * @param {bigint|number} value
 * @param {number} amount  0..31
 * @returns {bigint}
 */
export function rotateRight32(value, amount) {
  const v = BigInt(value) & MASK32;
  const n = amount & 31;
  if (n === 0) return v;
  return ((v >> BigInt(n)) | (v << BigInt(32 - n))) & MASK32;
}

/**
 * Logical right shift of a 32-bit word (zeros fill high bits).
 * @param {bigint|number} value
 * @param {number} amount
 * @returns {bigint}
 */
export function shiftRight32(value, amount) {
  const v = BigInt(value) & MASK32;
  if (amount <= 0) return v;
  if (amount >= 32) return 0n;
  return (v >> BigInt(amount)) & MASK32;
}

/**
 * Format a 32-bit word as 8 hex digits.
 * @param {bigint|number} value
 * @returns {string}
 */
export function wordToHex(value) {
  return (BigInt(value) & MASK32).toString(16).padStart(8, '0');
}
