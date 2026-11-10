/**
 * Shared assets + local edit operations + handoff helpers.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAssetRegistry,
  resetDefaultRegistry,
  getDefaultRegistry,
} from '../../src/media/assets/index.js';
import {
  cropImageData,
  resizeImageData,
  flipImageData,
  rotateImageData90,
  adjustImageData,
  createEditHistory,
} from '../../src/media/edit/index.js';
import {
  handoffBytesToSuite,
  textOverlaySpec,
  openInHexInspector,
} from '../../src/media/handoff.js';
import { detectLocalInferenceCapabilities } from '../../src/media/inference/index.js';

// Minimal ImageData polyfill for Node
if (typeof ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(dataOrW, wOrH, h) {
      if (typeof dataOrW === 'number') {
        this.width = dataOrW;
        this.height = wOrH;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrW;
        this.width = wOrH;
        this.height = h;
      }
    }
  };
}

function solid(w, h, r, g, b, a = 255) {
  const id = new ImageData(w, h);
  for (let i = 0; i < id.data.length; i += 4) {
    id.data[i] = r;
    id.data[i + 1] = g;
    id.data[i + 2] = b;
    id.data[i + 3] = a;
  }
  return id;
}

beforeEach(() => {
  resetDefaultRegistry();
});

describe('asset registry', () => {
  it('creates asset with stable id and metadata', async () => {
    const reg = createAssetRegistry();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const a = await reg.createFromBytes(bytes, {
      filename: 't.bin',
      mimeType: 'application/octet-stream',
      source: 'imported',
    });
    assert.ok(a.id);
    assert.equal(a.filename, 't.bin');
    assert.equal(a.byteLength, 4);
    assert.equal(a.source, 'imported');
    assert.deepEqual([...reg.getBytes(a.id)], [1, 2, 3, 4]);
  });

  it('derive preserves parent and history', async () => {
    const reg = createAssetRegistry();
    const parent = await reg.createFromBytes(new Uint8Array([9]), {
      filename: 'p.bin',
      source: 'created',
    });
    const child = await reg.derive(parent.id, new Uint8Array([8, 8]), {
      source: 'transformed',
      historyEntry: { op: 'crop', detail: { w: 1 } },
    });
    assert.equal(child.parentId, parent.id);
    assert.equal(child.history.length, 1);
    assert.equal(child.history[0].op, 'crop');
    assert.ok(reg.get(parent.id), 'parent remains');
  });

  it('rejects oversized assets', async () => {
    const reg = createAssetRegistry({ maxBytes: 4 });
    await assert.rejects(
      () => reg.createFromBytes(new Uint8Array(8), { filename: 'x' }),
      (e) => e.code === 'ASSET_TOO_LARGE',
    );
  });

  it('default registry is shared', async () => {
    const a = await getDefaultRegistry().createFromBytes(new Uint8Array([1]), {
      filename: 'a.bin',
      source: 'created',
    });
    assert.ok(getDefaultRegistry().get(a.id));
  });
});

describe('edit ops', () => {
  it('crop produces expected size', () => {
    const src = solid(10, 8, 10, 20, 30);
    const out = cropImageData(src, { x: 2, y: 2, w: 4, h: 3 });
    assert.equal(out.width, 4);
    assert.equal(out.height, 3);
  });

  it('resize changes dimensions', () => {
    const src = solid(8, 8, 1, 2, 3);
    const out = resizeImageData(src, 4, 2);
    assert.equal(out.width, 4);
    assert.equal(out.height, 2);
  });

  it('flip and rotate preserve pixel count appropriately', () => {
    const src = solid(3, 2, 255, 0, 0);
    const fx = flipImageData(src, 'x');
    assert.equal(fx.width, 3);
    const rot = rotateImageData90(src, 1);
    assert.equal(rot.width, 2);
    assert.equal(rot.height, 3);
  });

  it('grayscale adjust runs without NaN', () => {
    const src = solid(4, 4, 100, 50, 25);
    const out = adjustImageData(src, { grayscale: true });
    for (let i = 0; i < out.data.length; i++) {
      assert.ok(Number.isFinite(out.data[i]));
    }
  });

  it('undo/redo history', () => {
    const hist = createEditHistory();
    hist.push(solid(2, 2, 1, 0, 0));
    hist.push(solid(2, 2, 0, 1, 0));
    assert.equal(hist.canUndo(), true);
    const u = hist.undo();
    assert.equal(u.data[0], 1);
    const r = hist.redo();
    assert.equal(r.data[1], 1);
  });
});

describe('handoff', () => {
  it('registers asset and invokes onBytes', async () => {
    let got = null;
    const { asset } = await handoffBytesToSuite(new Uint8Array([7, 7]), {
      filename: 'h.png',
      mimeType: 'image/png',
      source: 'created',
      onBytes: (b) => {
        got = b;
      },
    });
    assert.ok(asset?.id);
    assert.deepEqual([...got], [7, 7]);
  });

  it('openInHexInspector navigates', () => {
    let tab = null;
    openInHexInspector((t) => {
      tab = t;
    }, () => {}, new Uint8Array([1]));
    assert.equal(tab, 'inspector');
  });

  it('textOverlaySpec preserves Unicode text', () => {
    const s = textOverlaySpec('שלום · hello');
    assert.equal(s.type, 'text');
    assert.equal(s.text, 'שלום · hello');
  });
});

describe('local inference capabilities', () => {
  it('does not claim models without a backend', async () => {
    const c = await detectLocalInferenceCapabilities();
    assert.equal(c.modelsAvailable, false);
    assert.equal(c.backend, 'none');
    assert.ok(Array.isArray(c.operations));
    assert.equal(c.operations.length, 0);
    assert.match(c.message, /No local inference models/i);
  });
});
