/**
 * Validate live detectInput() results against the public JSON Schema shape
 * without a heavyweight dependency — structural checks of required fields.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { detectInput } from '../../src/media/detection/index.js';
import { encodeBase64 } from '../../src/core/base64.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, '../../schemas/media/detection-result.v1.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

function assertDetectionShape(r) {
  assert.equal(r.schema, 'babelcodec.detection.v1');
  assert.equal(typeof r.byteLength, 'number');
  assert.equal(typeof r.originalPreserved, 'boolean');
  assert.ok(Array.isArray(r.findings));
  assert.ok(Array.isArray(r.alerts));
  assert.ok('originalByteLength' in r);
  assert.ok('scannedByteLength' in r);
  assert.ok('truncated' in r);
  assert.ok('workUnitsUsed' in r);
  assert.ok(r.limits && typeof r.limits === 'object');

  for (const f of r.findings) {
    assert.ok(f.finding_id);
    assert.ok(typeof f.type === 'string');
    assert.ok(typeof f.confidence === 'number');
    assert.ok(typeof f.offset === 'number');
    assert.ok(typeof f.length === 'number');
    assert.ok(typeof f.completeness === 'string');
  }

  // Schema documents these properties
  assert.ok(schema.properties.originalByteLength);
  assert.ok(schema.properties.scannedByteLength);
  assert.ok(schema.$defs.finding.properties.source_token);
  assert.ok(schema.$defs.finding.properties.char_start);
  assert.ok(schema.$defs.finding.properties.parent_offset);
}

describe('detection result schema vs live output', () => {
  it('ordinary text', async () => {
    assertDetectionShape(await detectInput('hello world'));
  });

  it('valid whole-input Base64', async () => {
    assertDetectionShape(await detectInput('SGk='));
  });

  it('embedded Base64 PNG with nested relationship fields', async () => {
    const png = new Uint8Array(32);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const token = encodeBase64(png);
    const r = await detectInput(`HEAD ${token} TAIL`, { decodeNested: true });
    assertDetectionShape(r);
    const b64 = r.findings.find((f) => f.subtype === 'base64' && f.source_token === token);
    assert.ok(b64);
    assert.ok(typeof b64.char_start === 'number');
    const nested = r.findings.find((f) => f.parent_finding_id === b64.finding_id);
    assert.ok(nested);
    assert.ok(nested.evidence.includes('decoded-coordinate-space'));
  });

  it('truncated binary', async () => {
    const r = await detectInput(new Uint8Array(500), { limits: { maxBytes: 50 } });
    assertDetectionShape(r);
    assert.equal(r.truncated, true);
    assert.equal(r.originalByteLength, 500);
    assert.equal(r.scannedByteLength, 50);
  });
});
