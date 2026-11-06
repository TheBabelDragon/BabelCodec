/**
 * Boolean gate primitives and truth-table generation.
 * Pure functions — no DOM, no side effects.
 */

export const GATES = {
  AND:  { arity: 2, fn: (a, b) => a && b },
  OR:   { arity: 2, fn: (a, b) => a || b },
  XOR:  { arity: 2, fn: (a, b) => a !== b },
  NOT:  { arity: 1, fn: (a) => !a },
  NAND: { arity: 2, fn: (a, b) => !(a && b) },
  NOR:  { arity: 2, fn: (a, b) => !(a || b) },
  XNOR: { arity: 2, fn: (a, b) => a === b },
};

export const GATE_NAMES = Object.keys(GATES);

export function evalGate(name, a, b) {
  const gate = GATES[name];
  if (!gate) throw new Error(`Unknown gate: ${name}`);
  if (gate.arity === 1) return gate.fn(Boolean(a));
  if (b === undefined) throw new Error(`Gate ${name} requires two inputs`);
  return gate.fn(Boolean(a), Boolean(b));
}

export function generateTruthTable(name) {
  const gate = GATES[name];
  if (!gate) throw new Error(`Unknown gate: ${name}`);
  if (gate.arity === 1) {
    return {
      inputs: ['A'],
      rows: [
        { values: [false], result: gate.fn(false) },
        { values: [true],  result: gate.fn(true) },
      ],
    };
  }
  return {
    inputs: ['A', 'B'],
    rows: [
      { values: [false, false], result: gate.fn(false, false) },
      { values: [false, true],  result: gate.fn(false, true) },
      { values: [true,  false], result: gate.fn(true,  false) },
      { values: [true,  true],  result: gate.fn(true,  true) },
    ],
  };
}

export function AND(a, b)  { return evalGate('AND', a, b); }
export function OR(a, b)   { return evalGate('OR', a, b); }
export function XOR(a, b)  { return evalGate('XOR', a, b); }
export function NOT(a)     { return evalGate('NOT', a); }
export function NAND(a, b) { return evalGate('NAND', a, b); }
export function NOR(a, b)  { return evalGate('NOR', a, b); }
export function XNOR(a, b) { return evalGate('XNOR', a, b); }
