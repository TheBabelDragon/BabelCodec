import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { add32, rotateRight32, shiftRight32 } from '../../src/sha256/index.js';

describe('SHA-256 arithmetic', () => {
  it('add32 modular wrap', () => {
    assert.equal(add32(0xffffffffn, 1n), 0n);
    assert.equal(add32(0xfffffffen, 3n), 1n);
    assert.equal(add32(1n, 2n, 3n), 6n);
  });
  it('rotateRight32', () => {
    assert.equal(rotateRight32(0x12345678n, 8), 0x78123456n);
    assert.equal(rotateRight32(1n, 1), 0x80000000n);
    assert.equal(rotateRight32(0x80000000n, 1), 0x40000000n);
  });
  it('shiftRight32', () => {
    assert.equal(shiftRight32(0x80000000n, 1), 0x40000000n);
    assert.equal(shiftRight32(0xffffffffn, 31), 1n);
    assert.equal(shiftRight32(0xffn, 8), 0n);
  });
});
