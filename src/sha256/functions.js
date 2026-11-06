/**
 * SHA-256 logical functions built on explicit 32-bit ops.
 */

import { MASK32 } from './constants.js';
import { rotateRight32, shiftRight32 } from './arithmetic.js';

/** Ch(x,y,z) = (x AND y) XOR ((NOT x) AND z) */
export function ch(x, y, z) {
  const X = BigInt(x) & MASK32;
  const Y = BigInt(y) & MASK32;
  const Z = BigInt(z) & MASK32;
  return ((X & Y) ^ ((~X) & Z)) & MASK32;
}

/** Maj(x,y,z) = (x AND y) XOR (x AND z) XOR (y AND z) */
export function maj(x, y, z) {
  const X = BigInt(x) & MASK32;
  const Y = BigInt(y) & MASK32;
  const Z = BigInt(z) & MASK32;
  return ((X & Y) ^ (X & Z) ^ (Y & Z)) & MASK32;
}

/** Σ0(x) = ROTR2 XOR ROTR13 XOR ROTR22 */
export function bigSigma0(x) {
  return (
    rotateRight32(x, 2) ^
    rotateRight32(x, 13) ^
    rotateRight32(x, 22)
  ) & MASK32;
}

/** Σ1(x) = ROTR6 XOR ROTR11 XOR ROTR25 */
export function bigSigma1(x) {
  return (
    rotateRight32(x, 6) ^
    rotateRight32(x, 11) ^
    rotateRight32(x, 25)
  ) & MASK32;
}

/** σ0(x) = ROTR7 XOR ROTR18 XOR SHR3 */
export function smallSigma0(x) {
  return (
    rotateRight32(x, 7) ^
    rotateRight32(x, 18) ^
    shiftRight32(x, 3)
  ) & MASK32;
}

/** σ1(x) = ROTR17 XOR ROTR19 XOR SHR10 */
export function smallSigma1(x) {
  return (
    rotateRight32(x, 17) ^
    rotateRight32(x, 19) ^
    shiftRight32(x, 10)
  ) & MASK32;
}
