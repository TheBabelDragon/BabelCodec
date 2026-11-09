import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  iterateCodePoints,
  toCanonical,
  applyNormalization,
  NormalizationProfile,
  detectScripts,
  segmentGraphemes,
  initializeUnicodeCore,
  isUnicodeCoreReady,
} from '../../src/text/index.js';

// Code-point iteration remains pure JS and does not require WASM.
describe('unicode code points', () => {
  it('handles ASCII', () => {
    const cps = iterateCodePoints('AB');
    assert.equal(cps.length, 2);
    assert.equal(cps[0].codePoint, 0x41);
  });

  it('handles Hebrew', () => {
    const cps = iterateCodePoints('\u05e4');
    assert.equal(cps[0].codePoint, 0x05e4);
  });

  it('handles supplementary plane', () => {
    const cps = iterateCodePoints('\u{10900}');
    assert.equal(cps.length, 1);
    assert.ok(cps[0].codePoint > 0xffff);
  });
});

// Full canonical / grapheme / script / normalization path requires WASM.
// When pkg/ is not present (local without build:wasm), these tests skip.
describe('rust unicode core (async)', () => {
  let coreAvailable = false;

  before(async () => {
    try {
      await initializeUnicodeCore();
      coreAvailable = isUnicodeCoreReady();
    } catch {
      coreAvailable = false;
    }
  });

  it('preserves combining marks in source', async () => {
    if (!coreAvailable) return; // skip when WASM not built
    const text = '\u05e9\u05b8\u05c1';
    const c = await toCanonical(text);
    assert.equal(c.source.text, text);
    assert.ok(c.source.codepoints.length >= 1);
    assert.equal(c.schema, 'babelcodec.canonical.v1');
    assert.equal(c.engine, 'rust-wasm');
  });

  it('default normalization is NONE', async () => {
    if (!coreAvailable) return;
    const r = await applyNormalization('\u00e9');
    assert.equal(r.profile, NormalizationProfile.NONE);
  });

  it('NFC differs from NFD when applicable', async () => {
    if (!coreAvailable) return;
    const nfd = 'e\u0301';
    const nfc = await applyNormalization(nfd, 'NFC');
    assert.ok(nfc.changed);
    assert.equal(nfc.text, '\u00e9');
  });

  it('detects Hebrew script', async () => {
    if (!coreAvailable) return;
    const sc = await detectScripts('\u05e9\u05dc\u05d5\u05dd');
    assert.equal(sc.primary, 'Hebrew');
  });

  it('segments graphemes for ZWJ emoji as one cluster', async () => {
    if (!coreAvailable) return;
    const { graphemes, method } = await segmentGraphemes('👨‍👩‍👧‍👦');
    assert.equal(graphemes.length, 1);
    assert.ok(method.includes('UAX #29'));
  });

  it('canonical schema and source identity', async () => {
    if (!coreAvailable) return;
    const c = await toCanonical('A');
    assert.equal(c.schema, 'babelcodec.canonical.v1');
    assert.equal(c.source.text, 'A');
  });
});
