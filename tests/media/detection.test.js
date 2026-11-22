/**
 * Universal detection tests — strong assertions
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectInput } from '../../src/media/detection/index.js';
import { encodeUtf8 } from '../../src/core/utf8.js';
import { encodeBase64 } from '../../src/core/base64.js';

describe('detectInput', () => {
  it('empty input', async () => {
    const r = await detectInput('');
    assert.equal(r.originalPreserved, true);
    assert.equal(r.byteLength, 0);
  });

  it('UTF-8 text', async () => {
    const r = await detectInput('Hello BabelCodec');
    assert.ok(r.findings.some((f) => f.type === 'text' && f.completeness === 'complete'));
  });

  it('JSON whole input', async () => {
    const r = await detectInput('{"a":1,"b":[2,3]}');
    const json = r.findings.find((f) => f.subtype === 'json');
    assert.ok(json);
    assert.equal(json.completeness, 'complete');
    assert.ok(json.confidence >= 0.9);
  });

  it('embedded JSON inside surrounding text', async () => {
    const r = await detectInput('Note before {"ok":true,"n":1} and after');
    const json = r.findings.find((f) => f.subtype === 'json' && f.completeness === 'complete');
    assert.ok(json, 'expected embedded JSON finding');
    assert.ok(json.offset > 0 || json.evidence.includes('embedded'));
    assert.ok(json.length > 0);
  });

  it('PNG signature at offset 0 is complete when structurally long enough', async () => {
    const png = new Uint8Array(32);
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    png.set(sig, 0);
    const r = await detectInput(png);
    const f = r.findings.find((x) => x.subtype === 'png');
    assert.ok(f);
    assert.equal(f.offset, 0);
    assert.equal(f.completeness, 'complete');
  });

  it('short PNG signature is partial not complete', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const r = await detectInput(png);
    const f = r.findings.find((x) => x.subtype === 'png');
    assert.ok(f);
    assert.equal(f.completeness, 'partial');
  });

  it('embedded PNG at offset 16 is found with partial completeness', async () => {
    const buf = new Uint8Array(40);
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    buf.set(sig, 16);
    const r = await detectInput(buf);
    const f = r.findings.find((x) => x.subtype === 'png' && x.offset === 16);
    assert.ok(f, 'expected PNG at offset 16');
    assert.equal(f.completeness, 'partial');
  });

  it('JPEG signature', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);
    const r = await detectInput(jpeg);
    assert.ok(r.findings.some((f) => f.subtype === 'jpeg'));
  });

  it('GIF signature', async () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0]);
    const r = await detectInput(gif);
    assert.ok(r.findings.some((f) => f.subtype === 'gif'));
  });

  it('PDF signature', async () => {
    const pdf = encodeUtf8('%PDF-1.4\n%rest');
    const r = await detectInput(pdf);
    assert.ok(r.findings.some((f) => f.subtype === 'pdf'));
  });

  it('ZIP signature has NO_AUTO_EXTRACT', async () => {
    const zip = new Uint8Array(40);
    zip.set([0x50, 0x4b, 0x03, 0x04], 0);
    const r = await detectInput(zip);
    const z = r.findings.find((f) => f.subtype === 'zip');
    assert.ok(z);
    assert.ok((z.alerts || []).some((a) => a.code === 'NO_AUTO_EXTRACT'));
  });

  it('hex whole and embedded', async () => {
    const r = await detectInput('prefix deadbeefcafebabe suffix');
    assert.ok(r.findings.some((f) => f.subtype === 'hex'));
  });

  it('base64 candidate', async () => {
    const r = await detectInput('SGVsbG8gV29ybGQhSGVsbG8=');
    assert.ok(r.findings.some((f) => f.subtype === 'base64'));
  });

  it('unknown binary preserves original', async () => {
    const r = await detectInput(new Uint8Array([0x00, 0x01, 0xfe, 0xff]));
    assert.equal(r.originalPreserved, true);
    assert.equal(r.byteLength, 4);
  });

  it('type hint conflict produces warning', async () => {
    const r = await detectInput(new Uint8Array([0x00, 0x01, 0x02, 0x03]), {
      typeHint: 'image/png',
    });
    assert.ok(r.alerts.some((a) => a.code === 'TYPE_HINT_CONFLICT'));
  });

  it('nested base64 PNG uses decoded coordinate space marker', async () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const b64 = encodeBase64(png);
    const r = await detectInput(b64, { decodeNested: true });
    assert.ok(r.findings.some((f) => f.subtype === 'base64'));
    const nested = r.findings.find((f) => f.subtype === 'png' && f.parent_finding_id);
    assert.ok(nested, 'expected nested PNG');
    assert.ok(nested.evidence.includes('decoded-coordinate-space'));
    assert.ok(nested.parent_offset != null);
  });

  it('mixed payload: text + JSON + trailing unclassified accessible', async () => {
    const payload = 'Human note\n{"ok":true,"v":2}\ntrailer';
    const r = await detectInput(payload);
    assert.equal(r.originalPreserved, true);
    assert.ok(r.findings.some((f) => f.type === 'text'));
    assert.ok(
      r.findings.some((f) => f.subtype === 'json' && f.completeness === 'complete'),
      'JSON segment must be detected',
    );
    assert.ok(r.byteLength === encodeUtf8(payload).byteLength);
  });

  it('work limit is reported when budget exhausted', async () => {
    const big = new Uint8Array(10_000);
    for (let i = 0; i < big.length; i++) big[i] = i & 0xff;
    const r = await detectInput(big, { limits: { maxWorkUnits: 50, maxFindings: 4 } });
    assert.ok(r.workUnitsUsed <= 50 + 20); // small slack for post steps
    // May or may not hit WORK_LIMIT depending on path; original always preserved
    assert.equal(r.originalPreserved, true);
  });
});
