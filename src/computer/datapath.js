/**
 * 32-bit datapath operations for SHA-256 using gate-level addition
 * and Boolean/bitwise primitives for logical functions.
 *
 * Logical functions reuse the functional bitwise definitions (same Boolean
 * algebra) but all modular additions go through the ripple-carry adder.
 */

import { add32Ripple, add32RippleMany } from './adders.js';
import { MASK32 } from '../sha256/constants.js';

// Rotate / shift / Ch / Maj / Sigma — pure bit operations (no modular add)
function rotR(v, n) {
  const x = BigInt(v) & MASK32;
  const k = n & 31;
  if (k === 0) return x;
  return ((x >> BigInt(k)) | (x << BigInt(32 - k))) & MASK32;
}
function shr(v, n) {
  if (n <= 0) return BigInt(v) & MASK32;
  if (n >= 32) return 0n;
  return (BigInt(v) & MASK32) >> BigInt(n);
}

export function dpCh(x, y, z) {
  const X = BigInt(x) & MASK32, Y = BigInt(y) & MASK32, Z = BigInt(z) & MASK32;
  return ((X & Y) ^ ((~X) & Z)) & MASK32;
}
export function dpMaj(x, y, z) {
  const X = BigInt(x) & MASK32, Y = BigInt(y) & MASK32, Z = BigInt(z) & MASK32;
  return ((X & Y) ^ (X & Z) ^ (Y & Z)) & MASK32;
}
export function dpBigSigma0(x) {
  return (rotR(x, 2) ^ rotR(x, 13) ^ rotR(x, 22)) & MASK32;
}
export function dpBigSigma1(x) {
  return (rotR(x, 6) ^ rotR(x, 11) ^ rotR(x, 25)) & MASK32;
}
export function dpSmallSigma0(x) {
  return (rotR(x, 7) ^ rotR(x, 18) ^ shr(x, 3)) & MASK32;
}
export function dpSmallSigma1(x) {
  return (rotR(x, 17) ^ rotR(x, 19) ^ shr(x, 10)) & MASK32;
}

/**
 * Modular add via gate-level ripple-carry.
 * @param {...bigint|number} words
 * @returns {bigint}
 */
export function dpAdd(...words) {
  return add32RippleMany(...words);
}

/**
 * One SHA-256 compression round on working registers (values, not objects).
 * Returns next A..H and intermediate T1/T2.
 */
export function datapathRound(regs, Wt, Kt) {
  const { A, B, C, D, E, F, G, H } = regs;
  const T1 = dpAdd(H, dpBigSigma1(E), dpCh(E, F, G), Kt, Wt);
  const T2 = dpAdd(dpBigSigma0(A), dpMaj(A, B, C));
  return {
    A: dpAdd(T1, T2),
    B: A,
    C: B,
    D: C,
    E: dpAdd(D, T1),
    F: E,
    G: F,
    H: G,
    T1,
    T2,
  };
}
