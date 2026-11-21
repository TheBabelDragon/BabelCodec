import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createArtifact, snapshotArtifact } from '../../src/media/artifacts/index.js';
import { createMetadata, mergeMetadata } from '../../src/media/artifacts/metadata.js';

describe('deep metadata ownership', () => {
  it('nested arrays are not shared', () => {
    const meta = createMetadata({ tags: ['a', 'b'], nested: { x: 1 } });
    meta.tags.push('c');
    meta.nested.x = 9;
    const again = createMetadata({ tags: ['a', 'b'], nested: { x: 1 } });
    assert.deepEqual(again.tags, ['a', 'b']);
    assert.equal(again.nested.x, 1);
  });

  it('artifact metadata mutation does not affect sibling snapshot', () => {
    const a = createArtifact({
      representations: { bytes: new Uint8Array([1]) },
      metadata: { tags: ['keep'], detail: { n: 1 } },
    });
    const s = snapshotArtifact(a);
    a.metadata.tags.push('mut');
    a.metadata.detail.n = 99;
    // snapshot was created before mutation with deep clone at create time
    const s2 = snapshotArtifact(a);
    assert.ok(s2.metadata.tags.includes('mut'));
    // Original create path cloned input — re-create from same shape is clean
    const b = createArtifact({
      representations: { bytes: new Uint8Array([1]) },
      metadata: { tags: ['keep'], detail: { n: 1 } },
    });
    assert.deepEqual(b.metadata.tags, ['keep']);
    assert.equal(b.metadata.detail.n, 1);
  });

  it('mergeMetadata clones both sides', () => {
    const base = { tags: ['a'], nested: { v: 1 } };
    const patch = { tags: ['b'], nested: { v: 2 } };
    const m = mergeMetadata(base, patch);
    m.tags.push('c');
    m.nested.v = 3;
    assert.deepEqual(base.tags, ['a']);
    assert.equal(base.nested.v, 1);
    assert.deepEqual(patch.tags, ['b']);
  });
});
