import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectInput } from '../../src/media/detection/index.js';
import { encodeBase64 } from '../../src/core/base64.js';
import { isValidBase64Token, scanBase64Tokens } from '../../src/media/detection/text.js';

describe('exact-span nested Base64', () => {
  it('decodes only the embedded token, not surrounding text', async () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const token = encodeBase64(png);
    const payload = `HEAD ${token} TAIL`;
    const r = await detectInput(payload, { decodeNested: true });
    const b64 = r.findings.find((f) => f.subtype === 'base64');
    assert.ok(b64);
    assert.equal(b64.source_token, token);
    assert.ok(b64.char_start != null);
    const nested = r.findings.find((f) => f.subtype === 'png' && f.parent_finding_id);
    assert.ok(nested, 'nested PNG from exact token');
    assert.ok(nested.evidence.includes('decoded-coordinate-space'));
  });

  it('handles padding = and ==', () => {
    assert.equal(isValidBase64Token('SGk='), true);
    assert.equal(isValidBase64Token('SA=='), true);
    const hits = scanBase64Tokens('prefix SGk= middle SA== end');
    assert.ok(hits.some((h) => h.token === 'SGk='));
    assert.ok(hits.some((h) => h.token === 'SA=='));
  });

  it('rejects invalid padding', () => {
    assert.equal(isValidBase64Token('SGk==='), false);
    assert.equal(isValidBase64Token('SG=k'), false);
  });

  it('reports originalByteLength when truncated', async () => {
    const big = new Uint8Array(1000);
    const r = await detectInput(big, { limits: { maxBytes: 100 } });
    assert.equal(r.truncated, true);
    assert.equal(r.originalByteLength, 1000);
    assert.equal(r.scannedByteLength, 100);
  });
});
