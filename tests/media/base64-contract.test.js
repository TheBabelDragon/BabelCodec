import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectInput } from '../../src/media/detection/index.js';
import {
  isValidBase64Token,
  isStrongWholeInputBase64,
  isStrongEmbeddedBase64Candidate,
  hasCanonicalPadBits,
  probeEncodedForms,
  scanBase64Tokens,
} from '../../src/media/detection/text.js';

describe('canonical Base64 vectors', () => {
  const valid = ['SGk=', 'SA==', 'SGk', 'SA'];
  const invalid = ['AB==', 'AAB=', 'AB', 'AAB', 'SGk===', 'SG=k', '-___'];

  for (const t of valid) {
    it(`valid: ${t}`, () => {
      assert.equal(isValidBase64Token(t), true, t);
      assert.equal(hasCanonicalPadBits(t), true, t);
    });
  }

  for (const t of invalid) {
    it(`invalid: ${t}`, () => {
      assert.equal(isValidBase64Token(t), false, t);
    });
  }

  it('noncanonical does not become nested decode candidate', async () => {
    const r = await detectInput('AB==', { decodeNested: true });
    const complete = r.findings.filter((f) => f.subtype === 'base64' && f.completeness === 'complete');
    assert.equal(complete.length, 0);
  });
});

describe('whole-input false positives', () => {
  for (const word of ['HEAD', 'TAIL', 'TEST', 'DATA']) {
    it(`probeEncodedForms: no complete Base64 for ${word}`, () => {
      const findings = probeEncodedForms(word, word.length);
      assert.ok(!findings.some((f) => f.subtype === 'base64' && f.completeness === 'complete'));
    });

    it(`detectInput: no complete Base64 for ${word}`, async () => {
      assert.equal(isStrongWholeInputBase64(word), false);
      const r = await detectInput(word);
      assert.ok(!r.findings.some((f) => f.subtype === 'base64' && f.completeness === 'complete'));
    });
  }

  it('scanBase64Tokens ignores ordinary words', () => {
    assert.equal(scanBase64Tokens('HEAD TAIL TEST DATA').length, 0);
  });

  it('padded short tokens remain valid', () => {
    assert.equal(isStrongWholeInputBase64('SGk='), true);
    assert.equal(isStrongEmbeddedBase64Candidate('SGk='), true);
  });
});
