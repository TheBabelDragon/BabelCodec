import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectInput } from '../../src/media/detection/index.js';
import { encodeBase64 } from '../../src/core/base64.js';

describe('shared work budget', () => {
  it('tiny work budget yields incomplete analysis and WORK_LIMIT', async () => {
    const r = await detectInput('hello world JSON {"a":1}', {
      limits: { maxWorkUnits: 1 },
    });
    assert.equal(r.analysisComplete, false);
    assert.ok(r.workUnitsUsed <= r.workUnitsLimit);
    assert.ok(
      r.alerts.some((a) => a.code === 'WORK_LIMIT') || r.stoppedReason === 'WORK_LIMIT',
    );
  });

  it('does not exceed configured maxWorkUnits', async () => {
    const r = await detectInput(new Uint8Array(200), {
      limits: { maxWorkUnits: 10, maxBytes: 200 },
    });
    assert.ok(r.workUnitsUsed <= 10);
  });

  it('binary scan respects tiny budget', async () => {
    const buf = new Uint8Array(500);
    buf[100] = 0x89;
    buf[101] = 0x50;
    buf[102] = 0x4e;
    buf[103] = 0x47;
    const r = await detectInput(buf, { limits: { maxWorkUnits: 5, maxBytes: 500 } });
    assert.ok(r.workUnitsUsed <= 5);
    assert.equal(r.analysisComplete, false);
  });
});

describe('aggregate nested decode budget', () => {
  it('aggregate nestedDecodedBytes never exceeds configured limit', async () => {
    const chunk = new Uint8Array(64);
    chunk.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const t1 = encodeBase64(chunk);
    const t2 = encodeBase64(chunk);
    const t3 = encodeBase64(chunk);
    const payload = `A ${t1} B ${t2} C ${t3}`;
    const limit = 80;
    const r = await detectInput(payload, {
      decodeNested: true,
      limits: { maxNestedDecodeBytes: limit, maxWorkUnits: 50_000 },
    });
    assert.ok(
      r.nestedDecodedBytes <= limit,
      `nestedDecodedBytes ${r.nestedDecodedBytes} exceeds limit ${limit}`,
    );
  });
});

describe('bounded UTF-8 string acquisition', () => {
  it('truncates large ASCII string without claiming full acquisition', async () => {
    const s = 'a'.repeat(500);
    const r = await detectInput(s, { limits: { maxBytes: 50 } });
    assert.equal(r.truncated, true);
    // Exact original UTF-8 length is unknown without scanning the remainder.
    assert.equal(r.originalByteLength, null);
    assert.equal(r.originalByteLengthExact, false);
    assert.equal(r.acquiredByteLength, 50);
    assert.ok(r.originalByteLengthAtLeast > r.acquiredByteLength);
    assert.equal(r.byteLength, 50);
  });

  it('handles multibyte boundary without invalid trailing UTF-8', async () => {
    const s = 'é'.repeat(20);
    const r = await detectInput(s, { limits: { maxBytes: 5 } });
    assert.equal(r.truncated, true);
    assert.ok(r.acquiredByteLength <= 5);
    assert.equal(r.originalByteLengthExact, false);
    assert.equal(r.originalByteLength, null);
  });

  it('exact-limit ASCII string reports exact original length', async () => {
    const s = 'b'.repeat(40);
    const r = await detectInput(s, { limits: { maxBytes: 40 } });
    assert.equal(r.truncated, false);
    assert.equal(r.originalByteLengthExact, true);
    assert.equal(r.originalByteLength, 40);
    assert.equal(r.acquiredByteLength, 40);
  });

  it('one-byte-over limit truncates with unknown exact original', async () => {
    const s = 'c'.repeat(41);
    const r = await detectInput(s, { limits: { maxBytes: 40 } });
    assert.equal(r.truncated, true);
    assert.equal(r.acquiredByteLength, 40);
    assert.equal(r.originalByteLengthExact, false);
    assert.equal(r.originalByteLength, null);
    assert.ok(r.originalByteLengthAtLeast > 40);
  });
});
