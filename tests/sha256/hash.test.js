import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sha256, sha256Bytes, add32, rotateRight32, ch, maj } from '../../src/sha256/index.js';

describe('SHA-256 hash API', () => {
  it('sha256Bytes length 32', () => {
    const d = sha256Bytes(new Uint8Array([1, 2, 3]));
    assert.equal(d.length, 32);
  });
  it('does not mutate input buffer', () => {
    const buf = new Uint8Array([1, 2, 3, 4]);
    const copy = buf.slice();
    sha256(buf);
    assert.deepEqual(buf, copy);
  });
  it('trace option provides rounds', () => {
    const r = sha256('abc', { trace: true });
    assert.ok(r.blockTraces);
    assert.equal(r.blockTraces[0].rounds.length, 64);
  });
  it('ch/maj basic', () => {
    assert.equal(ch(0xffffffffn, 0x12345678n, 0n), 0x12345678n);
    assert.equal(maj(0xffffffffn, 0xffffffffn, 0n), 0xffffffffn);
  });
});
