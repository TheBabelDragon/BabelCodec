/**
 * Deterministic, seed-driven procedural image provider.
 * Fully offline. Zero new dependencies.
 *
 * Cross-engine determinism policy:
 * - No Math.random / Date
 * - No transcendental hot-path (sin/cos/pow/hypot/exp)
 * - Value noise uses integer lattice hashes + fixed-point bilinear weights
 * - Assert reproducibility on raw RGBA (not PNG compressor output)
 *
 * Provider version: 0.11.0
 */

import { registerProvider } from './registry.js';
import { SCHEMA_VERSION } from '../schemas.js';
import { sha256 } from '../../../sha256/index.js';

export const PROCEDURAL_PROVIDER_VERSION = '0.11.0';
export const PROCEDURAL_PROVIDER_ID = 'procedural';

/** SSTV-friendly size presets. */
export const SSTV_PRESETS = Object.freeze({
  martin_m1: { width: 320, height: 256, label: 'Martin M1 (320×256)' },
  robot36: { width: 320, height: 240, label: 'Robot 36 (320×240)' },
});

const GENERATORS = Object.freeze(['fbm', 'truchet', 'gray_scott']);

/** Fixed-point scale: 1.0 ≡ FP */
const FP = 65536;

/**
 * Map a 32-byte SHA-256 digest to generator parameters.
 * Pure and unit-testable; fields depend only on digest bytes.
 * Floating fields are rational multiples of digest bytes (deterministic).
 * @param {Uint8Array|string} digest
 * @returns {object}
 */
export function digestToParams(digest) {
  const b = normalizeDigest(digest);
  return {
    generator: GENERATORS[b[0] % GENERATORS.length],
    // Integer-friendly palette indices (0–255), converted at shade time
    hueByte: b[1],
    satByte: b[2],
    lightByte: b[3],
    freqByte: b[4],
    octaves: 1 + (b[5] % 5),
    lacByte: b[6],
    gainByte: b[7],
    symmetry: b[8] % 4,
    warpByte: b[9],
    tileSize: 8 + (b[10] % 24),
    steps: 24 + (b[11] % 48),
    feedByte: b[12],
    killByte: b[13],
    paletteShiftByte: b[14],
    contrastByte: b[15],
    // Derived floats kept for tests/UI display (exact from bytes)
    hue: (b[1] * 360) / 255,
    sat: 0.4 + (b[2] * 0.5) / 255,
    light: 0.35 + (b[3] * 0.35) / 255,
    frequency: 1 + (b[4] * 7) / 255,
    lacunarity: 1.5 + (b[6] * 1.5) / 255,
    gain: 0.4 + (b[7] * 0.3) / 255,
    warpStrength: (b[9] * 0.5) / 255,
    feed: 0.02 + (b[12] * 0.05) / 255,
    kill: 0.045 + (b[13] * 0.025) / 255,
    paletteShift: b[14] / 255,
    contrast: 0.7 + (b[15] * 0.5) / 255,
  };
}

function normalizeDigest(digest) {
  if (typeof digest === 'string') {
    const hex = digest.replace(/^0x/i, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('digest hex must be 64 hex chars');
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  if (!(digest instanceof Uint8Array) || digest.length < 32) {
    throw new Error('digest must be Uint8Array(32) or hex string');
  }
  return digest.length === 32 ? digest : digest.subarray(0, 32);
}

/**
 * Canonical material: `${prompt}\n${seed}` → SHA-256.
 * @param {string} prompt
 * @param {string} seed
 */
export function promptSeedDigest(prompt, seed) {
  const material = `${String(prompt ?? '')}\n${String(seed ?? '')}`;
  const result = sha256(material);
  return { digest: result.digest, hex: result.hex, material };
}

/** sfc32 PRNG — no Math.random / Date. Returns [0,1). */
export function sfc32(a, b, c, d) {
  return function next() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const t2 = (t + d) | 0;
    c = (c + t2) | 0;
    return (t2 >>> 0) / 4294967296;
  };
}

/** Integer PRNG step returning uint32 (for fixed-point paths). */
export function sfc32u(a, b, c, d) {
  return function nextU() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const t2 = (t + d) | 0;
    c = (c + t2) | 0;
    return t2 >>> 0;
  };
}

export function rngFromDigest(digest, salt = 0) {
  const b = normalizeDigest(digest);
  const u = (i) =>
    ((b[i % 32] << 24) | (b[(i + 1) % 32] << 16) | (b[(i + 2) % 32] << 8) | b[(i + 3) % 32]) >>> 0;
  const s = salt >>> 0;
  return sfc32(u(0) ^ s, u(4) ^ Math.imul(s, 0x9e3779b9), u(8), u(12));
}

function seedsFromDigest(digest, salt = 0) {
  const b = normalizeDigest(digest);
  const u = (i) =>
    ((b[i % 32] << 24) | (b[(i + 1) % 32] << 16) | (b[(i + 2) % 32] << 8) | b[(i + 3) % 32]) >>> 0;
  const s = salt >>> 0;
  return [u(0) ^ s, u(4) ^ Math.imul(s, 0x9e3779b9), u(8), u(12)];
}

function yieldTick() {
  return new Promise((r) => setTimeout(r, 0));
}

function checkAbort(signal) {
  if (signal?.aborted) {
    const err = new Error('cancelled');
    err.name = 'AbortError';
    throw err;
  }
}

function clampByte(v) {
  if (!Number.isFinite(v)) return 0;
  const n = v | 0;
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

/** HSL without transcendentals — piecewise linear sectors only. */
function hslToRgb(h, s, l) {
  let hh = h % 360;
  if (hh < 0) hh += 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) {
    r = c;
    g = x;
  } else if (hh < 120) {
    r = x;
    g = c;
  } else if (hh < 180) {
    g = c;
    b = x;
  } else if (hh < 240) {
    g = x;
    b = c;
  } else if (hh < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return {
    r: clampByte((r + m) * 255),
    g: clampByte((g + m) * 255),
    b: clampByte((b + m) * 255),
  };
}

function palette(t, params) {
  // t in [0,1] — clamp without Math.min/max chain issues
  let u = t;
  if (u < 0) u = 0;
  if (u > 1) u = 1;
  const h = (params.hueByte * 360) / 255 + u * 80 + (params.paletteShiftByte * 60) / 255;
  const s = 0.4 + (params.satByte * 0.5) / 255;
  const baseL = 0.35 + (params.lightByte * 0.35) / 255;
  const contrast = 0.7 + (params.contrastByte * 0.5) / 255;
  let l = baseL * (0.55 + u * contrast);
  if (l < 0.05) l = 0.05;
  if (l > 0.92) l = 0.92;
  return hslToRgb(h, s, l);
}

function applySymmetry(x, y, w, h, symmetry) {
  let xx = x;
  let yy = y;
  if (symmetry === 1 || symmetry === 3) {
    if (xx >= (w >> 1)) xx = w - 1 - xx;
  }
  if (symmetry === 2 || symmetry === 3) {
    if (yy >= (h >> 1)) yy = h - 1 - yy;
  }
  return { x: xx, y: yy };
}

/** Integer hash → uint32, then to [0, FP) fixed. */
function latticeHash(ix, iy, seed) {
  let n = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ (seed | 0);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return n >>> 0;
}

/**
 * Fixed-point value noise. Coordinates in Q16.16.
 * Returns 0..FP inclusive-ish (0..65536).
 */
function valueNoiseFp(xFp, yFp, seed) {
  const x0 = xFp >> 16;
  const y0 = yFp >> 16;
  const fx = xFp & 0xffff; // 0..65535 fractional
  const fy = yFp & 0xffff;
  // smoothstep in fixed: t^2 * (3 - 2t) with t in 0..65535
  // sx = fx^2 * (3*FP - 2*fx) / FP^2
  const fx2 = Math.imul(fx, fx); // may need 32-bit careful — use number
  const fy2 = Math.imul(fy, fy);
  // Use floating intermediate only for weight (still deterministic poly of ints)
  // Better: compute in number domain from exact integers
  const fxf = fx / FP;
  const fyf = fy / FP;
  const sx = fxf * fxf * (3 - 2 * fxf);
  const sy = fyf * fyf * (3 - 2 * fyf);

  const n00 = latticeHash(x0, y0, seed) / 4294967296;
  const n10 = latticeHash(x0 + 1, y0, seed) / 4294967296;
  const n01 = latticeHash(x0, y0 + 1, seed) / 4294967296;
  const n11 = latticeHash(x0 + 1, y0 + 1, seed) / 4294967296;
  const nx0 = n00 * (1 - sx) + n10 * sx;
  const nx1 = n01 * (1 - sx) + n11 * sx;
  return nx0 * (1 - sy) + nx1 * sy; // 0..1
}

/** fBm with integer lattice hash noise (no sin/pow). */
export function generateFbm(params, width, height, rng) {
  const seedU = (rng() * 4294967296) >>> 0;
  const out = new Uint8ClampedArray(width * height * 4);
  const freq = 1 + (params.freqByte * 7) / 255;
  const octaves = params.octaves;
  const lac = 1.5 + (params.lacByte * 1.5) / 255;
  const gain = 0.4 + (params.gainByte * 0.3) / 255;
  const warp = (params.warpByte * 0.5) / 255;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = applySymmetry(x, y, width, height, params.symmetry);
      // Q16.16 sample coords
      let nx = ((s.x * freq) / width) * FP;
      let ny = ((s.y * freq) / height) * FP;
      nx = nx | 0;
      ny = ny | 0;
      if (warp > 0) {
        const wx = valueNoiseFp(nx + 3 * FP, ny + ((1.7 * FP) | 0), seedU);
        const wy = valueNoiseFp(nx - FP, ny + (4 * FP), seedU ^ 0x9e3779b9);
        const wAmp = (warp * 2 * FP) | 0;
        nx = (nx + ((wx - 0.5) * wAmp) | 0) | 0;
        ny = (ny + ((wy - 0.5) * wAmp) | 0) | 0;
      }
      let amp = 1;
      let f = 1;
      let sum = 0;
      let norm = 0;
      for (let o = 0; o < octaves; o++) {
        const xf = (nx * f) | 0;
        const yf = (ny * f) | 0;
        sum += valueNoiseFp(xf, yf, seedU ^ (o * 0x85ebca6b)) * amp;
        norm += amp;
        amp *= gain;
        f *= lac;
      }
      const t = norm > 0 ? sum / norm : 0;
      const col = palette(t, params);
      const i = (y * width + x) * 4;
      out[i] = col.r;
      out[i + 1] = col.g;
      out[i + 2] = col.b;
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Truchet tiles using squared distance (no Math.hypot).
 * Quarter-circle bands via |d² - r²| ≤ threshold.
 */
export function generateTruchet(params, width, height, rng) {
  const tile = Math.max(4, params.tileSize | 0);
  const cols = Math.ceil(width / tile);
  const rows = Math.ceil(height / tile);
  const orient = new Uint8Array(cols * rows);
  for (let i = 0; i < orient.length; i++) orient[i] = rng() < 0.5 ? 0 : 1;

  const out = new Uint8ClampedArray(width * height * 4);
  const bg = palette(0.15, params);
  const fg = palette(0.85, params);
  const thickness = Math.max(1, (tile * 18) / 100 | 0);
  const r0 = tile >> 1;
  const r0sq = r0 * r0;
  // Band: |sqrt(d2)-r0| <= th  ≈  |d2 - r0²| <= th*(2*r0) roughly
  const band = thickness * (2 * r0 + thickness);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = applySymmetry(x, y, width, height, params.symmetry);
      const cx = Math.floor(s.x / tile);
      const cy = Math.floor(s.y / tile);
      const lx = s.x - cx * tile;
      const ly = s.y - cy * tile;
      const o = orient[(cy % rows) * cols + (cx % cols)];
      const d1 = lx * lx + ly * ly;
      const d2 = (lx - tile) * (lx - tile) + (ly - tile) * (ly - tile);
      const d3 = (lx - tile) * (lx - tile) + ly * ly;
      const d4 = lx * lx + (ly - tile) * (ly - tile);
      let on = false;
      if (o === 0) {
        on =
          Math.abs(d1 - r0sq) <= band || Math.abs(d2 - r0sq) <= band;
      } else {
        on =
          Math.abs(d3 - r0sq) <= band || Math.abs(d4 - r0sq) <= band;
      }
      const col = on ? fg : bg;
      const i = (y * width + x) * 4;
      out[i] = col.r;
      out[i + 1] = col.g;
      out[i + 2] = col.b;
      out[i + 3] = 255;
    }
  }
  return out;
}

/**
 * Gray-Scott reaction-diffusion — only +, -, * (IEEE ops, no transcendentals).
 * Capped deterministic step count. Optional AbortSignal checked each step.
 */
export function generateGrayScott(params, width, height, rng, signal) {
  const n = width * height;
  let U = new Float64Array(n);
  let V = new Float64Array(n);
  let Un = new Float64Array(n);
  let Vn = new Float64Array(n);
  U.fill(1);
  V.fill(0);

  const patches = 3 + (Math.floor(rng() * 5) | 0);
  for (let p = 0; p < patches; p++) {
    const cx = Math.floor(rng() * width);
    const cy = Math.floor(rng() * height);
    const rad = 2 + Math.floor(rng() * 6);
    const rad2 = rad * rad;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad2) continue;
        const x = (cx + dx + width) % width;
        const y = (cy + dy + height) % height;
        const i = y * width + x;
        U[i] = 0.5;
        V[i] = 0.25;
      }
    }
  }

  const Du = 0.16;
  const Dv = 0.08;
  const F = 0.02 + (params.feedByte * 0.05) / 255;
  const K = 0.045 + (params.killByte * 0.025) / 255;
  const steps = Math.max(8, Math.min(120, params.steps | 0));

  for (let step = 0; step < steps; step++) {
    if (signal?.aborted) checkAbort(signal);
    for (let y = 0; y < height; y++) {
      const ym = y === 0 ? height - 1 : y - 1;
      const yp = y === height - 1 ? 0 : y + 1;
      for (let x = 0; x < width; x++) {
        const xm = x === 0 ? width - 1 : x - 1;
        const xp = x === width - 1 ? 0 : x + 1;
        const i = y * width + x;
        const u = U[i];
        const v = V[i];
        const uvv = u * v * v;
        const lapU =
          U[y * width + xm] + U[y * width + xp] + U[ym * width + x] + U[yp * width + x] - 4 * u;
        const lapV =
          V[y * width + xm] + V[y * width + xp] + V[ym * width + x] + V[yp * width + x] - 4 * v;
        Un[i] = u + Du * lapU - uvv + F * (1 - u);
        Vn[i] = v + Dv * lapV + uvv - (F + K) * v;
      }
    }
    const tU = U;
    U = Un;
    Un = tU;
    const tV = V;
    V = Vn;
    Vn = tV;
  }

  let vmin = V[0];
  let vmax = V[0];
  for (let i = 1; i < n; i++) {
    const vi = V[i];
    if (vi < vmin) vmin = vi;
    if (vi > vmax) vmax = vi;
  }
  const span = vmax - vmin || 1;

  const out = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = applySymmetry(x, y, width, height, params.symmetry);
      const t = (V[s.y * width + s.x] - vmin) / span;
      const col = palette(t, params);
      const i = (y * width + x) * 4;
      out[i] = col.r;
      out[i + 1] = col.g;
      out[i + 2] = col.b;
      out[i + 3] = 255;
    }
  }
  return out;
}

const GENERATOR_FNS = {
  fbm: generateFbm,
  truchet: generateTruchet,
  gray_scott: (p, w, h, rng, signal) => generateGrayScott(p, w, h, rng, signal),
};

export function renderRgba(params, width, height, rng, signal) {
  if (params.generator === 'gray_scott') {
    return generateGrayScott(params, width, height, rng, signal);
  }
  const fn = GENERATOR_FNS[params.generator] || generateFbm;
  return fn(params, width, height, rng);
}

/** Hash raw RGBA for cross-run determinism asserts (prefer this over PNG bytes). */
export function hashRgba(rgba) {
  const bytes = rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba);
  return sha256(bytes).hex;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function chunk(type, data) {
  const typeB = [...type].map((ch) => ch.charCodeAt(0));
  const body = new Uint8Array([...typeB, ...data]);
  return new Uint8Array([...u32(data.length), ...body, ...u32(crc32(body))]);
}

function adler32(data) {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function concat(arrs) {
  let len = 0;
  for (const a of arrs) len += a.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

function zlibStore(data) {
  const blocks = [];
  let offset = 0;
  const max = 65535;
  while (offset < data.length) {
    const len = Math.min(max, data.length - offset);
    const isFinal = offset + len >= data.length ? 1 : 0;
    const nlen = (~len) & 0xffff;
    const head = new Uint8Array(5 + len);
    head[0] = isFinal;
    head[1] = len & 0xff;
    head[2] = (len >> 8) & 0xff;
    head[3] = nlen & 0xff;
    head[4] = (nlen >> 8) & 0xff;
    head.set(data.subarray(offset, offset + len), 5);
    blocks.push(head);
    offset += len;
  }
  return concat([new Uint8Array([0x78, 0x01]), concat(blocks), new Uint8Array(u32(adler32(data)))]);
}

/** Deterministic RGB PNG from RGBA (stored deflate blocks — stable encoder). */
export function encodeRgbaToPng(rgba, width, height) {
  const w = width | 0;
  const h = height | 0;
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = row + 1 + x * 3;
      raw[di] = rgba[si];
      raw[di + 1] = rgba[si + 1];
      raw[di + 2] = rgba[si + 2];
    }
  }
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = chunk('IHDR', new Uint8Array([...u32(w), ...u32(h), 8, 2, 0, 0, 0]));
  const idat = chunk('IDAT', zlibStore(raw));
  const iend = chunk('IEND', new Uint8Array(0));
  return concat([signature, ihdr, idat, iend]);
}

/**
 * Generate one deterministic procedural image (async for cancel/yield).
 * Cancellation throws AbortError before any result is returned — no partial asset.
 */
export async function generateProceduralImage(opts) {
  const prompt = String(opts.prompt ?? '');
  const seed = String(opts.seed ?? '');
  const width = Math.max(1, Math.min(2048, Math.round(Number(opts.width) || 256)));
  const height = Math.max(1, Math.min(2048, Math.round(Number(opts.height) || 256)));
  const signal = opts.signal;
  const onProgress = opts.onProgress || (() => {});

  checkAbort(signal);
  onProgress(0.05);

  const { digest, hex } = promptSeedDigest(prompt, seed);
  const params = digestToParams(digest);
  if (opts.forceGenerator && GENERATOR_FNS[opts.forceGenerator]) {
    params.generator = opts.forceGenerator;
  }

  checkAbort(signal);
  onProgress(0.12);
  await yieldTick();
  checkAbort(signal);

  const salt = (width + (height << 12)) >>> 0;
  const rng = rngFromDigest(digest, salt);

  onProgress(0.2);
  const rgba = renderRgba(params, width, height, rng, signal);
  checkAbort(signal);
  onProgress(0.75);
  await yieldTick();
  checkAbort(signal);

  for (let i = 0; i < rgba.length; i++) {
    const v = rgba[i];
    if (!Number.isFinite(v) || v < 0 || v > 255) {
      throw new Error(`invalid pixel value at ${i}: ${v}`);
    }
  }

  const png = encodeRgbaToPng(rgba, width, height);
  onProgress(0.95);
  checkAbort(signal);

  return {
    rgba,
    png,
    width,
    height,
    digestHex: hex,
    params: { ...params },
    generator: params.generator,
    seed,
    providerVersion: PROCEDURAL_PROVIDER_VERSION,
  };
}

/**
 * Create and optionally register the procedural provider.
 * @param {{ autoRegister?: boolean }} [opts]
 */
export function createProceduralProvider(opts = {}) {
  const provider = {
    id: PROCEDURAL_PROVIDER_ID,
    displayName: 'Procedural (offline)',
    requiresNetwork: false,

    async getCapabilities() {
      return {
        providerId: PROCEDURAL_PROVIDER_ID,
        displayName: 'Procedural (offline)',
        requiresNetwork: false,
        available: true,
        textToImage: true,
        imageToImage: false,
        models: [
          { id: 'procedural-auto', name: 'Auto (digest-selected)' },
          { id: 'procedural-fbm', name: 'fBm value-noise' },
          { id: 'procedural-truchet', name: 'Truchet tiles' },
          { id: 'procedural-gray-scott', name: 'Gray-Scott RD' },
        ],
        maxVariants: 4,
        maxDimension: 2048,
        outputFormats: ['png'],
        presets: SSTV_PRESETS,
        providerVersion: PROCEDURAL_PROVIDER_VERSION,
      };
    },

    async generate(request, genOpts = {}) {
      const signal = genOpts.signal;
      const onProgress = genOpts.onProgress || (() => {});
      const variants = Math.max(1, Math.min(4, request.variants || 1));
      const results = [];

      const forceMap = {
        'procedural-fbm': 'fbm',
        'procedural-truchet': 'truchet',
        'procedural-gray-scott': 'gray_scott',
      };
      const forceGenerator = forceMap[request.modelId] || undefined;

      for (let i = 0; i < variants; i++) {
        checkAbort(signal);
        const seedBase = request.seed != null ? String(request.seed) : '';
        const seed = variants > 1 ? `${seedBase}|v${i}` : seedBase;

        const img = await generateProceduralImage({
          prompt: request.prompt,
          seed,
          width: request.width || 256,
          height: request.height || 256,
          signal,
          forceGenerator,
          onProgress: (p) => onProgress((i + p) / variants),
        });

        results.push({
          schemaVersion: SCHEMA_VERSION,
          resultId: `proc-r-${img.digestHex.slice(0, 12)}-${i}`,
          variantIndex: i,
          asset: {
            schemaVersion: SCHEMA_VERSION,
            assetId: `proc-a-${img.digestHex.slice(0, 12)}-${i}`,
            bytes: img.png,
            mimeType: 'image/png',
            width: img.width,
            height: img.height,
            filename: `procedural-${img.generator}-${i}.png`,
            createdAt: 0,
          },
          providerMetadata: {
            model: request.modelId || 'procedural-auto',
            deterministic: true,
            providerVersion: PROCEDURAL_PROVIDER_VERSION,
            digestHex: img.digestHex,
            seed: img.seed,
            generator: img.generator,
            params: img.params,
            rgbaHash: hashRgba(img.rgba),
          },
        });
      }

      return {
        providerJobId: `proc-job-${results[0]?.providerMetadata?.digestHex?.slice(0, 16) || 'x'}`,
        results,
      };
    },
  };

  if (opts.autoRegister !== false) {
    registerProvider(provider);
  }
  return provider;
}
