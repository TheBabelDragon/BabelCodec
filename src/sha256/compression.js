/**
 * SHA-256 compression function for one 512-bit block.
 */

import { K } from './constants.js';
import { add32 } from './arithmetic.js';
import { ch, maj, bigSigma0, bigSigma1 } from './functions.js';
import { createMessageSchedule } from './schedule.js';

/**
 * @typedef {{
 *   round: number,
 *   a: bigint, b: bigint, c: bigint, d: bigint,
 *   e: bigint, f: bigint, g: bigint, h: bigint,
 *   W: bigint, K: bigint, T1: bigint, T2: bigint
 * }} RoundSnapshot
 */

/**
 * Compress one block into the current hash state.
 * @param {bigint[]} H  length 8, mutated in place (caller should clone if needed)
 * @param {bigint[]} blockWords  length 16
 * @param {{ trace?: boolean }} [options]
 * @returns {{ H: bigint[], rounds?: RoundSnapshot[], W?: bigint[] }}
 */
export function compressBlock(H, blockWords, options = {}) {
  const W = createMessageSchedule(blockWords);
  let a = H[0], b = H[1], c = H[2], d = H[3];
  let e = H[4], f = H[5], g = H[6], h = H[7];

  /** @type {RoundSnapshot[]|undefined} */
  const rounds = options.trace ? [] : undefined;

  for (let t = 0; t < 64; t++) {
    const T1 = add32(h, bigSigma1(e), ch(e, f, g), K[t], W[t]);
    const T2 = add32(bigSigma0(a), maj(a, b, c));
    h = g;
    g = f;
    f = e;
    e = add32(d, T1);
    d = c;
    c = b;
    b = a;
    a = add32(T1, T2);

    if (rounds) {
      rounds.push({
        round: t,
        a, b, c, d, e, f, g, h,
        W: W[t],
        K: K[t],
        T1,
        T2,
      });
    }
  }

  H[0] = add32(H[0], a);
  H[1] = add32(H[1], b);
  H[2] = add32(H[2], c);
  H[3] = add32(H[3], d);
  H[4] = add32(H[4], e);
  H[5] = add32(H[5], f);
  H[6] = add32(H[6], g);
  H[7] = add32(H[7], h);

  const result = { H };
  if (rounds) {
    result.rounds = rounds;
    result.W = W;
  }
  return result;
}
