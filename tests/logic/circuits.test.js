import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateCircuit, validateCircuit, serializeCircuit, parseCircuit, byteXorCircuit,
} from '../../src/logic/circuits.js';
import { xorBytes } from '../../src/logic/buffers.js';

describe('circuits', () => {
  it('evaluates a half-adder', () => {
    const circuit = {
      inputs: ['A', 'B'],
      nodes: [
        { id: 'xor1', gate: 'XOR', inputs: ['A', 'B'] },
        { id: 'and1', gate: 'AND', inputs: ['A', 'B'] },
      ],
      outputs: { sum: 'xor1', carry: 'and1' },
    };
    assert.deepEqual(evaluateCircuit(circuit, { A: false, B: false }).outputs, { sum: false, carry: false });
    assert.deepEqual(evaluateCircuit(circuit, { A: true, B: false }).outputs, { sum: true, carry: false });
    assert.deepEqual(evaluateCircuit(circuit, { A: true, B: true }).outputs, { sum: false, carry: true });
  });
  it('exposes intermediates', () => {
    const circuit = {
      inputs: ['A'],
      nodes: [{ id: 'n1', gate: 'NOT', inputs: ['A'] }],
      outputs: { y: 'n1' },
    };
    const r = evaluateCircuit(circuit, { A: true });
    assert.equal(r.outputs.y, false);
    assert.equal(r.intermediates.n1, false);
  });
  it('detects missing inputs', () => {
    const circuit = {
      inputs: ['A', 'B'],
      nodes: [{ id: 'x', gate: 'AND', inputs: ['A', 'B'] }],
      outputs: { y: 'x' },
    };
    assert.throws(() => evaluateCircuit(circuit, { A: true }), /Missing input/);
  });
  it('detects cycles', () => {
    assert.throws(() => validateCircuit({
      inputs: ['A'],
      nodes: [
        { id: 'n1', gate: 'NOT', inputs: ['n2'] },
        { id: 'n2', gate: 'NOT', inputs: ['n1'] },
      ],
      outputs: { y: 'n1' },
    }), /cycle/i);
  });
  it('detects unknown references', () => {
    assert.throws(() => validateCircuit({
      inputs: ['A'],
      nodes: [{ id: 'n1', gate: 'NOT', inputs: ['Z'] }],
      outputs: { y: 'n1' },
    }), /unknown/i);
  });
  it('serialization round-trip', () => {
    const circuit = {
      inputs: ['A', 'B'],
      nodes: [{ id: 'x', gate: 'XOR', inputs: ['A', 'B'] }],
      outputs: { y: 'x' },
    };
    const json = serializeCircuit(circuit);
    const parsed = parseCircuit(json);
    assert.deepEqual(evaluateCircuit(parsed, { A: true, B: false }).outputs, { y: true });
  });
  it('8 independent XOR gates match xorBytes', () => {
    const circuit = byteXorCircuit();
    const a = new Uint8Array([0b10110010]);
    const b = new Uint8Array([0b11001100]);
    const expected = xorBytes(a, b);
    const inputValues = {};
    for (let i = 0; i < 8; i++) {
      inputValues[`A${i}`] = Boolean((a[0] >> i) & 1);
      inputValues[`B${i}`] = Boolean((b[0] >> i) & 1);
    }
    const { outputs } = evaluateCircuit(circuit, inputValues);
    let result = 0;
    for (let i = 0; i < 8; i++) {
      if (outputs[`Y${i}`]) result |= (1 << i);
    }
    assert.equal(result, expected[0]);
  });
  it('rejects invalid gate arity', () => {
    assert.throws(() => validateCircuit({
      inputs: ['A'],
      nodes: [{ id: 'n1', gate: 'AND', inputs: ['A'] }],
      outputs: { y: 'n1' },
    }), /requires 2/);
  });
});
