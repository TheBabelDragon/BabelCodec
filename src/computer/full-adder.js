/**
 * 1-bit full adder from Boolean primitives.
 *
 * sum = A XOR B XOR cin
 * cout = (A AND B) OR (cin AND (A XOR B))
 */

import { AND, OR, XOR } from './gates.js';

/**
 * @param {number} a  0|1
 * @param {number} b  0|1
 * @param {number} cin  0|1
 * @returns {{ sum: number, cout: number, xorAB: number }}
 */
export function fullAdder(a, b, cin) {
  const xorAB = XOR(a, b);
  const sum = XOR(xorAB, cin);
  const cout = OR(AND(a, b), AND(cin, xorAB));
  return { sum, cout, xorAB };
}

/**
 * Truth table for the full adder (all 8 combinations).
 * @returns {{ a: number, b: number, cin: number, sum: number, cout: number }[]}
 */
export function fullAdderTruthTable() {
  const rows = [];
  for (let a = 0; a <= 1; a++) {
    for (let b = 0; b <= 1; b++) {
      for (let cin = 0; cin <= 1; cin++) {
        const { sum, cout } = fullAdder(a, b, cin);
        rows.push({ a, b, cin, sum, cout });
      }
    }
  }
  return rows;
}
