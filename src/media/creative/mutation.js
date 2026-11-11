/**
 * Mutation Lab — seeded, reproducible variations that produce real ImageData.
 * Local only; uses existing edit ops + additional pixel transforms.
 */

import {
  adjustImageData,
  flipImageData,
  rotateImageData90,
  resizeImageData,
  blurImageData,
} from '../edit/index.js';

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

function clampByte(v) {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/** Integer hue shift degrees −180..180 on ImageData (deterministic). */
export function hueShiftImageData(imageData, degrees) {
  const deg = ((Number(degrees) % 360) + 360) % 360;
  const out = new ImageData(imageData.width, imageData.height);
  const d = imageData.data;
  const o = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const g = d[i + 1] / 255;
    const b = d[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
      const dlt = max - min;
      s = l > 0.5 ? dlt / (2 - max - min) : dlt / (max + min);
      if (max === r) h = ((g - b) / dlt + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / dlt + 2) / 6;
      else h = ((r - g) / dlt + 4) / 6;
    }
    h = (h + deg / 360) % 1;
    // HSL → RGB
    let rr;
    let gg;
    let bb;
    if (s === 0) {
      rr = gg = bb = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const hk = h;
      const t = [hk + 1 / 3, hk, hk - 1 / 3].map((x) => {
        let v = x;
        if (v < 0) v += 1;
        if (v > 1) v -= 1;
        if (v < 1 / 6) return p + (q - p) * 6 * v;
        if (v < 1 / 2) return q;
        if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6;
        return p;
      });
      rr = t[0];
      gg = t[1];
      bb = t[2];
    }
    o[i] = clampByte(rr * 255);
    o[i + 1] = clampByte(gg * 255);
    o[i + 2] = clampByte(bb * 255);
    o[i + 3] = d[i + 3];
  }
  return out;
}

/** Color temperature: warm (+) / cool (−) approximate shift. */
export function temperatureImageData(imageData, amount) {
  const a = Math.max(-1, Math.min(1, Number(amount) || 0));
  const out = new ImageData(imageData.width, imageData.height);
  const d = imageData.data;
  const o = out.data;
  for (let i = 0; i < d.length; i += 4) {
    o[i] = clampByte(d[i] + a * 30);
    o[i + 1] = d[i + 1];
    o[i + 2] = clampByte(d[i + 2] - a * 30);
    o[i + 3] = d[i + 3];
  }
  return out;
}

/** Deterministic noise using seed-based LCG per pixel index. */
export function noiseImageData(imageData, strength, seed = 'n') {
  const s = Math.max(0, Math.min(1, Number(strength) || 0));
  const rng = mulberry32(String(seed));
  const out = new ImageData(imageData.width, imageData.height);
  const d = imageData.data;
  const o = out.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * 2 * s * 40;
    o[i] = clampByte(d[i] + n);
    o[i + 1] = clampByte(d[i + 1] + n);
    o[i + 2] = clampByte(d[i + 2] + n);
    o[i + 3] = d[i + 3];
  }
  return out;
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
    if (r < 0.12) ops.push({ type: 'brightness', params: { brightness: 0.75 + rng() * 0.5 } });
    else if (r < 0.24) ops.push({ type: 'contrast', params: { contrast: 0.75 + rng() * 0.55 } });
    else if (r < 0.34) ops.push({ type: 'saturation', params: { saturation: 0.4 + rng() * 1.2 } });
    else if (r < 0.44) ops.push({ type: 'hue', params: { degrees: ((rng() * 120) | 0) - 60 } });
    else if (r < 0.54) ops.push({ type: 'temperature', params: { amount: rng() * 1.2 - 0.6 } });
    else if (r < 0.64) ops.push({ type: 'grayscale', params: { grayscale: true } });
    else if (r < 0.74) ops.push({ type: 'flip', params: { axis: rng() < 0.5 ? 'x' : 'y' } });
    else if (r < 0.84) ops.push({ type: 'rotate90', params: { turns: 1 + ((rng() * 3) | 0) } });
    else if (r < 0.92) ops.push({ type: 'blur', params: { radius: 1 + ((rng() * 2) | 0) } });
    else ops.push({ type: 'noise', params: { strength: 0.15 + rng() * 0.35, seed } });

    if (rng() < 0.3) ops.push({ type: 'brightness', params: { brightness: 0.9 + rng() * 0.25 } });
    if (rng() < 0.2) ops.push({ type: 'scale', params: { factor: 0.85 + rng() * 0.3 } });

    out.push({
      seed,
      ops,
      parentSeed: parentSeed || null,
      index: i,
      label: `Variation ${i + 1}`,
    });
  }
  return out;
}

/**
 * Apply a list of mutation ops to ImageData. Never mutates the source buffer.
 * @param {ImageData} imageData
 * @param {{ type: string, params: object }[]} ops
 */
export function applyMutationOps(imageData, ops) {
  let cur = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );
  for (const op of ops || []) {
    const t = op.type;
    const p = op.params || {};
    if (t === 'brightness' || t === 'contrast' || t === 'grayscale' || t === 'saturation') {
      cur = adjustImageData(cur, p);
    } else if (t === 'hue') {
      cur = hueShiftImageData(cur, p.degrees ?? 0);
    } else if (t === 'temperature') {
      cur = temperatureImageData(cur, p.amount ?? 0);
    } else if (t === 'flip') {
      cur = flipImageData(cur, p.axis || 'x');
    } else if (t === 'rotate90') {
      const turns = Math.max(1, Math.min(3, p.turns | 0));
      for (let i = 0; i < turns; i++) cur = rotateImageData90(cur, 1);
    } else if (t === 'blur') {
      cur = blurImageData(cur, p.radius ?? 1);
    } else if (t === 'noise') {
      cur = noiseImageData(cur, p.strength ?? 0.2, p.seed || 'n');
    } else if (t === 'scale') {
      const f = Math.max(0.25, Math.min(2, Number(p.factor) || 1));
      const nw = Math.max(1, Math.round(cur.width * f));
      const nh = Math.max(1, Math.round(cur.height * f));
      cur = resizeImageData(cur, nw, nh);
      // pad/crop back to original size centered
      const canvasW = imageData.width;
      const canvasH = imageData.height;
      const pad = new ImageData(canvasW, canvasH);
      const ox = ((canvasW - nw) / 2) | 0;
      const oy = ((canvasH - nh) / 2) | 0;
      for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
          const dx = x + ox;
          const dy = y + oy;
          if (dx < 0 || dy < 0 || dx >= canvasW || dy >= canvasH) continue;
          const si = (y * nw + x) * 4;
          const di = (dy * canvasW + dx) * 4;
          pad.data[di] = cur.data[si];
          pad.data[di + 1] = cur.data[si + 1];
          pad.data[di + 2] = cur.data[si + 2];
          pad.data[di + 3] = cur.data[si + 3];
        }
      }
      cur = pad;
    }
  }
  return cur;
}

/**
 * Render a mutation plan into real ImageData results.
 * Source ImageData is never modified.
 * @param {ImageData} source
 * @param {ReturnType<typeof planMutations>} plans
 * @returns {{ plan: object, imageData: ImageData }[]}
 */
export function renderMutationPlans(source, plans) {
  return (plans || []).map((plan) => ({
    plan,
    imageData: applyMutationOps(source, plan.ops),
  }));
}

/** Hash RGBA for reproducibility tests (FNV-1a style). */
export function hashImageData(imageData) {
  let h = 2166136261 >>> 0;
  const d = imageData.data;
  for (let i = 0; i < d.length; i++) {
    h ^= d[i];
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
