/**
 * BabelCodec Generation Gateway
 * Zero npm runtime dependencies. Node 18+.
 *
 * - Credentials only via environment
 * - CORS allowlist
 * - Rate limiting (per IP)
 * - Prompt / dimension validation
 * - No open proxy / arbitrary URL fetch from clients
 * - Synthetic PNG mode when UPSTREAM_URL is unset
 */

import http from 'node:http';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT || 8787);
const CORS_ORIGINS = String(process.env.CORS_ORIGINS || 'http://127.0.0.1:5500,http://localhost:5500')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
const UPSTREAM_URL = process.env.UPSTREAM_URL || '';
const UPSTREAM_API_KEY = process.env.UPSTREAM_API_KEY || '';
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 60000);
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 30);
const MAX_PROMPT_CHARS = Number(process.env.MAX_PROMPT_CHARS || 2000);
const MAX_DIMENSION = Number(process.env.MAX_DIMENSION || 2048);

/** @type {Map<string, { count: number, reset: number }>} */
const rate = new Map();

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

export function allowRate(ip, limit = RATE_LIMIT_PER_MIN, store = rate) {
  const now = Date.now();
  let e = store.get(ip);
  if (!e || now > e.reset) {
    e = { count: 0, reset: now + 60_000 };
    store.set(ip, e);
  }
  e.count += 1;
  return e.count <= limit;
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('body too large'), { code: 'BODY_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function checkAuth(req) {
  if (!GATEWAY_TOKEN) return true;
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return Boolean(m && m[1] === GATEWAY_TOKEN);
}

/** Deterministic tiny RGB PNG (no deps) for synthetic mode. */
export function syntheticPng(prompt, width, height, seed) {
  const w = Math.max(1, Math.min(MAX_DIMENSION, width | 0));
  const h = Math.max(1, Math.min(MAX_DIMENSION, height | 0));
  const material = `${prompt}\n${seed || ''}\n${w}x${h}`;
  const digest = createHash('sha256').update(material).digest();
  const r = digest[0];
  const g = digest[1];
  const b = digest[2];

  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const t = (x + y) % 32;
      const i = row + 1 + x * 3;
      raw[i] = (r + t) & 255;
      raw[i + 1] = (g + t * 2) & 255;
      raw[i + 2] = (b + t * 3) & 255;
    }
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
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n >>> 0, 0);
    return b;
  }
  function chunk(type, data) {
    const typeB = Buffer.from(type, 'ascii');
    const len = u32(data.length);
    const body = Buffer.concat([typeB, data]);
    const crc = u32(crc32(body));
    return Buffer.concat([len, body, crc]);
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

  const blocks = [];
  let offset = 0;
  const max = 65535;
  while (offset < raw.length) {
    const len = Math.min(max, raw.length - offset);
    const isFinal = offset + len >= raw.length ? 1 : 0;
    const nlen = (~len) & 0xffff;
    const head = Buffer.alloc(5);
    head[0] = isFinal;
    head.writeUInt16LE(len, 1);
    head.writeUInt16LE(nlen, 3);
    blocks.push(head, raw.subarray(offset, offset + len));
    offset += len;
  }
  const zlib = Buffer.concat([Buffer.from([0x78, 0x01]), ...blocks, u32(adler32(raw))]);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  const ihdr = chunk('IHDR', ihdrData);
  const idat = chunk('IDAT', zlib);
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

async function upstreamGenerate(body) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const headers = { 'Content-Type': 'application/json', Accept: 'image/png, application/json' };
    if (UPSTREAM_API_KEY) headers.Authorization = `Bearer ${UPSTREAM_API_KEY}`;
    const res = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`upstream ${res.status}`);
      err.code = 'UPSTREAM_ERROR';
      err.status = 502;
      err.detail = text.slice(0, 200);
      throw err;
    }
    const ctype = res.headers.get('content-type') || 'image/png';
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf, ctype };
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('upstream timeout');
      err.code = 'UPSTREAM_TIMEOUT';
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export function validateGenerate(obj) {
  if (!obj || typeof obj !== 'object') return 'body must be JSON object';
  const prompt = String(obj.prompt ?? '');
  if (!prompt.trim()) return 'prompt required';
  if (prompt.length > MAX_PROMPT_CHARS) return `prompt exceeds ${MAX_PROMPT_CHARS} chars`;
  const width = Number(obj.width ?? 512);
  const height = Number(obj.height ?? 512);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 'invalid dimensions';
  if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    return `dimensions must be 1..${MAX_DIMENSION}`;
  }
  if (obj.url || obj.target || obj.fetch_url || obj.endpoint) {
    return 'arbitrary URL fields are not allowed';
  }
  return null;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    setCors(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;

    try {
      if (req.method === 'GET' && path === '/health') {
        return json(res, 200, {
          ok: true,
          mode: UPSTREAM_URL ? 'upstream' : 'synthetic',
          version: '1',
        });
      }

      if (req.method === 'GET' && path === '/v1/capabilities') {
        return json(res, 200, {
          textToImage: true,
          imageToImage: false,
          models: [{ id: 'default', name: UPSTREAM_URL ? 'Upstream default' : 'Synthetic PNG' }],
          maxDimension: MAX_DIMENSION,
          maxPromptChars: MAX_PROMPT_CHARS,
          requiresAuth: Boolean(GATEWAY_TOKEN),
          mode: UPSTREAM_URL ? 'upstream' : 'synthetic',
        });
      }

      if (req.method === 'POST' && path === '/v1/generate') {
        const ip = clientIp(req);
        if (!allowRate(ip)) {
          return json(res, 429, { error: 'rate limit exceeded', code: 'RATE_LIMIT' });
        }
        if (!checkAuth(req)) {
          return json(res, 401, { error: 'unauthorized', code: 'UNAUTHORIZED' });
        }

        const raw = await readBody(req);
        let body;
        try {
          body = JSON.parse(raw.toString('utf8') || '{}');
        } catch {
          return json(res, 400, { error: 'invalid JSON', code: 'BAD_JSON' });
        }
        const verr = validateGenerate(body);
        if (verr) return json(res, 400, { error: verr, code: 'VALIDATION' });

        const width = Math.round(Number(body.width ?? 512));
        const height = Math.round(Number(body.height ?? 512));
        const prompt = String(body.prompt);
        const seed = body.seed != null ? String(body.seed) : '';
        const generationId = createHash('sha256')
          .update(`${prompt}\n${seed}\n${width}x${h}\n${Date.now()}`)
          .digest('hex')
          .slice(0, 16);

        // fix typo - use height not h
        void height;

        let buf;
        let ctype = 'image/png';
        if (UPSTREAM_URL) {
          const out = await upstreamGenerate({
            prompt,
            negative_prompt: body.negative_prompt || body.negativePrompt || '',
            width,
            height,
            seed,
            model: body.model || 'default',
          });
          buf = out.buf;
          ctype = out.ctype.startsWith('image/') ? out.ctype : 'image/png';
        } else {
          buf = syntheticPng(prompt, width, height, seed);
        }

        res.writeHead(200, {
          'Content-Type': ctype,
          'Content-Length': buf.length,
          'X-Generation-Id': generationId,
          'Cache-Control': 'no-store',
        });
        res.end(buf);
        return;
      }

      json(res, 404, { error: 'not found', code: 'NOT_FOUND' });
    } catch (e) {
      const status = e.status || 500;
      json(res, status, {
        error: e.message || 'internal error',
        code: e.code || 'INTERNAL',
      });
    }
  });
}

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const server = createServer();
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `BabelCodec generation gateway on :${PORT} mode=${UPSTREAM_URL ? 'upstream' : 'synthetic'} cors=${CORS_ORIGINS.join('|')}`,
    );
  });
}
