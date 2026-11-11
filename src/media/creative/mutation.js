/**
 * Mutation Lab — seeded, reproducible variations.
 * Local only; uses existing edit ops.
 */

import { adjustImageData, flipImageData, rotateImageData90 } from '../edit/index.js';

/**
 * @param {string} seed
 * @returns {() => number} 0..1
 */
export function mulberry32(seed) {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return function next() {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {string} parentSeed
 * @param {number} count
 */
export function planMutations(parentSeed, count = 4) {
  const rng = mulberry32(parentSeed || 'babel');
  const out = [];
  const n = Math.max(1, Math.min(12, count | 0));
  for (let i = 0; i < n; i++) {
    const seed = `${parentSeed || 'babel'}:m${i}:${(rng() * 1e9) | 0}`;
    const ops = [];
    const r = rng();
    if (r < 0.25) ops.push({ type: 'brightness', params: { brightness: 0.85 + rng() * 0.4 } });
    else if (r < 0.5) ops.push({ type: 'contrast', params: { contrast: 0.85 + rng() * 0.5 } });
    else if (r < 0.7) ops.push({ type: 'grayscale', params: { grayscale: true } });
    else if (r < 0.85) ops.push({ type: 'flip', params: { axis: rng() < 0.5 ? 'x' : 'y' } });
    else ops.push({ type: 'rotate90', params: { turns: 1 + ((rng() * 3) | 0) } });
    if (rng() < 0.35) ops.push({ type: 'brightness', params: { brightness: 0.9 + rng() * 0.25 } });
    out.push({ seed, ops, parentSeed: parentSeed || null });
  }
  return out;
}

/**
 * @param {ImageData} imageData
 * @param {{ type: string, params: object }[]} ops
 */
export function applyMutationOps(imageData, ops) {
  let cur = imageData;
  for (const op of ops || []) {
    if (op.type === 'brightness' || op.type === 'contrast' || op.type === 'grayscale) {
      cur = adjustImageData(cur, op.params);
    } else if (op.type === 'flip') {
      cur = flipImageData(cur, op.params.axis || 'x');
    } else if (op.type === 'rotate90') {
      const turns = Math.max(1, Math.min(3, op.params.turns | 0));
      for (let t = 0; t < turns; t++) cur = rotateImageData90(cur, 1);
    }
  }
  return cur;
}
