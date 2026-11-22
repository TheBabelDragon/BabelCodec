import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectInput } from '../../src/media/detection/index.js';

describe('detection preservation semantics', () => {
  it('standalone detectInput does not claim ledger retrieval', async () => {
    const r = await detectInput('hello');
    assert.equal(r.originalPreserved, true);
    assert.equal(r.inputUnmodified, true);
    assert.equal(r.originalAvailableToCaller, true);
    assert.equal(r.originalRetrievableVia, null);
    assert.equal(r.ledgerCommitted, false);
    assert.equal(r.storageStatus, null);
  });

  it('truncates oversized typed arrays using maxBytes', async () => {
    const big = new Uint8Array(1000);
    const r = await detectInput(big, { limits: { maxBytes: 50 } });
    assert.equal(r.truncated, true);
    assert.equal(r.originalByteLength, 1000);
    assert.equal(r.scannedByteLength, 50);
    assert.ok(r.alerts.some((a) => a.code === 'SIZE_LIMIT'));
  });
});
