/**
 * SHA-256 message padding (FIPS 180-4).
 * Append 1-bit, zero pad, then 64-bit big-endian bit length.
 */

import { BLOCK_BYTES } from './constants.js';
import { toUint8Array } from '../core/utils.js';

/**
 * Pad a message to a multiple of 64 bytes.
 * @param {Uint8Array|ArrayBuffer|number[]|string} input
 *   string is treated as UTF-8 bytes via TextEncoder.
 * @returns {Uint8Array} padded message (length multiple of 64)
 */
export function padMessage(input) {
  let bytes;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = toUint8Array(/** @type {any} */ (input));
  }

  const bitLen = BigInt(bytes.length) * 8n;
  // total = len + 1 + zeros + 8  ≡ 0 (mod 64)
  // after the 0x80 byte, need (zeros + 8) so that (len+1+zeros+8) % 64 === 0
  const afterOne = (bytes.length + 1) % BLOCK_BYTES;
  const zeros = (afterOne <= 56)
    ? (56 - afterOne)
    : (56 + BLOCK_BYTES - afterOne);

  const out = new Uint8Array(bytes.length + 1 + zeros + 8);
  out.set(bytes, 0);
  out[bytes.length] = 0x80;
  // zeros already 0

  // 64-bit big-endian bit length at the end
  const lenOffset = out.length - 8;
  let remaining = bitLen;
  for (let i = 7; i >= 0; i--) {
    out[lenOffset + i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }

  return out;
}

/**
 * Number of 512-bit blocks in a padded message.
 * @param {Uint8Array} padded
 * @returns {number}
 */
export function blockCount(padded) {
  return padded.length / BLOCK_BYTES;
}
