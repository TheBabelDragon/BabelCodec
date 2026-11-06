import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { leftShift, rightShift } from '../../src/logic/shifts.js';

describe('shifts', () => {
  it('leftShift fills zeros and discards overflow', () => {
    assert.equal(leftShift(0b00000001, 3, { width: 8, asNumber: true }), 0b00001000);
    assert.equal(leftShift(0b10000000, 1, { width: 8, asNumber: true }), 0);
    assert.equal(leftShift(1, 8, { width: 8, asNumber: true }), 0);
  });
  it('rightShift logical fills zeros', () => {
    assert.equal(rightShift(0b10000000, 1, { width: 8, asNumber: true }), 0b01000000);
    assert.equal(rightShift(0xff, 4, { width: 8, asNumber: true }), 0x0f);
    assert.equal(rightShift(0xff, 8, { width: 8, asNumber: true }), 0);
  });
  it('rightShift arithmetic sign-extends', () => {
    assert.equal(rightShift(0b11110000, 2, { width: 8, arithmetic: true, asNumber: true }), 0b11111100);
    assert.equal(rightShift(0b01110000, 2, { width: 8, arithmetic: true, asNumber: true }), 0b00011100);
  });
  it('rejects invalid shift amounts', () => {
    assert.throws(() => leftShift(1, -1, { width: 8 }), /shift/i);
    assert.throws(() => leftShift(1, 9, { width: 8 }), /shift/i);
  });
  it('64-bit left shift', () => {
    const r = leftShift(1n, 63, { width: 64 });
    assert.equal(r, 1n << 63n);
  });
});
