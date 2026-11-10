/**
 * Deterministic, seed-driven procedural image provider.
 * Fully offline. Zero new dependencies.
 * Same prompt + seed + params → byte-identical RGBA/PNG on every run.
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

/**
 * Map a 32-byte SHA-256 digest to generator parameters.
 * Pure and unit-testable; fields depend only on digest bytes.
 * @param {Uint8Array|string} digest
 * @returns {object}
 */
export function digestToParams(digest) {
  const b = normalizeDigest(digest);
  return {
    generator: GENERATORS[b[0] % GENERATORS.length],
    hue: (b[1] / 255) * 360,
    sat: 0.4 + (b[2] / 255) * 0.5,
    light: 0.35 + (b[3] / 255) * 0.35,
    frequency: 1 + (b[4] / 255) * 7,
    octaves: 1 + (b[5] % 5),
    lacunarity: 1.5 + (b[6] / 255) * 1.5,
    gain: 0.4 + (b[7] / 255) * 0.3,
    symmetry: b[8] % 4,
    warpStrength: (b[9] / 255) * 0.5,
    tileSize: 8 + (b[10] % 24),
    steps: 24 + (b[11] % 48),
    feed: 0.02 + (b[12] / 255) * 0.05,
    kill: 0.045 + (b[13] / 255) * 0.025,
    paletteShift: b[14] / 255,
    contrast: 0.7 + (b[15] / 255) * 0.5,
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

/** sfc32 PRNG — no Math.random / Date. */
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

export function rngFromDigest(digest, salt = 0) {
  const b = normalizeDigest(digest);
  const u = (i) =>
    ((b[i % 32] << 24) | (b[(i + 1) % 32] << 16) | (b[(i + 2) % 32] << 8) | b[(i + 3) % 32]) >>> 0;
  const s = salt >>> 0;
  return sfc32(u(0) ^ s, u(4) ^ Math.imul(s, 0x9e3779b9), u(8), u(12));
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
  return Math.max(0, Math.min(255, v | 0));
}

function hslToRgb(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
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
  const u = Math.max(0, Math.min(1, t));
  const h = params.hue + u * 80 + params.paletteShift * 60;
  const l = params.light * (0.55 + u * params.contrast);
  return hslToRgb(h, params.sat, Math.max(0.05, Math.min(0.92, l)));
}

function applySymmetry(x, y, w, h, symmetry) {
  let xx = x;
  let yy = y;
  if (symmetry === 1 || symmetry === 3) {
    if (xx >= w / 2) xx = w - 1 - xx;
  }
  if (symmetry === 2 || symmetry === 3) {
    if (yy >= h / 2) yy = h - 1 - yy;
  }
  return { x: xx, y: yy };
}

function valueNoise2D(x, y, table) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2(x0, y0, table);
  const n10 = hash2(x0 + 1, y0, table);
  const n01 = hash2(x0, y0 + 1, table);
  const n11 = hash2(x0 + 1, y0 + 1, table);
  const nx0 = n00 * (1 - sx) + n10 * sx;
  const nx1 = n01 * (1 - sx) + n11 * sx;
  return nx0 * (1 - sy) + nx1 * sy;
}

function hash2(ix, iy, table) {
  const n = ((ix * 374761393) ^ (iy * 668265263)) >>> 0;
  return table[n % table.length];
}

function buildNoiseTable(rng, size = 256) {
  const t = new Float64Array(size);
  for (let i = 0; i < size; i++) t[i] = rng();
  return t;
}

/** fBm / value-noise field with palette ramp. */
export function generateFbm(params, width, height, rng) {
  const table = buildNoiseTable(rng, 256);
  const out = new Uint8ClampedArray(width * height * 4);
  const freq = params.frequency;
  const octaves = params.octaves;
  const lac = params.lacunarity;
  const gain = params.gain;
  const warp = params.warpStrength;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = applySymmetry(x, y, width, height, params.symmetry);
      let nx = (s.x / width) * freq;
      let ny = (s.y / height) * freq;
      if (warp > 0) {
        const wx = valueNoise2D(nx + 3.1, ny + 1.7, table);
        const wy = valueNoise2D(nx - 1.3, ny + 4.2, table);
        nx += (wx - 0.5) * warp * 2;
        ny += (wy - 0.5) * warp * 2;
      }
      let amp = 1;
      let f = 1;
      let sum = 0;
      let norm = 0;
      for (let o = 0; o < octaves; o++) {
        sum += valueNoise2D(nx * f, ny * f, table) * amp;
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

/** Truchet tile pattern (quarter-circle arcs). */
export function generateTruchet(params, width, height, rng) {
  const tile = Math.max(4, params.tileSize | 0);
  const cols = Math.ceil(width / tile);
  const rows = Math.ceil(height / tile);
  const orient = new Uint8Array(cols * rows);
  for (let i = 0; i < orient.length; i++) orient[i] = rng() < 0.5 ? 0 : 1;

  const out = new Uint8ClampedArray(width * height * 4);
  const bg = palette(0.15, params);
  const fg = palette(0.85, params);
  const thickness = Math.max(1, Math.floor(tile * 0.18));
  const r0 = tile / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = applySymmetry(x, y, width, height, params.symmetry);
      const cx = Math.floor(s.x / tile);
      const cy = Math.floor(s.y / tile);
      const lx = s.x - cx * tile;
      const ly = s.y - cy * tile;
      const o = orient[(cy % rows) * cols + (cx % cols)];
      const d1 = Math.hypot(lx, ly);
      const d2 = Math.hypot(lx - tile, ly - tile);
      const d3 = Math.hypot(lx - tile, ly);
      const d4 = Math.hypot(lx, ly - tile);
      const on =
        o === 0
          ? Math.abs(d1 - r0) <= thickness || Math.abs(d2 - r0) <= thickness
          : Math.abs(d3 - r0) <= thickness || Math.abs(d4 - r0) <= thickness;
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

/** Gray-Scott reaction-diffusion with capped deterministic steps. */
export function generateGrayScott(params, width, height, rng) {
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
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad) continue;
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
  const F = params.feed;
  const K = params.kill;
  const steps = Math.max(8, Math.min(120, params.steps | 0));

  const lap = (arr, x, y) => {
    const xm = (x - 1 + width) % width;
    const xp = (x + 1) % width;
    const ym = (y - 1 + height) % height;
    const yp = (y + 1) % height;
    const c = arr[y * width + x];
    return (
      arr[y * width + xm] +
      arr[y * width + xp] +
      arr[ym * width + x] +
      arr[yp * width + x] -
      4 * c
    );
  };

  for (let step = 0; step < steps; step++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const u = U[i];
        const v = V[i];
        const uvv = u * v * v;
        Un[i] = u + Du * lap(U, x, y) - uvv + F * (1 - u);
        Vn[i] = v + Dv * lap(V, x, y) + uvv - (F + K) * v;
      }
    }
    const tU = U;
    U = Un;
    Un = tU;
    const tV = V;
    V = Vn;
    Vn = tV;
  }

  let vmin = Infinity;
  let vmax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (V[i] < vmin) vmin = V[i];
    if (V[i] > vmax) vmax = V[i];
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
  gray_scott: generateGrayScott,
};

export function renderRgba(params, width, height, rng) {
  const fn = GENERATOR_FNS[params.generator] || generateFbm;
  return fn(params, width, height, rng);
}

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
    blocks.push(
      new Uint8Array([
        isFinal,
        len & 0xff,
        (len >> 8) & 0xff,
        nlen & 0xff,
        (nlen >> 8) & 0xff,
        ...data.subarray(offset, offset + len),
      ]),
    );
    offset += len;
  }
  return concat([new Uint8Array([0x78, 0x01]), concat(blocks), new Uint8Array(u32(adler32(data)))]);
}

/** Encode RGB PNG from RGBA buffer. */
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

  // Gray-Scott is heavier — yield mid-run via chunked steps not needed for small sizes
  onProgress(0.2);
  const rgba = renderRgba(params, width, height, rng);
  checkAbort(signal);
  onProgress(0.75);
  await yieldTick();
  checkAbort(signal);

  // Validate buffer
  for (let i = 0; i < rgba.length; i++) {
    const v = rgba[i];
    if (!Number.isFinite(v) || v < 0 || v > 255) {
      throw new Error(`invalid pixel value at ${i}: ${v}`);
    }
  }

  const png = encodeRgbaToPng(rgba, width, height);
  onProgress(0.95);

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
