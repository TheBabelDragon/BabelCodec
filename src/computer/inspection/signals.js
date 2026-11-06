/**
 * Signal and arithmetic inspection helpers.
 * Distinguishes gate-expanded vs behavioral implementations.
 */

import { fullAdder } from '../full-adder.js';
import { add32Ripple, bitOf, bitsToWord } from '../adders.js';
import { MASK32 } from '../../sha256/constants.js';

export const ImplKind = Object.freeze({
  GATE_EXPANDED: 'gate-expanded',
  BEHAVIORAL: 'behavioral',
  DIRECT: 'direct',
});

export const OPERATION_FIDELITY = Object.freeze({
  add32: {
    id: 'add32',
    label: 'Modular add (mod 2³²)',
    kind: ImplKind.GATE_EXPANDED,
    note: 'Ripple-carry chain of 32 full adders; final carry discarded.',
  },
  ch: {
    id: 'ch',
    label: 'Choice Ch(x,y,z)',
    kind: ImplKind.BEHAVIORAL,
    note: 'Boolean algebra via JS bitwise: (x&y)^(~x&z). Same truth table as gates.',
  },
  maj: {
    id: 'maj',
    label: 'Majority Maj(x,y,z)',
    kind: ImplKind.BEHAVIORAL,
    note: 'Boolean algebra via JS bitwise: (x&y)^(x&z)^(y&z).',
  },
  bigSigma0: {
    id: 'Σ0',
    label: 'Big Sigma 0',
    kind: ImplKind.BEHAVIORAL,
    note: 'ROTR² ⊕ ROTR¹³ ⊕ ROTR²² via BigInt rotates.',
  },
  bigSigma1: {
    id: 'Σ1',
    label: 'Big Sigma 1',
    kind: ImplKind.BEHAVIORAL,
    note: 'ROTR⁶ ⊕ ROTR¹¹ ⊕ ROTR²⁵ via BigInt rotates.',
  },
  smallSigma0: {
    id: 'σ0',
    label: 'Small sigma 0',
    kind: ImplKind.BEHAVIORAL,
    note: 'ROTR⁷ ⊕ ROTR¹⁸ ⊕ SHR³ via BigInt.',
  },
  smallSigma1: {
    id: 'σ1',
    label: 'Small sigma 1',
    kind: ImplKind.BEHAVIORAL,
    note: 'ROTR¹⁷ ⊕ ROTR¹⁹ ⊕ SHR¹⁰ via BigInt.',
  },
  rotR: {
    id: 'rotR',
    label: 'Rotate right',
    kind: ImplKind.DIRECT,
    note: 'BigInt rotate; not gate-expanded.',
  },
  shr: {
    id: 'shr',
    label: 'Logical shift right',
    kind: ImplKind.DIRECT,
    note: 'BigInt shift; not gate-expanded.',
  },
});

export function inspectAdd32(a, b) {
  const result = add32Ripple(a, b, { inspect: true });
  const stages = (result.stages || []).map((s) => ({
    ...s,
    generate: s.a & s.b,
    propagate: s.a ^ s.b,
  }));
  return {
    a: BigInt(a) & MASK32,
    b: BigInt(b) & MASK32,
    sum: result.sum,
    finalCarry: result.finalCarry,
    stages,
    fidelity: OPERATION_FIDELITY.add32,
  };
}

export function inspectAdd32Many(...words) {
  const steps = [];
  let acc = 0n;
  for (let i = 0; i < words.length; i++) {
    const w = BigInt(words[i]) & MASK32;
    const detail = inspectAdd32(acc, w);
    steps.push({
      index: i,
      operand: w,
      before: acc,
      after: detail.sum,
      stages: detail.stages,
      finalCarry: detail.finalCarry,
    });
    acc = detail.sum;
  }
  return {
    operands: words.map((w) => BigInt(w) & MASK32),
    result: acc,
    steps,
    fidelity: OPERATION_FIDELITY.add32,
  };
}

export function fullAdderTable() {
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

export function wordToBin32(w) {
  const x = BigInt(w) & MASK32;
  return x.toString(2).padStart(32, '0');
}

export function wordToHex32(w) {
  return (BigInt(w) & MASK32).toString(16).padStart(8, '0');
}

export { bitOf, bitsToWord, fullAdder };
