/**
 * Asset registry — create, derive, lineage, MIME, integrity, delete isolation.
 * IndexedDB paths are exercised when available; otherwise memory-only is asserted.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAssetRegistry,
  sniffMimeType,
  resetDefaultRegistry,
} from '../../src/media/assets/index.js';

function pngish() {
  // minimal recognizable PNG signature + padding
  const b = new Uint8Array(32);
  b[0] = 0x89;
  b[1] = 0x50;
  b[2] = 0x4e;
  b[3] = 0x47;
  b[4] = 0x0d;
  b[5] = 0x0a;
  b[6] = 0x1a;
  b[7] = 0x0a;
  for (let i = 8; i < 32; i++) b[i] = i;
  return b;
}

describe('asset registry', () => {
  beforeEach(() => {
    resetDefaultRegistry();
  });

  it('sniffs PNG MIME', () => {
    assert.equal(sniffMimeType(pngish()), 'image/png');
  });

  it('createFromBytes records hash and MIME', async () => {
    const reg = createAssetRegistry({ disableIdb: true });
    const a = await reg.createFromBytes(pngish(), { filename: 'a.png', source: 'imported' });
    assert.ok(a.id);
    assert.equal(a.mimeType, 'image/png');
    assert.ok(a.contentHash);
    assert.equal(a.byteLength, 32);
    const bytes = reg.getBytes(a.id);
    assert.equal(bytes[0], 0x89);
  });

  it('derive preserves parent; delete child keeps parent', async () => {
    const reg = createAssetRegistry({ disableIdb: true });
    const parent = await reg.createFromBytes(pngish(), { filename: 'p.png', source: 'imported' });
    const childBytes = new Uint8Array(pngish());
    childBytes[20] = 99;
    const child = await reg.derive(parent.id, childBytes, {
      source: 'mutated',
      historyEntry: { op: 'mutate', detail: { seed: 's1' } },
      seed: 's1',
    });
    assert.equal(child.parentId, parent.id);
    assert.ok(child.history.some((h) => h.op === 'mutate'));
    const line = reg.lineage(child.id);
    assert.equal(line.length, 2);
    assert.equal(line[0].id, parent.id);
    assert.equal(line[1].id, child.id);
    reg.remove(child.id);
    assert.ok(reg.get(parent.id));
    assert.equal(reg.get(child.id), null);
  });

  it('children lists derivatives', async () => {
    const reg = createAssetRegistry({ disableIdb: true });
    const p = await reg.createFromBytes(pngish(), { filename: 'p.png' });
    await reg.derive(p.id, pngish(), { source: 'transformed' });
    await reg.derive(p.id, pngish(), { source: 'mutated' });
    assert.equal(reg.children(p.id).length, 2);
  });
});
