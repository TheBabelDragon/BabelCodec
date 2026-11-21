import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectInput } from '../../src/media/detection/index.js';
import {
  isValidBase64Token,
  isStrongWholeInputBase64,
  isStrongEmbeddedBase64Candidate,
  hasCanonicalPadBits,
  probeEncodedForms,
} from '../../src/media/detection/text.js';

describe('whole-input Base64 ambiguity', () => {
  for (const word of ['HEAD', 'TAIL', 'TEST', 'DATA']) {
    it(`probeEncodedForms does not emit Base64 for ${word}`, () => {
      const findings = probeEncodedForms(word, word.length);
      assert.ok(
        !findings.some((f) => f.subtype === 'base64' && f.completeness === 'complete'),
      );
    });

    it(`detectInput does not classify ${word} as Base64`, async () => {
      assert.equal(isStrongWholeInputBase64(word), false);
      const r = await detectInput(word);
      assert.ok(
        !r.findings.some((f) => f.subtype === 'base64' && f.completeness === 'complete'),
      );
      assert.ok(r.findings.some((f) => f.type === 'text'));
    });
  }

  it('accepts short padded whole-input tokens', async () => {
    assert.equal(isStrongWholeInputBase64('SGk='), true);
    assert.equal(isStrongWholeInputBase64('SA=='), true);
    const findings = probeEncodedForms('SGk=', 4);
    assert.ok(findings.some((f) => f.subtype === 'base64' && f.completeness === 'complete'));
    const r = await detectInput('SGk=');
    assert.ok(r.findings.some((f) => f.subtype === 'base64'));
  });
});

describe('canonical Base64 pad bits', () => {
  it('accepts canonical SGk= and SA==', () => {
    assert.equal(isValidBase64Token('SGk='), true);
    assert.equal(isValidBase64Token('SA=='), true);
    assert.equal(hasCanonicalPadBits('SGk='), true);
    assert.equal(hasCanonicalPadBits('SA=='), true);
  });

  it('rejects nonzero unused pad bits (AB==, AAB=)', () => {
    // B is index 1 → low bits set for == case
    assert.equal(hasCanonicalPadBits('AB=='), false);
    assert.equal(isValidBase64Token('AB=='), false);
    // B is index 1 → low 2 bits set for = case
    assert.equal(hasCanonicalPadBits('AAB='), false);
    assert.equal(isValidBase64Token('AAB='), false);
  });

  it('probeEncodedForms marks noncanonical as malformed', () => {
    const findings = probeEncodedForms('AB==', 4);
    const f = findings.find((x) => x.subtype === 'base64');
    assert.ok(f);
    assert.equal(f.completeness, 'malformed');
  });

  it('rejects Base64url alphabet', () => {
    assert.equal(isValidBase64Token('ab-c'), false);
    assert.equal(isValidBase64Token('ab_c'), false);
  });

  it('rejects excess padding', () => {
    assert.equal(isValidBase64Token('SGk==='), false);
  });
});

describe('embedded policy remains separate', () => {
  it('HEAD is not a strong embedded candidate', () => {
    assert.equal(isStrongEmbeddedBase64Candidate('HEAD'), false);
  });
});
