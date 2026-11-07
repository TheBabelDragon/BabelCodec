import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toCanonical } from '../../src/text/index.js';
import { digestCanonical, serializeCanonicalToBytes } from '../../src/digest/index.js';
import { sha256Hex } from '../../src/sha256/index.js';

describe('digest serialization', () => {
  it('identical canonical → identical bytes', () => {
    const c1 = toCanonical('hello');
    const c2 = toCanonical('hello');
    const a = serializeCanonicalToBytes(c1);
    const b = serializeCanonicalToBytes(c2);
    assert.deepEqual([...a.bytes], [...b.bytes]);
  });

  it('matches direct SHA-256 of UTF-8', () => {
    const c = toCanonical('abc');
    const d = digestCanonical(c);
    assert.equal(d.hex, sha256Hex('abc'));
  });

  it('normalization changes bytes when requested', () => {
    const nfd = 'e\u0301';
    const c = toCanonical(nfd);
    const raw = serializeCanonicalToBytes(c, { normalization: 'NONE' });
    const nfc = serializeCanonicalToBytes(c, { normalization: 'NFC' });
    assert.notDeepEqual([...raw.bytes], [...nfc.bytes]);
  });
});
