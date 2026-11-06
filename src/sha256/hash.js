/**
 * Functional SHA-256 hash (reference implementation).
 */

import { IV, DIGEST_BYTES, BLOCK_BYTES } from './constants.js';
import { padMessage, blockCount } from './padding.js';
import { parseBlockWords, writeWordBE } from './words.js';
import { compressBlock } from './compression.js';
import { wordToHex } from './arithmetic.js';
import { toUint8Array } from '../core/utils.js';

/**
 * @typedef {{
 *   digest: Uint8Array,
 *   hex: string,
 *   blocks: number,
 *   messageLength: number,
 *   paddedLength: number,
 *   H?: bigint[],
 *   blockTraces?: object[]
 * }} Sha256Result
 */

/**
 * Hash a message to a 32-byte digest.
 * @param {Uint8Array|ArrayBuffer|number[]|string} input
 * @param {{ trace?: boolean }} [options]
 * @returns {Sha256Result}
 */
export function sha256(input, options = {}) {
  let messageBytes;
  if (typeof input === 'string') {
    messageBytes = new TextEncoder().encode(input);
  } else {
    messageBytes = toUint8Array(/** @type {any} */ (input));
  }

  const padded = padMessage(messageBytes);
  const blocks = blockCount(padded);
  const H = IV.slice();

  /** @type {object[]|undefined} */
  const blockTraces = options.trace ? [] : undefined;

  for (let i = 0; i < blocks; i++) {
    const words = parseBlockWords(padded, i);
    const result = compressBlock(H, words, { trace: options.trace });
    if (blockTraces) {
      blockTraces.push({
        block: i,
        words,
        W: result.W,
        rounds: result.rounds,
        H: H.slice(),
      });
    }
  }

  const digest = new Uint8Array(DIGEST_BYTES);
  for (let i = 0; i < 8; i++) {
    writeWordBE(digest, i * 4, H[i]);
  }

  const hex = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');

  /** @type {Sha256Result} */
  const out = {
    digest,
    hex,
    blocks,
    messageLength: messageBytes.length,
    paddedLength: padded.length,
  };
  if (options.trace) {
    out.H = H.slice();
    out.blockTraces = blockTraces;
  }
  return out;
}

/**
 * Hash bytes → 32-byte digest.
 * @param {Uint8Array|ArrayBuffer|number[]} bytes
 * @returns {Uint8Array}
 */
export function sha256Bytes(bytes) {
  return sha256(bytes).digest;
}

/**
 * Hash input → lowercase hex string.
 * @param {Uint8Array|ArrayBuffer|number[]|string} input
 * @returns {string}
 */
export function sha256Hex(input) {
  return sha256(input).hex;
}
