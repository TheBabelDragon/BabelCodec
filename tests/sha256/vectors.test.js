import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex, sha256, padMessage, createMessageSchedule, parseBlockWords } from '../../src/sha256/index.js';

describe('SHA-256 known-answer vectors', () => {
  it('empty string', () => {
    assert.equal(
      sha256Hex(''),
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
  it('abc', () => {
    assert.equal(
      sha256Hex('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('hello world', () => {
    assert.equal(
      sha256Hex('hello world'),
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });
  it('bytes input matches string', () => {
    const s = 'abc';
    const bytes = new TextEncoder().encode(s);
    assert.equal(sha256Hex(bytes), sha256Hex(s));
  });
  it('multi-block message', () => {
    const msg = 'a'.repeat(56);
    const r = sha256(msg);
    assert.ok(r.blocks >= 2);
    assert.equal(r.hex.length, 64);
    const long = 'a'.repeat(1000);
    const h = sha256Hex(long);
    assert.equal(h.length, 64);
    assert.match(h, /^[0-9a-f]{64}$/);
  });
  it('padding length is multiple of 64', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 100]) {
      const p = padMessage(new Uint8Array(n));
      assert.equal(p.length % 64, 0);
      assert.ok(p.length >= n + 9);
    }
  });
  it('schedule has 64 words', () => {
    const p = padMessage('abc');
    const words = parseBlockWords(p, 0);
    const W = createMessageSchedule(words);
    assert.equal(W.length, 64);
  });
});
