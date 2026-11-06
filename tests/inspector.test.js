/**
 * Inspector, search, structure, and security regression tests.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchBytes,
  findNext,
  findPrevious,
  interpretBytes,
  validateLayout,
  decodeLayout,
  buildHexGrid,
  parseOffset,
  selectionFromClick,
  sliceSelection,
  bytesEqual,
  encodeUtf8,
  ValidationError,
} from '../src/core/index.js';

describe('searchBytes', () => {
  it('finds hex patterns including 00 and FF', () => {
    const buf = new Uint8Array([0x00, 0x41, 0xff, 0x00, 0xff, 0x42]);
    const r = searchBytes(buf, '00FF', { mode: 'hex' });
    assert.equal(r.count, 1);
    assert.equal(r.matches[0], 3);
  });

  it('finds overlapping matches', () => {
    const buf = new Uint8Array([0xaa, 0xaa, 0xaa]);
    const r = searchBytes(buf, 'AAAA', { mode: 'hex', overlap: true });
    assert.equal(r.count, 2);
    assert.deepEqual(r.matches, [0, 1]);
  });

  it('finds non-overlapping when requested', () => {
    const buf = new Uint8Array([0xaa, 0xaa, 0xaa, 0xaa]);
    const r = searchBytes(buf, 'AAAA', { mode: 'hex', overlap: false });
    assert.equal(r.count, 2);
    assert.deepEqual(r.matches, [0, 2]);
  });

  it('rejects empty pattern', () => {
    assert.throws(() => searchBytes(new Uint8Array([1]), '', { mode: 'hex' }), ValidationError);
  });

  it('searches ASCII and UTF-8', () => {
    const buf = encodeUtf8('Hello café');
    assert.ok(searchBytes(buf, 'Hello', { mode: 'ascii' }).count >= 1);
    assert.ok(searchBytes(buf, 'café', { mode: 'utf8' }).count === 1);
  });

  it('findNext / findPrevious', () => {
    const buf = new Uint8Array([1, 2, 3, 1, 2, 3]);
    const n = findNext(buf, '0102', 0, { mode: 'hex' });
    assert.equal(n, 3);
    const p = findPrevious(buf, '0102', 3, { mode: 'hex' });
    assert.equal(p, 0);
  });
});

describe('interpretBytes', () => {
  it('reads little and big endian uint32', () => {
    const b = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const le = interpretBytes(b, { endian: 'little', types: ['uint32'] });
    assert.equal(le.values.uint32.value, 0x04030201);
    const be = interpretBytes(b, { endian: 'big', types: ['uint32'] });
    assert.equal(be.values.uint32.value, 0x01020304);
  });

  it('handles signed boundaries', () => {
    const b = new Uint8Array([0xff]);
    const r = interpretBytes(b, { types: ['int8', 'uint8'] });
    assert.equal(r.values.int8.value, -1);
    assert.equal(r.values.uint8.value, 255);
  });

  it('preserves uint64 with BigInt', () => {
    const b = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    const r = interpretBytes(b, { endian: 'big', types: ['uint64'] });
    assert.equal(typeof r.values.uint64.value, 'bigint');
    assert.equal(r.values.uint64.value, 0xffffffffffffffffn);
  });

  it('handles float specials', () => {
    const inf = new Uint8Array([0x7f, 0x80, 0x00, 0x00]);
    const r = interpretBytes(inf, { endian: 'big', types: ['float32'] });
    assert.equal(r.values.float32.value, Infinity);
    assert.equal(r.values.float32.valueString, '+Infinity');
  });

  it('reports insufficient bytes', () => {
    const b = new Uint8Array([1, 2]);
    const r = interpretBytes(b, { types: ['uint32'] });
    assert.equal(r.values.uint32.ok, false);
    assert.match(r.values.uint32.error, /Insufficient/);
  });

  it('rejects out of range offset', () => {
    assert.throws(
      () => interpretBytes(new Uint8Array([1]), { offset: 5 }),
      ValidationError,
    );
  });

  it('does not mutate source', () => {
    const b = new Uint8Array([1, 2, 3, 4]);
    const copy = new Uint8Array(b);
    interpretBytes(b, { types: ['uint32'] });
    assert.ok(bytesEqual(b, copy));
  });
});

describe('validateLayout / decodeLayout', () => {
  const layout = {
    fields: [
      { name: 'msgId', offset: 0, length: 2, type: 'uint16', endian: 'big' },
      { name: 'len', offset: 2, length: 2, type: 'uint16', endian: 'big' },
      { name: 'seq', offset: 4, length: 4, type: 'uint32', endian: 'little' },
      { name: 'payload', offset: 8, length: 4, type: 'bytes' },
    ],
  };

  it('validates a clean layout', () => {
    const v = validateLayout(layout, 12);
    assert.equal(v.ok, true);
    assert.equal(v.coveredBytes, 12);
    assert.equal(v.gapBytes, 0);
  });

  it('detects overlaps', () => {
    const bad = {
      fields: [
        { name: 'a', offset: 0, length: 4, type: 'uint32' },
        { name: 'b', offset: 2, length: 2, type: 'uint16' },
      ],
    };
    const v = validateLayout(bad, 8);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /overlap/i.test(e)));
  });

  it('detects out-of-bounds fields', () => {
    const bad = {
      fields: [{ name: 'x', offset: 10, length: 4, type: 'bytes' }],
    };
    const v = validateLayout(bad, 8);
    assert.equal(v.ok, false);
  });

  it('decodes layout without mutating buffer', () => {
    const buf = new Uint8Array([
      0x12, 0x34, 0x00, 0x04, 0x04, 0x03, 0x02, 0x01, 0x0a, 0x0b, 0x0c, 0x0d,
    ]);
    const copy = new Uint8Array(buf);
    const r = decodeLayout(buf, layout);
    assert.equal(r.ok, true);
    assert.equal(r.fields[0].value, 0x1234);
    assert.equal(r.fields[1].value, 4);
    assert.equal(r.fields[2].value, 0x01020304);
    assert.ok(bytesEqual(r.fields[3].value, new Uint8Array([0x0a, 0x0b, 0x0c, 0x0d])));
    assert.ok(bytesEqual(buf, copy));
  });

  it('JSON round-trip of layout definition', () => {
    const json = JSON.stringify(layout);
    const back = JSON.parse(json);
    const v = validateLayout(back, 12);
    assert.equal(v.ok, true);
  });

  it('allows gaps', () => {
    const gapped = {
      fields: [
        { name: 'a', offset: 0, length: 2, type: 'uint16' },
        { name: 'b', offset: 4, length: 2, type: 'uint16' },
      ],
    };
    const v = validateLayout(gapped, 8);
    assert.equal(v.ok, true);
    assert.equal(v.gapBytes, 4);
  });
});

describe('hex grid', () => {
  it('builds rows with correct offsets', () => {
    const buf = new Uint8Array(40);
    for (let i = 0; i < 40; i++) buf[i] = i;
    const grid = buildHexGrid(buf, { bytesPerRow: 16 });
    assert.equal(grid.bytesPerRow, 16);
    assert.equal(grid.rows.length, 3);
    assert.equal(grid.rows[0].offset, 0);
    assert.equal(grid.rows[1].offset, 16);
    assert.equal(grid.rows[0].hexCells[0], '00');
    assert.equal(grid.rows[0].hexCells[15], '0F');
  });

  it('supports 8 and 32 bytes per row', () => {
    const buf = new Uint8Array(32);
    assert.equal(buildHexGrid(buf, { bytesPerRow: 8 }).rows.length, 4);
    assert.equal(buildHexGrid(buf, { bytesPerRow: 32 }).rows.length, 1);
  });

  it('parseOffset accepts decimal and hex', () => {
    assert.equal(parseOffset('16', 100), 16);
    assert.equal(parseOffset('0x10', 100), 16);
    assert.equal(parseOffset('10h', 100), 16);
    assert.throws(() => parseOffset('0xZZ', 100), ValidationError);
    assert.throws(() => parseOffset('200', 100), ValidationError);
  });

  it('selectionFromClick and sliceSelection', () => {
    const buf = new Uint8Array([0x10, 0x20, 0x30, 0x40]);
    const s1 = selectionFromClick(1, null, 4, false);
    assert.deepEqual({ start: s1.start, end: s1.end, length: s1.length }, { start: 1, end: 2, length: 1 });
    const s2 = selectionFromClick(3, 1, 4, true);
    assert.equal(s2.start, 1);
    assert.equal(s2.end, 4);
    const sliced = sliceSelection(buf, s2);
    assert.ok(bytesEqual(sliced, new Uint8Array([0x20, 0x30, 0x40])));
  });
});

describe('security / integrity', () => {
  it('escapes are required for HTML — pattern contains angle brackets as data', () => {
    const evil = encodeUtf8('<script>alert(1)</script>');
    const r = searchBytes(evil, '<script>', { mode: 'utf8' });
    assert.equal(r.count, 1);
  });

  it('all 256 byte values survive search and slice', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    const r = searchBytes(all, '7F80', { mode: 'hex' });
    assert.ok(r.count >= 1);
    const sel = sliceSelection(all, { start: 0, end: 256, length: 256 });
    assert.ok(bytesEqual(all, sel));
  });

  it('leading zeros preserved in hex grid', () => {
    const b = new Uint8Array([0, 0, 1]);
    const g = buildHexGrid(b, { bytesPerRow: 8 });
    assert.equal(g.rows[0].hexCells[0], '00');
    assert.equal(g.rows[0].hexCells[1], '00');
    assert.equal(g.rows[0].hexCells[2], '01');
  });

  it('invalid UTF-8 remains inspectable as bytes', () => {
    const b = new Uint8Array([0xff, 0xfe, 0x41]);
    const g = buildHexGrid(b);
    assert.equal(g.rows[0].hexCells[0], 'FF');
    assert.equal(g.rows[0].hexCells[1], 'FE');
    const interp = interpretBytes(b, { types: ['utf8', 'hex'] });
    assert.equal(interp.values.utf8.ok, false);
    assert.equal(interp.values.hex.value, 'FFFE41');
  });
});
