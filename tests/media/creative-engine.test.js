if (typeof ImageData === 'undefined') {
  globalThis.ImageData = class {
    constructor(w, h) {
      this.width = w;
      this.height = h;
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  };
}

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  interpretCreativeIntent,
  summarizeDesignSpec,
  STARTER_PROJECTS,
  planMutations,
  applyMutationOps,
  compareBytes,
} from '../../src/media/creative/index.js';

describe('creative intent (local heuristic)', () => {
  it('interprets copper mechanical dragon into structured spec', () => {
    const spec = interpretCreativeIntent(
      'Make a dark mechanical dragon emblem with copper details, suitable for a game inventory icon.',
    );
    assert.equal(spec.interpretationSource, 'local_heuristic');
    assert.ok(spec.palette.length >= 3);
    assert.match(spec.style, /game|mechanical|emblem|creature|icon/);
    assert.ok(spec.dimensions.width >= 16);
    const sum = summarizeDesignSpec(spec);
    assert.match(sum, /local_heuristic/);
    assert.doesNotMatch(sum, /remote LLM generated image/i);
  });
});

describe('starters', () => {
  it('each starter builds a scene with dimensions and objects', () => {
    assert.ok(STARTER_PROJECTS.length >= 5);
    for (const p of STARTER_PROJECTS) {
      const scene = p.build();
      assert.ok(scene.width > 0 && scene.height > 0, p.id);
      assert.ok(Array.isArray(scene.objects), p.id);
      assert.ok(scene.objects.length >= 1, p.id);
    }
  });
});

describe('mutation lab', () => {
  it('plans are reproducible for the same seed', () => {
    const a = planMutations('seed-x', 4);
    const b = planMutations('seed-x', 4);
    assert.equal(a.length, 4);
    assert.deepEqual(
      a.map((x) => x.ops),
      b.map((x) => x.ops),
    );
  });

  it('applyMutationOps changes pixels without mutating length class', () => {
    const data = new ImageData(8, 8);
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i] = 200;
      data.data[i + 1] = 100;
      data.data[i + 2] = 50;
      data.data[i + 3] = 255;
    }
    const plans = planMutations('pix', 1);
    const out = applyMutationOps(data, plans[0].ops);
    assert.ok(out.width >= 1 && out.height >= 1);
    assert.equal(out.data.length % 4, 0);
  });
});

describe('byte compare', () => {
  it('detects identical and different buffers', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    const c = new Uint8Array([1, 9, 3]);
    assert.equal(compareBytes(a, b).identical, true);
    assert.equal(compareBytes(a, c).identical, false);
    assert.equal(compareBytes(a, c).firstDiffOffset, 1);
  });
});
