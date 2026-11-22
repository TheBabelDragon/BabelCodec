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
});

describe('aggregate nested decode budget', () => {
  it('stops when aggregate nested bytes exhausted', async () => {
    const chunk = new Uint8Array(64);
    chunk.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const t1 = encodeBase64(chunk);
    const t2 = encodeBase64(chunk);
    const payload = `A ${t1} B ${t2}`;
    const r = await detectInput(payload, {
      decodeNested: true,
      limits: { maxNestedDecodeBytes: 40, maxWorkUnits: 50_000 },
    });
    // With tiny aggregate limit, should not fully nest both 64-byte payloads
    assert.ok(
      r.nestedDecodedBytes <= 40 ||
        r.alerts.some((a) => a.code === 'NESTED_BYTE_LIMIT') ||
        r.analysisComplete === false,
    );
  });
});

describe('bounded UTF-8 string acquisition', () => {
  it('truncates large ASCII string without claiming full acquisition', async () => {
    const s = 'a'.repeat(500);
    const r = await detectInput(s, { limits: { maxBytes: 50 } });
    assert.equal(r.truncated, true);
    assert.equal(r.originalByteLength, 500);
    assert.equal(r.acquiredByteLength, 50);
  });

  it('handles multibyte boundary without invalid trailing UTF-8', async () => {
    const s = 'é'.repeat(20); // 2 bytes each in UTF-8
    const r = await detectInput(s, { limits: { maxBytes: 5 } });
    assert.equal(r.truncated, true);
    // 5 bytes: at most 2 full 'é' (4) + maybe stop before third
    assert.ok(r.acquiredByteLength <= 5);
    assert.ok(r.acquiredByteLength % 2 === 0 || r.acquiredByteLength <= 4);
  });
});
