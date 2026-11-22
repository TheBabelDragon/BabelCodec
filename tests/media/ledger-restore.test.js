import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createArtifactLedger,
  fromText,
  createRevision,
} from '../../src/media/artifacts/index.js';

describe('restoreWorking', () => {
  it('creates a new revision from historical bytes (monotonic)', async () => {
    const ledger = createArtifactLedger({ disableIdb: true });
    const a = fromText('v1');
    await ledger.commit(a);
    const r2 = createRevision(a, {
      representations: {
        bytes: new TextEncoder().encode('v2'),
        text: 'v2',
        image: null,
      },
      operation: 'edit',
    });
    await ledger.commit(r2);

    const working = await ledger.restoreWorking(a.id, 1);
    assert.equal(working.ok, true);
    assert.equal(working.artifact.revision, 3);
    assert.equal(working.restoredFromRevision, 1);
    assert.equal(working.artifact.provenance.operation, 'restore');

    assert.ok(ledger.getRecord(a.id, 1));
    assert.ok(ledger.getRecord(a.id, 2));
    assert.ok(ledger.getRecord(a.id, 3));

    const b1 = ledger.getBytes(a.id, 1);
    assert.deepEqual([...b1], [...new TextEncoder().encode('v1')]);
  });

  it('multiple restores each get distinct revisions', async () => {
    const ledger = createArtifactLedger({ disableIdb: true });
    const a = fromText('orig');
    await ledger.commit(a);
    const w1 = await ledger.restoreWorking(a.id, 1);
    const w2 = await ledger.restoreWorking(a.id, 1);
    assert.equal(w1.ok, true);
    assert.equal(w2.ok, true);
    assert.notEqual(w1.artifact.revision, w2.artifact.revision);
    assert.equal(w1.artifact.revision, 2);
    assert.equal(w2.artifact.revision, 3);
  });
});
