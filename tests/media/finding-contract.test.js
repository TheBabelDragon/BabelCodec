import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFinding } from '../../src/media/detection/finding.js';
import { detectInput } from '../../src/media/detection/index.js';
import { encodeBase64 } from '../../src/core/base64.js';

describe('createFinding contract', () => {
  it('preserves source_token, char_start, char_end', () => {
    const f = createFinding({
      type: 'encoded',
      subtype: 'base64',
      source_token: 'SGk=',
      char_start: 3,
      char_end: 7,
      offset: 3,
      length: 4,
    });
    assert.equal(f.source_token, 'SGk=');
    assert.equal(f.char_start, 3);
    assert.equal(f.char_end, 7);
  });

  it('drops negative or non-integer offsets', () => {
    const f = createFinding({
      type: 'encoded',
      char_start: -1,
      char_end: 1.5,
      source_token: 'ab',
    });
    assert.equal(f.source_token, 'ab');
    assert.equal(f.char_start, undefined);
    assert.equal(f.char_end, undefined);
  });

  it('detectInput retains span fields on embedded base64', async () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const token = encodeBase64(png);
    const payload = `HEAD ${token} TAIL`;
    const r = await detectInput(payload, { decodeNested: true });
    const b64 = r.findings.find((f) => f.subtype === 'base64');
    assert.ok(b64);
    assert.equal(b64.source_token, token);
    assert.equal(typeof b64.char_start, 'number');
    assert.equal(typeof b64.char_end, 'number');
    assert.ok(b64.char_end > b64.char_start);
    const nested = r.findings.find((f) => f.subtype === 'png' && f.parent_finding_id);
    assert.ok(nested);
  });
});
