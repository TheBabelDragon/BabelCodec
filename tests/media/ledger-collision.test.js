import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createArtifactLedger } from '../../src/media/artifacts/ledger.js';
import { sha256 } from '../../src/sha256/index.js';

function artifact(id, revision, bytes, hash) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return {
    schema: 'babelcodec.artifact.v1',
    id,
    revision,
    source: { kind: 'bytes', name: null, mimeType: null, filename: null },
    representations: { bytes: buf, text: null, image: null },
    metadata: { byteLength: buf.byteLength },
    hashes: { sha256: hash ?? sha256(buf).hex },
    provenance: { parentArtifactId: null, parentRevision: null, operation: 'test' },
  };
}

function artifactNoBytes(id, revision, hash) {
  return {
    schema: 'babelcodec.artifact.v1',
    id,
    revision,
    source: { kind: 'bytes', name: null, mimeType: null, filename: null },
    representations: { bytes: null, text: null, image: null },
    metadata: { byteLength: 0 },
    hashes: { sha256: hash },
    provenance: { parentArtifactId: null, parentRevision: null, operation: 'test' },
  };
}

describe('ledger revision content collision', () => {
  it('identical content is idempotent duplicate', async () => {
    const ledger = createArtifactLedger({ disableIdb: true });
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const a = artifact('a1', 1, bytes);
    const r1 = await ledger.commit(a, { persist: false });
    const r2 = await ledger.commit(artifact('a1', 1, new Uint8Array([1, 2, 3, 4])), {
      persist: false,
    });
    assert.equal(r2.duplicate, true);
    assert.equal(r2.recordId, r1.recordId);
    assert.equal(ledger.listRecords('a1').length, 1);
  });

  it('different bytes same revision throws REVISION_CONTENT_COLLISION', async () => {
    const ledger = createArtifactLedger({ disableIdb: true });
    await ledger.commit(artifact('a1', 1, new Uint8Array([1, 2, 3])), { persist: false });
    let err;
    try {
      await ledger.commit(artifact('a1', 1, new Uint8Array([9, 8, 7])), { persist: false });
    } catch (e) {
      err = e;
    }
    assert.ok(err);
    assert.equal(err.code, 'REVISION_CONTENT_COLLISION');
    const stored = ledger.getBytes('a1', 1);
    assert.deepEqual([...stored], [1, 2, 3]);
  });

  it('mismatched supplied hash vs bytes throws HASH_MISMATCH', async () => {
    const ledger = createArtifactLedger({ disableIdb: true });
    const bytes = new Uint8Array([5, 5, 5]);
    let err;
    try {
      await ledger.commit(artifact('a2', 1, bytes, '0'.repeat(64)), { persist: false });
    } catch (e) {
      err = e;
    }
    assert.ok(err);
    assert.equal(err.code, 'HASH_MISMATCH');
  });

  it('matching hashes without bytes do not establish identity', async () => {
    const ledger = createArtifactLedger({ disableIdb: true });
    const h = 'a'.repeat(64);
    // First commit with no bytes still creates a revision slot
    await ledger.commit(artifactNoBytes('a3', 1, h), { persist: false });
    let err;
    try {
      await ledger.commit(artifactNoBytes('a3', 1, h), { persist: false });
    } catch (e) {
      err = e;
    }
    assert.ok(err);
    assert.equal(err.code, 'REVISION_IDENTITY_UNVERIFIED');
  });
});
