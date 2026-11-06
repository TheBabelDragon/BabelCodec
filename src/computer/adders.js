/**
 * 32-bit ripple-carry adder built from 1-bit full adders.
 * Carry out of bit 31 is discarded (mod 2^32).
 */

import { fullAdder } from './full-adder.js';

/**
 * Extract bit i (0 = LSB) from an unsigned 32-bit BigInt.
 * @param {bigint} word
 * @param {number} i
 * @returns {number} 0|1
 */
export function bitOf(word, i) {
  return Number((BigInt(word) >> BigInt(i)) & 1n);
}

/**
 * Assemble 32 bits (bit 0 = LSB) into a BigInt word.
 * @param {number[]} bits  length 32, values 0|1
 * @returns {bigint}
 */
export function bitsToWord(bits) {
  let w = 0n;
  for (let i = 0; i < 32; i++) {
    if (bits[i]) w |= (1n << BigInt(i));
  }
  return w;
}

/**
 * Ripple-carry add two 32-bit words using full-adder stages.
 * @param {bigint|number} a
 * @param {bigint|number} b
 * @param {{ inspect?: boolean }} [options]
 * @returns {{
 *   sum: bigint,
 *   stages?: { bit: number, a: number, b: number, cin: number, sum: number, cout: number }[],
 *   finalCarry: number
 * }}
 */
export function add32Ripple(a, b, options = {}) {
  const A = BigInt(a) & 0xffffffffn;
  const B = BigInt(b) & 0xffffffffn;
  const sumBits = new Array(32);
  /** @type {{ bit: number, a: number, b: number, cin: number, sum: number, cout: number }[]|undefined} */
  const stages = options.inspect ? [] : undefined;
  let cin = 0;
  for (let i = 0; i < 32; i++) {
    const ai = bitOf(A, i);
    const bi = bitOf(B, i);
    const { sum, cout } = fullAdder(ai, bi, cin);
    sumBits[i] = sum;
    if (stages) stages.push({ bit: i, a: ai, b: bi, cin, sum, cout });
    cin = cout;
  }
  // Discard final carry (mod 2^32)
  return {
    sum: bitsToWord(sumBits),
    stages,
    finalCarry: cin,
  };
}

/**
 * Sum multiple words via successive ripple-carry adds.
 * @param {...bigint|number} words
 * @returns {bigint}
 */
export function add32RippleMany(...words) {
  let acc = 0n;
  for (const w of words) {
    acc = add32Ripple(acc, w).sum;
  }
  return acc;
}
