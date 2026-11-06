/**
 * SHA-256 message schedule W[0..63].
 */

import { add32 } from './arithmetic.js';
import { smallSigma0, smallSigma1 } from './functions.js';

/**
 * Expand 16 block words into the 64-word message schedule.
 * @param {bigint[]} blockWords  length 16
 * @returns {bigint[]} length 64
 */
export function createMessageSchedule(blockWords) {
  if (!Array.isArray(blockWords) || blockWords.length !== 16) {
    throw new TypeError('createMessageSchedule expects 16 words');
  }
  /** @type {bigint[]} */
  const W = new Array(64);
  for (let i = 0; i < 16; i++) {
    W[i] = BigInt(blockWords[i]);
  }
  for (let t = 16; t < 64; t++) {
    W[t] = add32(
      smallSigma1(W[t - 2]),
      W[t - 7],
      smallSigma0(W[t - 15]),
      W[t - 16],
    );
  }
  return W;
}
