/**
 * Phase 1 — Inspector export scope and byte-fidelity regression tests.
 * Asserts actual output bytes, not merely string length.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveExportBytes,
  encodeExportText,
  exportFilename,
} from '../src/core/inspector-export.js';
import { encodeHex, decodeHex } from '../src/core/hex.js';
import { encodeBase64, decodeBase64 } from '../src/core/base64.js';
import { encodeBinary, decodeBinary } from '../src/core/binary.js';
import { bytesEqual } from '../src/core/utils.js';
import { selectionFromClick, sliceSelection } from '../src/core/hexgrid.js';

function sel(start, end) {
  return { start, end, length: end - start, anchor: start };
}

describe('resolveExportBytes — scope isolation', () => {
  const buf = new Uint8Array([0x00, 0x41, 0xff, 0x00, 0x42]);

  it('Copy All with no selection returns the entire buffer', () => {
    const r = resolveExportBytes(buf, 'all', null);
    assert.equal(r.ok, true);
    assert.equal(r.scope, 'all');
    assert.equal(r.length, 5);
    assert.ok(bytesEqual(r.data, buf));
  });

  it('Copy All with a one-byte selection still returns the entire buffer', () => {
    const one = sel(2, 3); // single 0xff
    const r = resolveExportBytes(buf, 'all', one);
    assert.equal(r.ok, true);
    assert.equal(r.scope, 'all');
    assert.equal(r.length, 5);
    assert.ok(bytesEqual(r.data, buf));
  });

  it('Copy All with a multi-byte selection still returns the entire buffer', () => {
    const multi = sel(1, 4);
    const r = resolveExportBytes(buf, 'all', multi);
    assert.equal(r.ok, true);
    assert.ok(bytesEqual(r.data, buf));
  });

  it('Copy Selection with one-byte selection returns exactly that byte', () => {
    const one = sel(2, 3);
    const r = resolveExportBytes(buf, 'selection', one);
    assert.equal(r.ok, true);
    assert.equal(r.scope, 'selection');
    assert.equal(r.length, 1);
    assert.equal(r.start, 2);
    assert.equal(r.end, 3);
    assert.ok(bytesEqual(r.data, new Uint8Array([0xff])));
  });

  it('Copy Selection with multi-byte selection preserves order and values', () => {
    const multi = sel(1, 4); // 0x41, 0xff, 0x00
    const r = resolveExportBytes(buf, 'selection', multi);
    assert.equal(r.ok, true);
    assert.equal(r.length, 3);
    assert.ok(bytesEqual(r.data, new Uint8Array([0x41, 0xff, 0x00])));
  });

  it('Copy Selection with no selection fails with diagnostic', () => {
    const r = resolveExportBytes(buf, 'selection', null);
    assert.equal(r.ok, false);
    assert.match(r.error, /No selection/i);
  });

  it('Copy Selection with empty selection fails', () => {
    const r = resolveExportBytes(buf, 'selection', { start: 0, end: 0, length: 0 });
    assert.equal(r.ok, false);
  });

  it('empty buffer — Copy All returns empty', () => {
    const r = resolveExportBytes(new Uint8Array(0), 'all', null);
    assert.equal(r.ok, true);
    assert.equal(r.length, 0);
    assert.ok(bytesEqual(r.data, new Uint8Array(0)));
  });

  it('one-byte buffer — Copy All and Copy Selection', () => {
    const one = new Uint8Array([0x7f]);
    const all = resolveExportBytes(one, 'all', null);
    assert.ok(bytesEqual(all.data, one));
    const s = resolveExportBytes(one, 'selection', sel(0, 1));
    assert.ok(bytesEqual(s.data, one));
  });

  it('selection at offset zero', () => {
    const r = resolveExportBytes(buf, 'selection', sel(0, 2));
    assert.ok(bytesEqual(r.data, new Uint8Array([0x00, 0x41])));
  });

  it('selection ending at final byte', () => {
    const r = resolveExportBytes(buf, 'selection', sel(3, 5));
    assert.ok(bytesEqual(r.data, new Uint8Array([0x00, 0x42])));
  });
});

describe('leading and trailing zero bytes', () => {
  it('leading zeros survive hex encode of selection', () => {
    const buf = new Uint8Array([0x00, 0x00, 0x01, 0x02]);
    const r = resolveExportBytes(buf, 'selection', sel(0, 3));
    assert.ok(bytesEqual(r.data, new Uint8Array([0x00, 0x00, 0x01])));
    const hex = encodeExportText(r.data, 'hex');
    assert.equal(hex, '00 00 01');
    const round = decodeHex(hex);
    assert.ok(bytesEqual(round, r.data));
  });

  it('trailing zeros survive base64 round-trip of full buffer', () => {
    const buf = new Uint8Array([0x41, 0x00, 0x00]);
    const r = resolveExportBytes(buf, 'all', null);
    const b64 = encodeExportText(r.data, 'base64');
    const round = decodeBase64(b64);
    assert.ok(bytesEqual(round, buf));
  });

  it('trailing zeros survive binary round-trip of selection', () => {
    const buf = new Uint8Array([0xff, 0x00, 0x00, 0x00]);
    const r = resolveExportBytes(buf, 'selection', sel(1, 4));
    assert.ok(bytesEqual(r.data, new Uint8Array([0x00, 0x00, 0x00])));
    const bin = encodeExportText(r.data, 'binary');
    const round = decodeBinary(bin);
    assert.ok(bytesEqual(round, r.data));
  });
});

describe('round-trips of full export path', () => {
  const samples = [
    new Uint8Array(0),
    new Uint8Array([0x00]),
    new Uint8Array([0xff]),
    new Uint8Array([0x00, 0x41, 0xff, 0x00, 0x42]),
    (() => {
      const a = new Uint8Array(256);
      for (let i = 0; i < 256; i++) a[i] = i;
      return a;
    })(),
    (() => {
      // larger buffer with zeros at both ends
      const a = new Uint8Array(1024);
      a[0] = 0x00;
      a[1] = 0xaa;
      a[1022] = 0xbb;
      a[1023] = 0x00;
      return a;
    })(),
  ];

  for (const [idx, buf] of samples.entries()) {
    it(`sample ${idx} (len ${buf.length}) hex/base64/binary round-trip via resolve+encode`, () => {
      const r = resolveExportBytes(buf, 'all', null);
      assert.equal(r.ok, true);

      const hex = encodeExportText(r.data, 'hex');
      assert.ok(bytesEqual(decodeHex(hex), buf));

      const b64 = encodeExportText(r.data, 'base64');
      assert.ok(bytesEqual(decodeBase64(b64), buf));

      const bin = encodeExportText(r.data, 'binary');
      assert.ok(bytesEqual(decodeBinary(bin), buf));
    });
  }
});

describe('exportFilename', () => {
  it('distinguishes all vs selection', () => {
    assert.equal(exportFilename('all', 'bin', { length: 12 }), 'babelcodec-all-12b.bin');
    assert.equal(
      exportFilename('selection', 'hex', { start: 4, end: 8, length: 4 }),
      'babelcodec-sel-4-8-4b.hex.txt',
    );
  });
});

describe('selection boundaries from hexgrid helpers', () => {
  it('selectionFromClick single byte + sliceSelection', () => {
    const buf = new Uint8Array([0x10, 0x20, 0x30]);
    const s = selectionFromClick(0, null, 3, false);
    assert.equal(s.start, 0);
    assert.equal(s.end, 1);
    assert.equal(s.length, 1);
    const sliced = sliceSelection(buf, s);
    assert.ok(bytesEqual(sliced, new Uint8Array([0x10])));
  });

  it('extended selection preserves order', () => {
    const buf = new Uint8Array([0x10, 0x20, 0x30, 0x40]);
    const s = selectionFromClick(3, 1, 4, true);
    assert.equal(s.start, 1);
    assert.equal(s.end, 4);
    const sliced = sliceSelection(buf, s);
    assert.ok(bytesEqual(sliced, new Uint8Array([0x20, 0x30, 0x40])));
  });
});

describe('download payload fidelity (resolved bytes)', () => {
  it('Download All payload equals source', () => {
    const buf = new Uint8Array([0xde, 0xad, 0x00, 0xbe, 0xef]);
    const r = resolveExportBytes(buf, 'all', sel(1, 2));
    assert.ok(bytesEqual(r.data, buf));
  });

  it('Download Selection payload equals selected range only', () => {
    const buf = new Uint8Array([0xde, 0xad, 0x00, 0xbe, 0xef]);
    const r = resolveExportBytes(buf, 'selection', sel(1, 4));
    assert.ok(bytesEqual(r.data, new Uint8Array([0xad, 0x00, 0xbe])));
  });
});
