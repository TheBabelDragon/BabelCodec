/**
 * Phase 2 — buffer history, edit ops, and byte-diff regression tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBufferHistory,
  editByte,
  insertBytes,
  deleteRange,
  replaceRange,
  selectAll,
  clearSelection,
  selectRangeByStartLength,
  revalidateSelection,
  parseByteValue,
  bytesEqual,
} from '../src/core/buffer-history.js';
import { byteDiff, exportDiffJson } from '../src/core/byte-diff.js';
import { ValidationError } from '../src/core/errors.js';

describe('createBufferHistory', () => {
  it('starts with empty or provided buffer', () => {
    const h0 = createBufferHistory();
    assert.equal(h0.getBytes().length, 0);
    const h1 = createBufferHistory(new Uint8Array([1, 2, 3]));
    assert.ok(bytesEqual(h1.getBytes(), new Uint8Array([1, 2, 3])));
  });

  it('undo/redo restore exact prior sequences', () => {
    const h = createBufferHistory(new Uint8Array([0x00]));
    h.setBytes(editByte(h.getBytes(), 0, 0xff));
    assert.ok(bytesEqual(h.getBytes(), new Uint8Array([0xff])));
    h.setBytes(insertBytes(h.getBytes(), 1, new Uint8Array([0x41, 0x42])));
    assert.ok(bytesEqual(h.getBytes(), new Uint8Array([0xff, 0x41, 0x42])));

    assert.equal(h.canUndo(), true);
    const u1 = h.undo();
    assert.ok(bytesEqual(u1, new Uint8Array([0xff])));
    const u0 = h.undo();
    assert.ok(bytesEqual(u0, new Uint8Array([0x00])));
    assert.equal(h.canUndo(), false);

    assert.equal(h.canRedo(), true);
    const r1 = h.redo();
    assert.ok(bytesEqual(r1, new Uint8Array([0xff])));
    const r2 = h.redo();
    assert.ok(bytesEqual(r2, new Uint8Array([0xff, 0x41, 0x42])));
    assert.equal(h.canRedo(), false);
  });

  it('new edit after undo drops redo branch', () => {
    const h = createBufferHistory(new Uint8Array([1]));
    h.setBytes(new Uint8Array([2]));
    h.setBytes(new Uint8Array([3]));
    h.undo();
    h.setBytes(new Uint8Array([9]));
    assert.ok(bytesEqual(h.getBytes(), new Uint8Array([9])));
    assert.equal(h.canRedo(), false);
  });
});

describe('editByte / insert / delete / replace', () => {
  const base = new Uint8Array([0x10, 0x20, 0x30, 0x40]);

  it('editByte changes one offset', () => {
    const n = editByte(base, 1, 0xaa);
    assert.ok(bytesEqual(n, new Uint8Array([0x10, 0xaa, 0x30, 0x40])));
    assert.ok(bytesEqual(base, new Uint8Array([0x10, 0x20, 0x30, 0x40]))); // immutable source
  });

  it('editByte rejects out-of-range offset and value', () => {
    assert.throws(() => editByte(base, 4, 0), ValidationError);
    assert.throws(() => editByte(base, 0, 256), ValidationError);
    assert.throws(() => editByte(base, 0, -1), ValidationError);
    assert.throws(() => editByte(base, 0, 1.5), ValidationError);
  });

  it('insertBytes at start, middle, end', () => {
    assert.ok(
      bytesEqual(
        insertBytes(base, 0, new Uint8Array([0xff])),
        new Uint8Array([0xff, 0x10, 0x20, 0x30, 0x40]),
      ),
    );
    assert.ok(
      bytesEqual(
        insertBytes(base, 2, new Uint8Array([0xaa, 0xbb])),
        new Uint8Array([0x10, 0x20, 0xaa, 0xbb, 0x30, 0x40]),
      ),
    );
    assert.ok(
      bytesEqual(
        insertBytes(base, 4, new Uint8Array([0x00])),
        new Uint8Array([0x10, 0x20, 0x30, 0x40, 0x00]),
      ),
    );
  });

  it('deleteRange removes exact slice', () => {
    assert.ok(bytesEqual(deleteRange(base, 1, 3), new Uint8Array([0x10, 0x40])));
    assert.ok(bytesEqual(deleteRange(base, 0, 4), new Uint8Array(0)));
    assert.ok(bytesEqual(deleteRange(base, 2, 2), base)); // empty range
  });

  it('replaceRange swaps a span', () => {
    const n = replaceRange(base, 1, 3, new Uint8Array([0xde, 0xad, 0xbe]));
    assert.ok(bytesEqual(n, new Uint8Array([0x10, 0xde, 0xad, 0xbe, 0x40])));
  });

  it('leading and trailing zeros survive edits', () => {
    const z = new Uint8Array([0x00, 0x00, 0x01, 0x00]);
    const e = editByte(z, 2, 0x02);
    assert.ok(bytesEqual(e, new Uint8Array([0x00, 0x00, 0x02, 0x00])));
    const d = deleteRange(z, 2, 3);
    assert.ok(bytesEqual(d, new Uint8Array([0x00, 0x00, 0x00])));
  });
});

describe('selection helpers', () => {
  it('selectAll / clearSelection', () => {
    assert.deepEqual(selectAll(5), { start: 0, end: 5, length: 5, anchor: 0 });
    assert.equal(selectAll(0), null);
    assert.equal(clearSelection(), null);
  });

  it('selectRangeByStartLength clamps and validates', () => {
    const s = selectRangeByStartLength(2, 10, 5);
    assert.equal(s.start, 2);
    assert.equal(s.end, 5);
    assert.equal(s.length, 3);
    assert.throws(() => selectRangeByStartLength(-1, 1, 5), ValidationError);
    assert.throws(() => selectRangeByStartLength(0, -1, 5), ValidationError);
  });

  it('revalidateSelection after shrink', () => {
    const sel = { start: 2, end: 8, length: 6, anchor: 2 };
    const r = revalidateSelection(sel, 4);
    assert.equal(r.start, 2);
    assert.equal(r.end, 4);
    assert.equal(r.length, 2);
    assert.equal(revalidateSelection(sel, 0), null);
  });
});

describe('parseByteValue', () => {
  it('accepts decimal, hex forms', () => {
    assert.equal(parseByteValue(255), 255);
    assert.equal(parseByteValue('0xff'), 255);
    assert.equal(parseByteValue('FFh'), 255);
    assert.equal(parseByteValue('0A'), 10);
    assert.equal(parseByteValue('10'), 10);
  });

  it('rejects out of range', () => {
    assert.throws(() => parseByteValue(256), ValidationError);
    assert.throws(() => parseByteValue('0x100'), ValidationError);
    assert.throws(() => parseByteValue(''), ValidationError);
  });
});

describe('byteDiff', () => {
  it('identical buffers', () => {
    const a = new Uint8Array([1, 2, 3]);
    const d = byteDiff(a, a);
    assert.equal(d.identical, true);
    assert.equal(d.summary.equal, 3);
  });

  it('detects changed middle', () => {
    const a = new Uint8Array([0, 1, 2, 3, 4]);
    const b = new Uint8Array([0, 9, 9, 3, 4]);
    const d = byteDiff(a, b);
    assert.equal(d.identical, false);
    const changed = d.regions.filter((r) => r.type === 'changed');
    assert.equal(changed.length, 1);
    assert.equal(changed[0].aStart, 1);
    assert.equal(changed[0].aEnd, 3);
  });

  it('detects pure insertion', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 9, 9, 3]);
    const d = byteDiff(a, b);
    const ins = d.regions.filter((r) => r.type === 'inserted');
    assert.ok(ins.length === 1 || d.regions.some((r) => r.type === 'changed'));
  });

  it('detects pure removal', () => {
    const a = new Uint8Array([1, 2, 9, 3]);
    const b = new Uint8Array([1, 2, 3]);
    const d = byteDiff(a, b);
    assert.equal(d.identical, false);
    assert.ok(d.summary.removed > 0 || d.summary.changed > 0);
  });

  it('exportDiffJson is structured and notes byte-level only', () => {
    const d = byteDiff(new Uint8Array([1]), new Uint8Array([2]));
    const json = exportDiffJson(d);
    const obj = JSON.parse(json);
    assert.equal(obj.kind, 'babelcodec-byte-diff');
    assert.match(obj.note, /Byte-level/);
    assert.equal(obj.identical, false);
  });

  it('empty vs non-empty', () => {
    const d = byteDiff(new Uint8Array(0), new Uint8Array([1, 2]));
    assert.equal(d.identical, false);
    assert.ok(d.summary.inserted === 2 || d.regions.some((r) => r.type === 'inserted'));
  });
});
