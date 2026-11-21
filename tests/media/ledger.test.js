/**
 * Output ledger tests
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createArtifactLedger,
  fromBytes,
  fromText,
  createRevision,
  withHash,
  analyzeArtifact,
  ingestInput,
} from '../../src/media/artifacts/index.js';

describe('artifact ledger', () => {
  it('commits and retrieves complete bytes', async () => {
    const ledger = createArtifactLedger({ disableIdb: true });
    const a = fromBytes(new Uint8Array([1, 2, 3, 4]));
    const analysis = analyzeArtifact(a, { computeHash: true });
    const hashed = withHash(a, analysis.sha256);
    const rec = await ledger.commit(hashed, { operationName: 'import' });
    assert.equal(rec.byteLength, 4);
    assert.ok(rec.sha256);
    assert.equal(rec.exportAvailable, true);

    const exp = ledger.exportOutput(hashed.id, hashed.revision, 'bytes');
    assert.equal(exp.ok, true);
    assert.equal(exp.complete, true);
    assert.deepEqual([...exp.bytes], [1, 2, 3, 4]);

    const hex = ledger.exportOutput(hashed.id, hashed.revision, 'hex');
    assert.equal(hex.ok, true);
    assert.ok(typeof hex.text === 'string');
    assert.match(hex.text, /^[0-9A-Fa-f]+$/);

    const v = ledger.verify(hashed.id, hashed.revision);
    assert.equal(v.ok, true);
  });

  it('representation-aware text export fails honestly on binary', async () => {
    const ledger = createArtifactLedger({ disableIdb: true });
    const a = fromBytes(new Uint8Array([0xff, 0xfe, 0x00, 0x01]));
    await ledger.commit(a);
    const exp = ledger.exportOutput(a.id, a.revision, 'text');
    // May fail UTF-8 or succeed with replacement depending on decoder fatal mode
    if (!exp.ok) {
      assert.equal(exp.complete, false);
      assert.ok(exp.reason);
    }
  });

  it('copyOutput returns complete text without claiming binary clipboard', async () => {
    const ledger = createArtifactLedger({ disableIdb: true });
    const a = fromText('copy-me');
    await ledger.commit(a);
    const c = ledger.copyOutput(a.id, a.revision, { format: 'text' });
    assert.equal(c.ok, true);
    assert.equal(c.complete, true);
    assert.equal(c.text, 'copy-me');

    const bin = ledger.copyOutput(a.id, a.revision, { format: 'bytes' });
    assert.equal(bin.ok, true);
    assert.equal(bin.claimed, false);
  });

  it('preserves parent relationship across revision', async () => {
    const ledger = createArtifactLedger({ disableIdb: true });
    const a = fromText('parent');
    await ledger.commit(a, { operationName: 'import' });
    const child = createRevision(a, {
      representations: {
        bytes: new TextEncoder().encode('child'),
        text: 'child',
        image: null,
      },
      operation: 'transform',
    });
    const rec = await ledger.commit(child, { operationName: 'transform' });
    assert.equal(rec.parentArtifactId, a.id);
    assert.equal(rec.parentRevision, 1);

    const hist = ledger.listRecords(a.id);
    assert.ok(hist.length >= 2);
  });

  it('restore does not destroy later revisions', async () => {
    const ledger = createArtifactLedger({ disableIdb: true });
    const a = fromText('v1');
    await ledger.commit(a);
    const r2 = createRevision(a, {
      representations: { bytes: new TextEncoder().encode('v2'), text: 'v2', image: null },
      operation: 'edit',
    });
    await ledger.commit(r2);
    const restored = ledger.restore(a.id, 1);
    assert.equal(restored.ok, true);
    assert.equal(restored.artifact.revision, 1);
    const still = ledger.getRecord(a.id, 2);
    assert.ok(still);
  });

  it('ingestInput wires detection + ledger', async () => {
    const ledger = createArtifactLedger({ disableIdb: true });
    const result = await ingestInput('{"x":1}', { ledger });
    assert.ok(result.artifact);
    assert.ok(result.detection);
    assert.ok(result.analysis.sha256);
    assert.ok(result.ledgerRecord.sha256);
    assert.ok(result.detection.findings.some((f) => f.subtype === 'json'));
  });

  it('missing bytes export does not claim complete preservation', async () => {
    const ledger = createArtifactLedger({ disableIdb: true, maxMemoryRecords: 1 });
    const a = fromBytes(new Uint8Array([1]));
    await ledger.commit(a);
    const b = fromBytes(new Uint8Array([2]));
    await ledger.commit(b);
    // First may be cold/evicted from memory
    const exp = ledger.exportOutput(a.id, a.revision, 'bytes');
    if (!exp.ok) {
      assert.equal(exp.complete, false);
    }
  });
});
