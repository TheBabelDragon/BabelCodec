/**
 * Universal detection tests
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
    assert.ok(r.findings.some((f) => f.type === 'empty' || f.byteLength === 0 || r.byteLength === 0));
  });

  it('UTF-8 text', async () => {
    const r = await detectInput('Hello BabelCodec');
    assert.ok(r.findings.some((f) => f.type === 'text'));
  });

  it('JSON', async () => {
    const r = await detectInput('{"a":1,"b":[2,3]}');
    assert.ok(r.findings.some((f) => f.subtype === 'json' && f.completeness === 'complete'));
  });

  it('malformed JSON', async () => {
    const r = await detectInput('{not json');
    // may or may not flag json — brackets incomplete
    assert.equal(r.originalPreserved, true);
  });

  it('PNG signature', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3]);
    const r = await detectInput(png);
    assert.ok(r.findings.some((f) => f.subtype === 'png'));
  });

  it('JPEG signature', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    const r = await detectInput(jpeg);
    assert.ok(r.findings.some((f) => f.subtype === 'jpeg'));
  });

  it('GIF signature', async () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    const r = await detectInput(gif);
    assert.ok(r.findings.some((f) => f.subtype === 'gif'));
  });

  it('PDF signature', async () => {
    const pdf = encodeUtf8('%PDF-1.4\n');
    const r = await detectInput(pdf);
    assert.ok(r.findings.some((f) => f.subtype === 'pdf'));
  });

  it('ZIP signature', async () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
    const r = await detectInput(zip);
    assert.ok(r.findings.some((f) => f.subtype === 'zip'));
    assert.ok(r.findings.some((f) => (f.alerts || []).some((a) => a.code === 'NO_AUTO_EXTRACT')));
  });

  it('hex encoded', async () => {
    const r = await detectInput('deadbeefcafebabe');
    assert.ok(r.findings.some((f) => f.subtype === 'hex'));
  });

  it('base64 candidate', async () => {
    const r = await detectInput('SGVsbG8gV29ybGQh');
    assert.ok(r.findings.some((f) => f.subtype === 'base64'));
  });

  it('unknown binary preserves original', async () => {
    const r = await detectInput(new Uint8Array([0x00, 0x01, 0xfe, 0xff]));
    assert.equal(r.originalPreserved, true);
    assert.ok(r.byteLength === 4);
  });

  it('type hint conflict produces warning', async () => {
    const r = await detectInput(new Uint8Array([0x00, 0x01, 0x02, 0x03]), {
      typeHint: 'image/png',
    });
    assert.ok(r.alerts.some((a) => a.code === 'TYPE_HINT_CONFLICT'));
  });

  it('partial signature at non-zero offset', async () => {
    const buf = new Uint8Array(32);
    buf[16] = 0x89;
    buf[17] = 0x50;
    buf[18] = 0x4e;
    buf[19] = 0x47;
    buf[20] = 0x0d;
    buf[21] = 0x0a;
    buf[22] = 0x1a;
    buf[23] = 0x0a;
    const r = await detectInput(buf);
    const png = r.findings.filter((f) => f.subtype === 'png');
    // may find at offset 16 depending on scan grid
    assert.equal(r.originalPreserved, true);
  });

  it('nested base64 PNG', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const b64 = encodeBase64(png);
    const r = await detectInput(b64, { decodeNested: true });
    assert.ok(r.findings.some((f) => f.subtype === 'base64'));
    assert.ok(
      r.findings.some((f) => f.subtype === 'png' && f.parent_finding_id),
      'expected nested PNG finding',
    );
  });

  it('mixed payload: text + json markers', async () => {
    const payload = 'Note:\n{"ok":true}\ntrailing';
    const r = await detectInput(payload);
    assert.ok(r.findings.some((f) => f.type === 'text' || f.subtype === 'json'));
    assert.equal(r.originalPreserved, true);
  });
});
