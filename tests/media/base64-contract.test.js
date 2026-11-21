import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectInput } from '../../src/media/detection/index.js';
import {
  isValidBase64Token,
  isStrongWholeInputBase64,
  isStrongEmbeddedBase64Candidate,
  hasCanonicalPadBits,
} from '../../src/media/detection/text.js';

describe('whole-input Base64 ambiguity', () => {
  for (const word of ['HEAD', 'TAIL', 'TEST', 'DATA']) {
    it(`does not classify ${word} as Base64`, async () => {
      assert.equal(isStrongWholeInputBase64(word), false);
      const r = await detectInput(word);
      assert.ok(
        !r.findings.some((f) => f.subtype === 'base64' && f.completeness === 'complete'),
        `${word} must not be complete Base64`,
      );
    });
  }

  it('accepts short padded whole-input tokens', async () => {
    assert.equal(isStrongWholeInputBase64('SGk='), true);
    assert.equal(isStrongWholeInputBase64('SA=='), true);
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
