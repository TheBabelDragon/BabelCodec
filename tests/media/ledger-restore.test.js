import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createArtifactLedger,
  fromText,
  createRevision,
} from '../../src/media/artifacts/index.js';

describe('restoreWorking', () => {
  it('creates a new revision from historical bytes', async () => {
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
    assert.ok(working.artifact.revision > 2 || working.artifact.revision === 3);
    assert.equal(working.restoredFromRevision, 1);
    assert.equal(working.artifact.provenance.operation, 'restore');

    // History still has original revisions
    assert.ok(ledger.getRecord(a.id, 1));
    assert.ok(ledger.getRecord(a.id, 2));
    assert.ok(ledger.getRecord(a.id, working.artifact.revision));
  });
});
