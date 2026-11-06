import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as logic from '../../src/logic/index.js';

const REQUIRED = [
  'and', 'or', 'xor', 'not', 'nand', 'nor', 'xnor',
  'applyMask', 'testBit', 'setBit', 'clearBit', 'toggleBit',
  'leftShift', 'rightShift',
  'andBytes', 'orBytes', 'xorBytes', 'notBytes', 'diffBytes',
  'evaluateCircuit', 'generateTruthTable',
  'GATES', 'GATE_NAMES',
];

describe('logic API', () => {
  for (const name of REQUIRED) {
    it(`exports ${name}`, () => {
      assert.ok(logic[name] != null, `missing export: ${name}`);
    });
  }
  it('end-to-end: status flag + xor bytes + circuit', () => {
    assert.equal(logic.testBit(0b00000100, 2, { width: 8 }), true);
    const d = logic.diffBytes(new Uint8Array([0x00]), new Uint8Array([0xff]));
    assert.equal(d.changedBitCount, 8);
    const r = logic.evaluateCircuit({
      inputs: ['A', 'B'],
      nodes: [{ id: 'x', gate: 'XOR', inputs: ['A', 'B'] }],
      outputs: { y: 'x' },
    }, { A: true, B: true });
    assert.equal(r.outputs.y, false);
  });
});
