/**
 * Authentication, rate limiting, and request guards for the MCP server.
 */

import { config } from './config.js';
import { ErrorCode, httpErrorBody } from './errors.js';

/** @type {Map<string, { count: number, reset: number }>} */
const rateStore = new Map();

export function clientKey(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Sliding 60s window rate limit. Returns true if allowed.
 */
export function allowRate(key, limit = config.RATE_LIMIT_PER_MIN, store = rateStore) {
  const now = Date.now();
  let e = store.get(key);
  if (!e || now > e.reset) {
    e = { count: 0, reset: now + 60_000 };
    store.set(key, e);
  }
  e.count += 1;
  return e.count <= limit;
}

/**
 * Bearer token check. When REQUIRE_AUTH is false and no token configured, allow.
 */
export function checkAuth(req) {
  if (!config.REQUIRE_AUTH && !config.MCP_TOKEN) return true;
  if (!config.MCP_TOKEN) return false;
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return Boolean(m && m[1] === config.MCP_TOKEN);
}

export function setCors(req, res) {
  const origin = req.headers.origin;
  if (!origin || config.CORS_ORIGINS.length === 0) return;
  if (config.CORS_ORIGINS.includes(origin) || config.CORS_ORIGINS.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', origin === '*' ? '*' : origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID',
    );
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

/**
 * Read body with size limit. Rejects oversized payloads.
 */
export function readBody(req, limit = config.MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        const err = new Error('body too large');
        err.code = ErrorCode.BODY_TOO_LARGE;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Guard middleware-style helper. Returns an error body or null if ok.
 */
export function preflightGuards(req) {
  const key = clientKey(req);
  if (!allowRate(key)) {
    return { status: 429, body: httpErrorBody(ErrorCode.RATE_LIMIT, 'rate limit exceeded', 429) };
  }
  if (!checkAuth(req)) {
    return { status: 401, body: httpErrorBody(ErrorCode.UNAUTHORIZED, 'unauthorized', 401) };
  }
  return null;
}

/**
 * Validate that text input respects length limits.
 */
export function assertTextLength(text, max = config.MAX_TEXT_CHARS) {
  if (typeof text !== 'string') {
    return { ok: false, message: 'text must be a string' };
  }
  if (text.length > max) {
    return { ok: false, message: `text exceeds maximum length of ${max} characters` };
  }
  return { ok: true };
}
