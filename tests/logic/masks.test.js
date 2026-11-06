import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMask, testBit, setBit, clearBit, toggleBit, validateBit,
} from '../../src/logic/masks.js';

describe('masks', () => {
  it('applyMask', () => {
    assert.equal(applyMask(0b11111111, 0b00001111, { width: 8, asNumber: true }), 0b00001111);
    assert.equal(applyMask(0xabcd, 0x00ff, { width: 16, asNumber: true }), 0x00cd);
  });
  it('testBit / setBit / clearBit / toggleBit', () => {
    assert.equal(testBit(0b00000100, 2, { width: 8 }), true);
    assert.equal(testBit(0b00000100, 1, { width: 8 }), false);
    assert.equal(setBit(0, 3, { width: 8, asNumber: true }), 0b00001000);
    assert.equal(clearBit(0xff, 0, { width: 8, asNumber: true }), 0xfe);
    assert.equal(toggleBit(0b00001000, 3, { width: 8, asNumber: true }), 0);
    assert.equal(toggleBit(0, 7, { width: 8, asNumber: true }), 0x80);
  });
  it('rejects out-of-range bit', () => {
    assert.throws(() => testBit(0, 8, { width: 8 }), /bit/i);
    assert.throws(() => setBit(0, -1, { width: 8 }), /bit/i);
    assert.throws(() => validateBit(32, 32), /bit/i);
  });
  it('status flag example (bit 2)', () => {
    const status = 0b00000100;
    assert.equal(testBit(status, 2, { width: 8 }), true);
    const masked = applyMask(status, 0x0f, { width: 8, asNumber: true });
    assert.equal(masked, 0x04);
  });
});
