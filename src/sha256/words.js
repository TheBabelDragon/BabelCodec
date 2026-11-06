/**
 * Parse 512-bit blocks into sixteen big-endian 32-bit words.
 */

import { BLOCK_BYTES } from './constants.js';
import { MASK32 } from './constants.js';

/**
 * Read a big-endian 32-bit word from bytes at offset.
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @returns {bigint}
 */
export function readWordBE(bytes, offset) {
  return (
    (BigInt(bytes[offset]) << 24n) |
    (BigInt(bytes[offset + 1]) << 16n) |
    (BigInt(bytes[offset + 2]) << 8n) |
    BigInt(bytes[offset + 3])
  ) & MASK32;
}

/**
 * Write a 32-bit word as big-endian bytes into a buffer.
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {bigint|number} word
 */
export function writeWordBE(bytes, offset, word) {
  const w = BigInt(word) & MASK32;
  bytes[offset] = Number((w >> 24n) & 0xffn);
  bytes[offset + 1] = Number((w >> 16n) & 0xffn);
  bytes[offset + 2] = Number((w >> 8n) & 0xffn);
  bytes[offset + 3] = Number(w & 0xffn);
}

/**
 * Parse one 64-byte block into sixteen 32-bit big-endian words.
 * @param {Uint8Array} padded
 * @param {number} blockIndex  0-based
 * @returns {bigint[]} length 16
 */
export function parseBlockWords(padded, blockIndex) {
  const offset = blockIndex * BLOCK_BYTES;
  if (offset + BLOCK_BYTES > padded.length) {
    throw new RangeError(`Block ${blockIndex} out of range`);
  }
  const words = new Array(16);
  for (let i = 0; i < 16; i++) {
    words[i] = readWordBE(padded, offset + i * 4);
  }
  return words;
}
