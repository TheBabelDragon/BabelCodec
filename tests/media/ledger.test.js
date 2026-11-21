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

    const exp = ledger.exportOutput(hashed.id, hashed.revision);
    assert.equal(exp.ok, true);
    assert.equal(exp.complete, true);
    assert.deepEqual([...exp.bytes], [1, 2, 3, 4]);

    const v = ledger.verify(hashed.id, hashed.revision);
    assert.equal(v.ok, true);
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
});
