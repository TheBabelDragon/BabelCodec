import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  planMutations,
  applyMutationOps,
  renderMutationPlans,
  hashImageData,
} from '../../src/media/creative/mutation.js';

function solid(w, h, r, g, b) {
  const im = new ImageData(w, h);
  for (let i = 0; i < im.data.length; i += 4) {
    im.data[i] = r;
    im.data[i + 1] = g;
    im.data[i + 2] = b;
    im.data[i + 3] = 255;
  }
  return im;
}

describe('mutation lab', () => {
  it('plans are reproducible for the same seed', () => {
    const a = planMutations('seed-x', 4);
    const b = planMutations('seed-x', 4);
    assert.deepEqual(a, b);
    const c = planMutations('seed-y', 4);
    assert.notDeepEqual(a.map((p) => p.seed), c.map((p) => p.seed));
  });

  it('applyMutationOps does not mutate source buffer', () => {
    const src = solid(8, 8, 10, 20, 30);
    const copy = new Uint8ClampedArray(src.data);
    const out = applyMutationOps(src, [{ type: 'brightness', params: { brightness: 1.5 } }]);
    assert.deepEqual([...src.data], [...copy]);
    assert.equal(out.width, 8);
    assert.ok(out.data[0] !== 10 || out.data[0] === clampExpect(10 * 1.5));
  });

  it('same ops produce same hash', () => {
    const src = solid(16, 16, 40, 80, 120);
    const ops = [{ type: 'contrast', params: { contrast: 1.2 } }, { type: 'grayscale', params: { grayscale: true } }];
    const a = applyMutationOps(src, ops);
    const b = applyMutationOps(src, ops);
    assert.equal(hashImageData(a), hashImageData(b));
  });

  it('renderMutationPlans returns ImageData per plan', () => {
    const src = solid(12, 12, 100, 100, 100);
    const plans = planMutations('render-seed', 3);
    const rendered = renderMutationPlans(src, plans);
    assert.equal(rendered.length, 3);
    for (const r of rendered) {
      assert.equal(r.imageData.width, 12);
      assert.equal(r.imageData.height, 12);
      assert.ok(r.plan.seed);
    }
  });
});

function clampExpect(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}
