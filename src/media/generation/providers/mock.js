/**
 * Deterministic mock image generation provider.
 * Produces valid PNG bytes offline for CI and local development.
 * No network. No secrets.
 */

import { registerProvider } from './registry.js';
import { SCHEMA_VERSION } from '../schemas.js';

/**
 * Build a minimal valid PNG (solid color) for the given dimensions.
 * Deterministic from prompt hash so tests are stable.
 * @param {number} width
 * @param {number} height
 * @param {string} prompt
 * @returns {Uint8Array}
 */
export function synthesizePng(width, height, prompt = '') {
  const w = Math.max(1, Math.min(2048, width | 0));
  const h = Math.max(1, Math.min(2048, height | 0));
  // Tiny 1x1 PNG then we still report requested dims in metadata;
  // for real visual preview we draw via canvas in the UI when needed.
  // Here we produce a correct minimal PNG whose IHDR matches dims when small,
  // or a 64x64 placeholder for large requests to keep tests light.
  const pw = w <= 64 ? w : 64;
  const ph = h <= 64 ? h : 64;

  const hash = simpleHash(prompt || 'mock');
  const r = (hash >> 16) & 0xff;
  const g = (hash >> 8) & 0xff;
  const b = hash & 0xff;

  return encodeSolidPng(pw, ph, r, g, b);
}

function simpleHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function chunk(type, data) {
  const typeB = [...type].map((c) => c.charCodeAt(0));
  const len = u32(data.length);
  const body = new Uint8Array([...typeB, ...data]);
  const crc = u32(crc32(body));
  return new Uint8Array([...len, ...body, ...crc]);
}

function encodeSolidPng(w, h, r, g, b) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const ihdr = chunk('IHDR', new Uint8Array([...u32(w), ...u32(h), 8, 2, 0, 0, 0]));

  // Raw image: filter byte 0 + RGB per pixel, then zlib-wrap naively (store blocks).
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0; // filter None
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 3;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
    }
  }
  const compressed = zlibStore(raw);
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', new Uint8Array(0));
  const out = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length);
  let o = 0;
  out.set(signature, o);
  o += signature.length;
  out.set(ihdr, o);
  o += ihdr.length;
  out.set(idat, o);
  o += idat.length;
  out.set(iend, o);
  return out;
}

/** Minimal zlib wrapper around a single stored (uncompressed) deflate block. */
function zlibStore(data) {
  const blocks = [];
  let offset = 0;
  const max = 65535;
  while (offset < data.length) {
    const len = Math.min(max, data.length - offset);
    const isFinal = offset + len >= data.length ? 1 : 0;
    const header = isFinal; // BFINAL=1 or 0, BTYPE=00
    const lenBytes = [len & 0xff, (len >> 8) & 0xff];
    const nlen = (~len) & 0xffff;
    const nlenBytes = [nlen & 0xff, (nlen >> 8) & 0xff];
    blocks.push(new Uint8Array([header, ...lenBytes, ...nlenBytes, ...data.subarray(offset, offset + len)]));
    offset += len;
  }
  const deflated = concat(blocks);
  // zlib header 78 01 (CMF/FLG) + deflated + adler32
  const adler = adler32(data);
  return concat([new Uint8Array([0x78, 0x01]), deflated, new Uint8Array(u32(adler))]);
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

/**
 * Create and optionally register the mock provider.
 * @param {{ autoRegister?: boolean, delayMs?: number }} [opts]
 */
export function createMockProvider(opts = {}) {
  const delayMs = opts.delayMs ?? 30;

  const provider = {
    id: 'mock',
    displayName: 'Mock (offline)',
    requiresNetwork: false,

    async getCapabilities() {
      return {
        providerId: 'mock',
        displayName: 'Mock (offline)',
        requiresNetwork: false,
        available: true,
        textToImage: true,
        imageToImage: true,
        models: [{ id: 'mock-solid', name: 'Solid Color Mock' }],
        maxVariants: 4,
        maxDimension: 2048,
        outputFormats: ['png', 'jpeg', 'webp'],
      };
    },

    /**
     * @param {import('../schemas.js').GenerationRequest} request
     * @param {{ signal?: AbortSignal, onProgress?: Function }} [genOpts]
     */
    async generate(request, genOpts = {}) {
      const signal = genOpts.signal;
      const onProgress = genOpts.onProgress || (() => {});

      const checkAbort = () => {
        if (signal?.aborted) {
          const err = new Error('cancelled');
          err.name = 'AbortError';
          throw err;
        }
      };

      checkAbort();
      onProgress(0.1);
      await sleep(delayMs, signal);
      checkAbort();
      onProgress(0.5);

      const variants = Math.max(1, Math.min(4, request.variants || 1));
      const results = [];
      for (let i = 0; i < variants; i++) {
        checkAbort();
        const seedPrompt = `${request.prompt}|v${i}|${request.seed || ''}`;
        const bytes = synthesizePng(request.width || 64, request.height || 64, seedPrompt);
        results.push({
          schemaVersion: SCHEMA_VERSION,
          resultId: `mock-r-${Date.now()}-${i}`,
          variantIndex: i,
          asset: {
            schemaVersion: SCHEMA_VERSION,
            assetId: `mock-a-${Date.now()}-${i}`,
            bytes,
            mimeType: 'image/png',
            width: request.width || 64,
            height: request.height || 64,
            filename: `mock-${i}.png`,
            createdAt: Date.now(),
          },
          providerMetadata: {
            model: request.modelId || 'mock-solid',
            deterministic: true,
          },
        });
        onProgress(0.5 + (0.5 * (i + 1)) / variants);
        await sleep(Math.max(5, delayMs / 2), signal);
      }

      return {
        providerJobId: `mock-job-${Date.now()}`,
        results,
      };
    },
  };

  if (opts.autoRegister !== false) {
    registerProvider(provider);
  }
  return provider;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error('cancelled');
      err.name = 'AbortError';
      reject(err);
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      const err = new Error('cancelled');
      err.name = 'AbortError';
      reject(err);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
