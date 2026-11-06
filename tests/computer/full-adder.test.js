import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fullAdder, fullAdderTruthTable, add32Ripple } from '../../src/computer/index.js';

describe('full adder and ripple-carry', () => {
  it('truth table has 8 rows and matches arithmetic', () => {
    const rows = fullAdderTruthTable();
    assert.equal(rows.length, 8);
    for (const r of rows) {
      const expectedSum = (r.a ^ r.b ^ r.cin) & 1;
      const expectedCout = ((r.a & r.b) | (r.cin & (r.a ^ r.b))) & 1;
      assert.equal(r.sum, expectedSum);
      assert.equal(r.cout, expectedCout);
    }
  });
  it('ripple-carry matches modular add', () => {
    const pairs = [
      [1n, 2n],
      [0xffffffffn, 1n],
      [0xabcdef01n, 0x11111111n],
      [0n, 0n],
    ];
    for (const [a, b] of pairs) {
      const { sum } = add32Ripple(a, b);
      assert.equal(sum, (a + b) & 0xffffffffn);
    }
  });
  it('carry propagates across all 32 bits', () => {
    const { sum, finalCarry } = add32Ripple(0xffffffffn, 1n, { inspect: true });
    assert.equal(sum, 0n);
    assert.equal(finalCarry, 1);
  });
});
