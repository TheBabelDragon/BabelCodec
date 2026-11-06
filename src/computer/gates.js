/**
 * Single-bit Boolean primitives for the gate-level computer.
 * Values are 0 | 1 (numbers).
 */

export function AND(a, b) { return (a & b) & 1; }
export function OR(a, b) { return (a | b) & 1; }
export function XOR(a, b) { return (a ^ b) & 1; }
export function NOT(a) { return (~a) & 1; }
export function NAND(a, b) { return (~(a & b)) & 1; }
export function NOR(a, b) { return (~(a | b)) & 1; }
export function XNOR(a, b) { return (~(a ^ b)) & 1; }

/**
 * 2:1 multiplexer — select ? b : a
 */
export function MUX(a, b, select) {
  // (NOT select AND a) OR (select AND b)
  return OR(AND(NOT(select), a), AND(select, b));
}
