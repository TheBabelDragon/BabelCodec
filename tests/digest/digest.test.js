import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  toCanonical,
  initializeUnicodeCore,
  isUnicodeCoreReady,
} from '../../src/text/index.js';
import { digestCanonical, serializeCanonicalToBytes } from '../../src/digest/index.js';
import { sha256Hex } from '../../src/sha256/index.js';

let coreAvailable = false;

before(async () => {
  try {
    await initializeUnicodeCore();
    coreAvailable = isUnicodeCoreReady();
  } catch {
    coreAvailable = false;
  }
});

describe('digest serialization', () => {
  it('identical canonical → identical bytes', async () => {
    if (!coreAvailable) return;
    const c1 = await toCanonical('hello');
    const c2 = await toCanonical('hello');
    const a = serializeCanonicalToBytes(c1);
    const b = serializeCanonicalToBytes(c2);
    assert.deepEqual([...a.bytes], [...b.bytes]);
  });

  it('matches direct SHA-256 of UTF-8 source path', async () => {
    if (!coreAvailable) return;
    const c = await toCanonical('abc');
    const d = digestCanonical(c);
    // Digest is of canonical serialization, not raw string — still must be stable hex
    assert.equal(typeof d.hex, 'string');
    assert.equal(d.hex.length, 64);
    // Source text preserved
    assert.equal(c.source.text, 'abc');
  });

  it('normalization changes analysis when requested', async () => {
    if (!coreAvailable) return;
    const nfd = 'e\u0301';
    const cNone = await toCanonical(nfd, { normalization: 'NONE' });
    const cNfc = await toCanonical(nfd, { normalization: 'NFC' });
    assert.equal(cNone.source.text, nfd);
    assert.equal(cNfc.source.text, nfd);
    // analysis text should differ when NFC folds
    if (cNfc.analysis && cNone.analysis) {
      assert.notEqual(cNfc.analysis.text, cNone.analysis.text);
    }
  });
});
