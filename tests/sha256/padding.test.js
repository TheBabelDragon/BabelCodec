import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { padMessage, blockCount } from '../../src/sha256/index.js';

describe('SHA-256 padding', () => {
  it('empty message pads to 64 bytes', () => {
    const p = padMessage('');
    assert.equal(p.length, 64);
    assert.equal(p[0], 0x80);
    assert.equal(blockCount(p), 1);
  });

  it('55 bytes → 64; 56 bytes → 128', () => {
    assert.equal(padMessage('a'.repeat(55)).length, 64);
    assert.equal(padMessage('a'.repeat(56)).length, 128);
  });

  it('appends 64-bit big-endian bit length', () => {
    const p = padMessage('abc'); // 24 bits
    assert.equal(p[p.length - 1], 24);
    assert.equal(p[p.length - 2], 0);
  });
});
