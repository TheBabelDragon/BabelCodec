import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  iterateCodePoints,
  toCanonical,
  applyNormalization,
  NormalizationProfile,
  detectScripts,
} from '../../src/text/index.js';

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

  it('preserves combining marks in source', () => {
    const text = '\u05e9\u05b8\u05c1';
    const c = toCanonical(text);
    assert.equal(c.source.text, text);
    assert.ok(c.source.codepoints.length >= 1);
  });
});

describe('normalization', () => {
  it('default is NONE', () => {
    const r = applyNormalization('\u00e9');
    assert.equal(r.profile, NormalizationProfile.NONE);
  });

  it('NFC differs from NFD when applicable', () => {
    const nfd = 'e\u0301';
    const nfc = applyNormalization(nfd, 'NFC');
    assert.ok(nfc.changed);
  });
});

describe('script detection', () => {
  it('detects Hebrew', () => {
    assert.equal(detectScripts('\u05e9\u05dc\u05d5\u05dd').primary, 'Hebrew');
  });
});

describe('canonical', () => {
  it('schema and deterministic serialize', () => {
    const c = toCanonical('A');
    assert.equal(c.schema, 'babelcodec.canonical.v1');
    assert.equal(c.source.text, 'A');
  });
});
