/**
 * HEIF / HEIC structural and decoder adapter tests.
 * Pure Node — no network, no WASM required for structural suite.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasFtypSignature,
  classifyHeif,
  extensionSuggestsHeif,
  inspectContainer,
  inspectHEIFSync,
  decodeHEIF,
  walkBoxes,
  parseBoxHeader,
  parseFtyp,
  DEFAULT_MAX_BYTES,
  setHeifDecoderBackend,
  getHeifDecoderBackend,
  exportFilename,
  canEncode,
} from '../../src/media/heif/index.js';

/** Minimal synthetic ftyp+meta skeleton (not a valid image, but valid ISOBMFF header). */
function makeMinimalHeic() {
  // ftyp: size=24, major=heic, minor=0, compatible=mif1 heic
  const parts = [];
  // ftyp box
  const ftypPayload = new Uint8Array([
    // major brand 'heic'
    0x68, 0x65, 0x69, 0x63,
    // minor version 0
    0, 0, 0, 0,
    // compatible: mif1
    0x6d, 0x69, 0x66, 0x31,
    // compatible: heic
    0x68, 0x65, 0x69, 0x63,
  ]);
  const ftypSize = 8 + ftypPayload.length;
  const ftyp = new Uint8Array(ftypSize);
  ftyp[0] = 0; ftyp[1] = 0; ftyp[2] = 0; ftyp[3] = ftypSize;
  ftyp[4] = 0x66; ftyp[5] = 0x74; ftyp[6] = 0x79; ftyp[7] = 0x70;
  ftyp.set(ftypPayload, 8);

  // free box (padding)
  const free = new Uint8Array([0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65]);

  const out = new Uint8Array(ftyp.length + free.length);
  out.set(ftyp, 0);
  out.set(free, ftyp.length);
  return out;
}

function makeAvifFtyp() {
  const payload = new Uint8Array([
    0x61, 0x76, 0x69, 0x66, // avif
    0, 0, 0, 0,
    0x6d, 0x69, 0x66, 0x31, // mif1
  ]);
  const size = 8 + payload.length;
  const box = new Uint8Array(size);
  box[3] = size;
  box[4] = 0x66; box[5] = 0x74; box[6] = 0x79; box[7] = 0x70;
  box.set(payload, 8);
  return box;
}

describe('HEIF detection', () => {
  it('rejects empty input', () => {
    assert.equal(hasFtypSignature(new Uint8Array(0)), false);
    const c = classifyHeif(new Uint8Array(0));
    assert.equal(c.isIsobmff, false);
  });

  it('rejects invalid signature', () => {
    const junk = new Uint8Array([0, 0, 0, 8, 0x6a, 0x75, 0x6e, 0x6b]);
    assert.equal(hasFtypSignature(junk), false);
  });

  it('accepts minimal HEIC ftyp', () => {
    const bytes = makeMinimalHeic();
    assert.equal(hasFtypSignature(bytes), true);
    const c = classifyHeif(bytes);
    assert.equal(c.isIsobmff, true);
    assert.equal(c.isHeic, true);
    assert.equal(c.hevcBrand, true);
    assert.equal(c.majorBrand, 'heic');
    assert.ok(c.compatibleBrands.includes('mif1'));
  });

  it('classifies AVIF brands', () => {
    const bytes = makeAvifFtyp();
    const c = classifyHeif(bytes);
    assert.equal(c.isIsobmff, true);
    assert.equal(c.isAvif, true);
    assert.equal(c.hevcBrand, false);
  });

  it('extensionSuggestsHeif is hint-only', () => {
    assert.equal(extensionSuggestsHeif('photo.HEIC'), true);
    assert.equal(extensionSuggestsHeif('photo.heif'), true);
    assert.equal(extensionSuggestsHeif('photo.jpg'), false);
    assert.equal(extensionSuggestsHeif(''), false);
  });
});

describe('Box parser', () => {
  it('parses ftyp header and payload', () => {
    const bytes = makeMinimalHeic();
    const header = parseBoxHeader(bytes, 0, bytes.length);
    assert.ok(header);
    assert.equal(header.type, 'ftyp');
    const ftyp = parseFtyp(bytes, header);
    assert.equal(ftyp.majorBrand, 'heic');
  });

  it('walks top-level boxes', () => {
    const bytes = makeMinimalHeic();
    const boxes = walkBoxes(bytes, 0, bytes.length, { recursive: false });
    assert.ok(boxes.length >= 1);
    assert.equal(boxes[0].type, 'ftyp');
  });

  it('handles truncated buffer without throwing', () => {
    const bytes = makeMinimalHeic().subarray(0, 10);
    const boxes = walkBoxes(bytes, 0, bytes.length, { recursive: true });
    assert.ok(Array.isArray(boxes));
  });

  it('handles malformed size=0 carefully', () => {
    // size=0 means to-end
    const bytes = new Uint8Array([
      0, 0, 0, 0, // size 0
      0x66, 0x74, 0x79, 0x70,
      0x68, 0x65, 0x69, 0x63,
      0, 0, 0, 0,
    ]);
    const header = parseBoxHeader(bytes, 0, bytes.length);
    assert.ok(header);
    assert.equal(header.toEnd, true);
  });
});

describe('inspectContainer / inspectHEIFSync', () => {
  it('returns structure for minimal HEIC', () => {
    const bytes = makeMinimalHeic();
    const r = inspectContainer(bytes);
    assert.equal(r.classification.isHeic, true);
    assert.ok(r.flat.length >= 1);
    assert.equal(r.flat[0].type, 'ftyp');
  });

  it('inspectHEIFSync on empty', () => {
    const r = inspectHEIFSync(new Uint8Array(0));
    assert.equal(r.ok, false);
  });

  it('inspectHEIFSync on valid skeleton', () => {
    const r = inspectHEIFSync(makeMinimalHeic());
    assert.equal(r.ok, true);
    assert.equal(r.classification.isHeic, true);
  });
});

describe('decodeHEIF (structural path)', () => {
  it('errors on empty', async () => {
    const r = await decodeHEIF(new Uint8Array(0));
    assert.equal(r.ok, false);
    assert.equal(r.status, 'error');
  });

  it('errors on junk', async () => {
    const r = await decodeHEIF(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    assert.equal(r.ok, false);
  });

  it('structural_only for minimal HEIC without backend', async () => {
    const r = await decodeHEIF(makeMinimalHeic());
    assert.equal(r.ok, true);
    assert.equal(r.status, 'structural_only');
    assert.equal(r.codec, 'hevc');
    assert.ok(r.sourceBytes.length > 0);
  });

  it('marks AVIF as unsupported codec for HEVC path', async () => {
    const r = await decodeHEIF(makeAvifFtyp());
    assert.equal(r.status, 'unsupported');
    assert.equal(r.codec, 'av1');
  });

  it('enforces maxBytes', async () => {
    const big = new Uint8Array(100);
    big.set(makeMinimalHeic());
    const r = await decodeHEIF(big, { maxBytes: 20 });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /size limit/i.test(e)));
  });

  it('preserves sourceBytes reference for binary integration', async () => {
    const bytes = makeMinimalHeic();
    const r = await decodeHEIF(bytes);
    assert.equal(r.sourceBytes, bytes);
  });
});

describe('decodeHEIF with mock backend', () => {
  it('uses registered backend for pixel path', async () => {
    const prev = getHeifDecoderBackend();
    setHeifDecoderBackend({
      async decode() {
        const rgba = new Uint8ClampedArray(2 * 2 * 4);
        rgba.fill(255);
        return {
          images: [{ width: 2, height: 2, rgba, isPrimary: true }],
          codec: 'hevc',
          warnings: ['mock'],
        };
      },
    });
    try {
      const r = await decodeHEIF(makeMinimalHeic());
      assert.equal(r.status, 'decoded');
      assert.equal(r.imageCount, 1);
      assert.equal(r.images[0].width, 2);
      assert.ok(r.images[0].rgba);
      assert.ok(r.warnings.some((w) => w === 'mock'));
    } finally {
      setHeifDecoderBackend(prev);
    }
  });

  it('falls back when backend throws', async () => {
    const prev = getHeifDecoderBackend();
    setHeifDecoderBackend({
      async decode() {
        throw new Error('backend boom');
      },
    });
    try {
      const r = await decodeHEIF(makeMinimalHeic());
      assert.equal(r.status, 'structural_only');
      assert.ok(r.errors.some((e) => /backend boom/i.test(e)));
    } finally {
      setHeifDecoderBackend(prev);
    }
  });
});

describe('export helpers', () => {
  it('exportFilename strips heic extension', () => {
    assert.equal(exportFilename('Photo.HEIC', 'png'), 'Photo.png');
    assert.equal(exportFilename('a.heif', 'jpeg'), 'a.jpeg');
  });

  it('canEncode is boolean in Node', () => {
    assert.equal(typeof canEncode('image/png'), 'boolean');
  });
});

describe('DEFAULT_MAX_BYTES', () => {
  it('is positive', () => {
    assert.ok(DEFAULT_MAX_BYTES > 0);
  });
});
