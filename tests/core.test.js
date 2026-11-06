/**
 * BabelCodec core test suite — Node built-in test runner.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeBinary,
  decodeBinary,
  encodeHex,
  decodeHex,
  encodeBase64,
  decodeBase64,
  encodeAscii,
  decodeAscii,
  encodeUtf8,
  decodeUtf8,
  encodeDecimal,
  decodeDecimal,
  encodeOctal,
  decodeOctal,
  encodeMorse,
  decodeMorse,
  convert,
  bytesEqual,
  inspectBytes,
  listCodecs,
  MalformedInputError,
  ValidationError,
} from '../src/core/index.js';

describe('binary', () => {
  it('encodes all 256 byte values', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    const encoded = encodeBinary(all);
    const decoded = decodeBinary(encoded);
    assert.ok(bytesEqual(all, decoded));
  });

  it('preserves leading zeros', () => {
    const bytes = new Uint8Array([0, 0, 1, 0]);
    const enc = encodeBinary(bytes);
    assert.ok(enc.startsWith('00000000'));
    assert.ok(bytesEqual(bytes, decodeBinary(enc)));
  });

  it('handles empty input', () => {
    assert.equal(encodeBinary(new Uint8Array(0)), '');
    assert.ok(bytesEqual(decodeBinary(''), new Uint8Array(0)));
    assert.ok(bytesEqual(decodeBinary('   '), new Uint8Array(0)));
  });

  it('rejects invalid bit characters', () => {
    assert.throws(() => decodeBinary('0100000a'), MalformedInputError);
    assert.throws(() => decodeBinary('01 02'), MalformedInputError);
  });

  it('rejects incomplete byte groups', () => {
    assert.throws(() => decodeBinary('0100000'), MalformedInputError);
    assert.throws(() => decodeBinary('01000001 010'), MalformedInputError);
  });

  it('handles whitespace-separated groups', () => {
    const bytes = decodeBinary('01000001 01000010');
    assert.equal(bytes[0], 0x41);
    assert.equal(bytes[1], 0x42);
  });

  it('handles continuous eight-bit sequences', () => {
    const bytes = decodeBinary('0100000101000010');
    assert.equal(bytes[0], 0x41);
    assert.equal(bytes[1], 0x42);
  });
});

describe('hex', () => {
  it('round-trips all 256 values', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;
    assert.ok(bytesEqual(all, decodeHex(encodeHex(all))));
  });

  it('preserves leading zeros', () => {
    const b = new Uint8Array([0, 0xff]);
    assert.equal(encodeHex(b), '00FF');
    assert.ok(bytesEqual(b, decodeHex('00FF')));
  });

  it('rejects incomplete hex', () => {
    assert.throws(() => decodeHex('ABC'), MalformedInputError);
  });

  it('accepts whitespace and 0x prefixes', () => {
    assert.ok(bytesEqual(new Uint8Array([0xab, 0xcd]), decodeHex('0xAB 0xCD')));
  });

  it('empty', () => {
    assert.ok(bytesEqual(decodeHex(''), new Uint8Array(0)));
  });
});

describe('base64', () => {
  it('round-trips arbitrary bytes', () => {
    const samples = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([0, 0, 0]),
      new Uint8Array([255, 254, 253]),
      encodeUtf8('Hello, BabelCodec'),
    ];
    for (const s of samples) {
      assert.ok(bytesEqual(s, decodeBase64(encodeBase64(s))), `failed for length ${s.length}`);
    }
  });

  it('rejects invalid characters', () => {
    assert.throws(() => decodeBase64('!!!!'), MalformedInputError);
  });
});

describe('ascii', () => {
  it('encodes printable ASCII', () => {
    const t = 'Hello, World!';
    const b = encodeAscii(t);
    assert.equal(decodeAscii(b), t);
  });

  it('includes control characters', () => {
    const t = 'A\nB\tC';
    assert.equal(decodeAscii(encodeAscii(t)), t);
  });

  it('rejects non-ASCII on encode', () => {
    assert.throws(() => encodeAscii('café'), MalformedInputError);
  });

  it('rejects non-ASCII bytes on decode', () => {
    assert.throws(() => decodeAscii(new Uint8Array([0x41, 0x80])), MalformedInputError);
  });
});

describe('utf8', () => {
  it('round-trips Unicode', () => {
    const texts = ['', 'ASCII', 'café', '日本語', 'combining e\u0301'];
    for (const t of texts) {
      assert.equal(decodeUtf8(encodeUtf8(t)), t);
    }
  });

  it('rejects invalid UTF-8 when fatal', () => {
    assert.throws(() => decodeUtf8(new Uint8Array([0xff, 0xfe]), { fatal: true }), MalformedInputError);
  });

  it('multibyte sequences', () => {
    const bytes = encodeUtf8('€');
    assert.deepEqual(Array.from(bytes), [0xe2, 0x82, 0xac]);
  });
});

describe('decimal', () => {
  it('round-trips', () => {
    const b = new Uint8Array([0, 1, 127, 255]);
    assert.ok(bytesEqual(b, decodeDecimal(encodeDecimal(b))));
  });

  it('rejects out of range', () => {
    assert.throws(() => decodeDecimal('256'), MalformedInputError);
  });
});

describe('octal', () => {
  it('round-trips', () => {
    const b = new Uint8Array([0, 1, 8, 64, 255]);
    assert.ok(bytesEqual(b, decodeOctal(encodeOctal(b))));
  });

  it('rejects invalid octal', () => {
    assert.throws(() => decodeOctal('8'), MalformedInputError);
  });
});

describe('morse', () => {
  it('round-trips simple text', () => {
    const t = 'SOS';
    assert.equal(decodeMorse(encodeMorse(t)), t);
  });

  it('handles words', () => {
    const t = 'HELLO WORLD';
    assert.equal(decodeMorse(encodeMorse(t)), t);
  });

  it('rejects unsupported characters', () => {
    assert.throws(() => encodeMorse('你好'), MalformedInputError);
  });
});

describe('cross-conversion', () => {
  it('binary → hex → binary', () => {
    const b = new Uint8Array([0x00, 0x41, 0xff]);
    const hex = convert(b, 'bytes', 'hex').output;
    const back = convert(hex, 'hex', 'bytes').output;
    assert.ok(bytesEqual(b, back));
  });

  it('binary → base64 → binary', () => {
    const b = encodeUtf8('BabelCodec');
    const b64 = convert(b, 'bytes', 'base64').output;
    const back = convert(b64, 'base64', 'bytes').output;
    assert.ok(bytesEqual(b, back));
  });

  it('UTF-8 → binary → UTF-8', () => {
    const t = 'Field test';
    const bytes = convert(t, 'text', 'bytes', { encoding: 'utf8' }).output;
    const bin = convert(bytes, 'bytes', 'binary').output;
    const backBytes = convert(bin, 'binary', 'bytes').output;
    const backText = convert(backBytes, 'bytes', 'text', { encoding: 'utf8' }).output;
    assert.equal(backText, t);
  });

  it('file-like: arbitrary → hex → reconstructed', () => {
    const file = new Uint8Array(512);
    for (let i = 0; i < 512; i++) file[i] = (i * 17 + 3) & 0xff;
    const hex = encodeHex(file);
    assert.ok(bytesEqual(file, decodeHex(hex)));
  });

  it('file-like: arbitrary → base64 → reconstructed', () => {
    const file = new Uint8Array(300);
    for (let i = 0; i < 300; i++) file[i] = i & 0xff;
    assert.ok(bytesEqual(file, decodeBase64(encodeBase64(file))));
  });
});

describe('inspector', () => {
  it('reports offsets and values', () => {
    const b = new Uint8Array([0x41, 0x00, 0x0a]);
    const ins = inspectBytes(b);
    assert.equal(ins.byteLength, 3);
    assert.equal(ins.rows[0].hex, '41');
    assert.equal(ins.rows[0].display, 'A');
    assert.equal(ins.rows[1].control, 'NUL');
    assert.equal(ins.rows[2].control, 'LF');
  });

  it('identifies UTF-8 sequences', () => {
    const b = encodeUtf8('A€');
    const ins = inspectBytes(b, { mode: 'utf8' });
    assert.equal(ins.utf8Valid, true);
    assert.ok(ins.rows.some((r) => r.utf8Char === '€'));
  });
});

describe('registry', () => {
  it('lists codecs', () => {
    const ids = listCodecs();
    for (const id of ['binary', 'hex', 'base64', 'ascii', 'utf8', 'decimal', 'octal', 'morse']) {
      assert.ok(ids.includes(id), `missing ${id}`);
    }
  });
});

describe('large input', () => {
  it('handles 64 KiB round-trip hex', () => {
    const big = new Uint8Array(65536);
    for (let i = 0; i < big.length; i++) big[i] = i & 0xff;
    assert.ok(bytesEqual(big, decodeHex(encodeHex(big))));
  });
});
