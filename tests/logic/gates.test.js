import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATES, GATE_NAMES, evalGate, generateTruthTable,
  AND, OR, XOR, NOT, NAND, NOR, XNOR,
} from '../../src/logic/gates.js';

describe('gates', () => {
  it('exposes all seven gates', () => {
    assert.deepEqual(GATE_NAMES.sort(), ['AND', 'NAND', 'NOR', 'NOT', 'OR', 'XNOR', 'XOR'].sort());
  });
  it('AND truth table', () => {
    assert.equal(AND(false, false), false);
    assert.equal(AND(false, true), false);
    assert.equal(AND(true, false), false);
    assert.equal(AND(true, true), true);
  });
  it('OR truth table', () => {
    assert.equal(OR(false, false), false);
    assert.equal(OR(false, true), true);
    assert.equal(OR(true, false), true);
    assert.equal(OR(true, true), true);
  });
  it('XOR truth table', () => {
    assert.equal(XOR(false, false), false);
    assert.equal(XOR(false, true), true);
    assert.equal(XOR(true, false), true);
    assert.equal(XOR(true, true), false);
  });
  it('NOT truth table', () => {
    assert.equal(NOT(false), true);
    assert.equal(NOT(true), false);
  });
  it('NAND truth table', () => {
    assert.equal(NAND(false, false), true);
    assert.equal(NAND(false, true), true);
    assert.equal(NAND(true, false), true);
    assert.equal(NAND(true, true), false);
  });
  it('NOR truth table', () => {
    assert.equal(NOR(false, false), true);
    assert.equal(NOR(false, true), false);
    assert.equal(NOR(true, false), false);
    assert.equal(NOR(true, true), false);
  });
  it('XNOR truth table', () => {
    assert.equal(XNOR(false, false), true);
    assert.equal(XNOR(false, true), false);
    assert.equal(XNOR(true, false), false);
    assert.equal(XNOR(true, true), true);
  });
  it('generateTruthTable covers all combinations', () => {
    for (const name of GATE_NAMES) {
      const table = generateTruthTable(name);
      const arity = GATES[name].arity;
      assert.equal(table.inputs.length, arity);
      assert.equal(table.rows.length, arity === 1 ? 2 : 4);
      for (const row of table.rows) {
        assert.equal(row.result, evalGate(name, ...row.values));
      }
    }
  });
  it('rejects unknown gate', () => {
    assert.throws(() => evalGate('FOO', true), /Unknown gate/);
  });
  it('rejects missing second input for binary gates', () => {
    assert.throws(() => evalGate('AND', true), /requires two inputs/);
  });
});
