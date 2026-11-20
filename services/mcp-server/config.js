/**
 * BabelCodec MCP Server configuration.
 * All secrets and operational limits come from environment variables.
 * Never embed credentials in source.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Soft-load .env from service dir or monorepo root (dev convenience only). */
function loadDotEnv() {
  const candidates = [
    join(__dirname, '.env'),
    join(__dirname, '..', '..', '.env'),
  ];
  for (const p of candidates) {
    if (!existsSync(p)) continue;
    try {
      const text = readFileSync(p, 'utf8');
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq <= 0) continue;
        const key = t.slice(0, eq).trim();
        let val = t.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
      }
    } catch {
      /* ignore unreadable .env */
    }
  }
}

loadDotEnv();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

export const config = Object.freeze({
  NODE_ENV,
  isProduction,

  /** Listen host (default 127.0.0.1 for local safety; set 0.0.0.0 in controlled prod). */
  HOST: process.env.MCP_HOST || process.env.HOST || '127.0.0.1',

  /** Listen port. */
  PORT: Number(process.env.MCP_PORT || process.env.PORT || 8790),

  /**
   * Bearer token for authentication.
   * - Development: optional (empty = open).
   * - Production: mandatory (server refuses to start if empty when REQUIRE_AUTH=true or NODE_ENV=production).
   */
  MCP_TOKEN: process.env.MCP_TOKEN || process.env.GATEWAY_TOKEN || '',

  /**
   * When true, reject requests without a valid Bearer token.
   * Forced true in production if not explicitly set.
   */
  REQUIRE_AUTH:
    process.env.REQUIRE_AUTH === 'true' ||
    (isProduction && process.env.REQUIRE_AUTH !== 'false'),

  /** Max request body size in bytes. */
  MAX_BODY_BYTES: Number(process.env.MAX_BODY_BYTES || 256 * 1024),

  /** Max input text length (characters) for tool arguments. */
  MAX_TEXT_CHARS: Number(process.env.MAX_TEXT_CHARS || 100_000),

  /** Per-client requests per minute (sliding window). */
  RATE_LIMIT_PER_MIN: Number(process.env.RATE_LIMIT_PER_MIN || 60),

  /**
   * Comma-separated allowed Origin values for browser clients.
   * Empty = no CORS headers (server-to-server / non-browser only).
   */
  CORS_ORIGINS: String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** MCP path prefix. */
  MCP_PATH: process.env.MCP_PATH || '/mcp',

  /** Health path. */
  HEALTH_PATH: process.env.HEALTH_PATH || '/health',

  /** Server identity. */
  SERVER_NAME: 'babelcodec-mcp-server',
  SERVER_VERSION: '0.1.0',

  /** Path to monorepo root (for importing BabelCodec modules). */
  REPO_ROOT: join(__dirname, '..', '..'),
});

export default config;
