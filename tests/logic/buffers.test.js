import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  andBytes, orBytes, xorBytes, notBytes, applyMaskBytes, diffBytes,
} from '../../src/logic/buffers.js';

describe('buffers', () => {
  it('andBytes / orBytes / xorBytes / notBytes', () => {
    const a = new Uint8Array([0xff, 0x00, 0xaa]);
    const b = new Uint8Array([0x0f, 0xff, 0x55]);
    assert.deepEqual(andBytes(a, b), new Uint8Array([0x0f, 0x00, 0x00]));
    assert.deepEqual(orBytes(a, b), new Uint8Array([0xff, 0xff, 0xff]));
    assert.deepEqual(xorBytes(a, b), new Uint8Array([0xf0, 0xff, 0xff]));
    assert.deepEqual(notBytes(a), new Uint8Array([0x00, 0xff, 0x55]));
  });
  it('does not mutate sources', () => {
    const a = new Uint8Array([0xaa]);
    const b = new Uint8Array([0x55]);
    const copyA = a.slice();
    const copyB = b.slice();
    xorBytes(a, b);
    notBytes(a);
    assert.deepEqual(a, copyA);
    assert.deepEqual(b, copyB);
  });
  it('rejects length mismatch', () => {
    assert.throws(() => xorBytes(new Uint8Array([1]), new Uint8Array([1, 2])), /length/i);
  });
  it('empty buffers', () => {
    const empty = new Uint8Array(0);
    assert.deepEqual(xorBytes(empty, empty), new Uint8Array(0));
    assert.deepEqual(notBytes(empty), new Uint8Array(0));
  });
  it('applyMaskBytes repeats short mask', () => {
    const data = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    const mask = new Uint8Array([0x0f]);
    assert.deepEqual(applyMaskBytes(data, mask), new Uint8Array([0x0f, 0x0f, 0x0f, 0x0f]));
  });
  it('diffBytes identifies changed bytes and bits', () => {
    const prev = new Uint8Array([0b00000000, 0b11110000, 0xaa]);
    const curr = new Uint8Array([0b00000001, 0b11110000, 0xaa]);
    const d = diffBytes(prev, curr);
    assert.deepEqual(d.difference, new Uint8Array([0x01, 0x00, 0x00]));
    assert.deepEqual(d.changedOffsets, [0]);
    assert.equal(d.changedByteCount, 1);
    assert.equal(d.changedBitCount, 1);
    assert.equal(d.changedBits[0].offset, 0);
    assert.equal(d.changedBits[0].bit, 0);
    assert.equal(d.changedBits[0].previous, 0);
    assert.equal(d.changedBits[0].current, 1);
    assert.deepEqual(xorBytes(prev, d.difference), curr);
  });
  it('diffBytes all-ones vs all-zeros', () => {
    const prev = new Uint8Array([0x00, 0x00]);
    const curr = new Uint8Array([0xff, 0xff]);
    const d = diffBytes(prev, curr);
    assert.equal(d.changedByteCount, 2);
    assert.equal(d.changedBitCount, 16);
  });
  it('diffBytes identical → zero difference', () => {
    const a = new Uint8Array([1, 2, 3]);
    const d = diffBytes(a, a.slice());
    assert.equal(d.changedByteCount, 0);
    assert.equal(d.changedBitCount, 0);
    assert.deepEqual(d.difference, new Uint8Array([0, 0, 0]));
  });
});
