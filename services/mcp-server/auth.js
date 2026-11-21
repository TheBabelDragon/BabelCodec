/**
 * Authentication, rate limiting, trusted-proxy client identity, CORS.
 */

import { config } from './config.js';
import { ErrorCode, httpErrorBody } from './errors.js';

/** @type {Map<string, { count: number, reset: number }>} */
const rateStore = new Map();

function normalizeIp(ip) {
  if (!ip) return 'unknown';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

/** True if peer is an exact match in TRUSTED_PROXIES (no CIDR expansion in v0.1.1). */
function isTrustedProxy(peer) {
  if (!config.TRUSTED_PROXIES.length) return false;
  const p = normalizeIp(peer);
  return config.TRUSTED_PROXIES.some((t) => normalizeIp(t) === p);
}

/**
 * Client identity for rate limiting.
 * Never trust X-Forwarded-For unless the direct socket peer is a configured trusted proxy.
 */
export function clientKey(req) {
  const peer = normalizeIp(req.socket?.remoteAddress || 'unknown');
  if (isTrustedProxy(peer)) {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length) {
      return normalizeIp(xf.split(',')[0].trim()) || peer;
    }
  }
  return peer;
}

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
      'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID, Accept',
    );
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

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

export function assertTextLength(text, max = config.MAX_TEXT_CHARS) {
  if (typeof text !== 'string') {
    return { ok: false, message: 'text must be a string' };
  }
  if (text.length > max) {
    return { ok: false, message: `text exceeds maximum length of ${max} characters` };
  }
  return { ok: true };
}

export function assertProductionAuthConfig() {
  if (config.isProduction && config.REQUIRE_AUTH && !config.MCP_TOKEN) {
    return {
      ok: false,
      message: 'production requires MCP_TOKEN when REQUIRE_AUTH is enabled',
    };
  }
  return { ok: true };
}
