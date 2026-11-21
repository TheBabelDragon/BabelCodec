/**
 * BabelCodec MCP Server configuration.
 * Secrets and limits come from environment only. Never embed credentials.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  for (const p of [join(__dirname, '.env'), join(__dirname, '..', '..', '.env')]) {
    if (!existsSync(p)) continue;
    try {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq <= 0) continue;
        const key = t.slice(0, eq).trim();
        let val = t.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = val;
      }
    } catch { /* ignore */ }
  }
}
loadDotEnv();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

/** Only honor X-Forwarded-For when the direct peer is in this list. Empty = never trust XFF. */
const TRUSTED_PROXIES = String(process.env.TRUSTED_PROXIES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const config = Object.freeze({
  NODE_ENV,
  isProduction,
  HOST: process.env.MCP_HOST || process.env.HOST || '127.0.0.1',
  PORT: Number(process.env.MCP_PORT || process.env.PORT || 8790),
  MCP_TOKEN: process.env.MCP_TOKEN || process.env.GATEWAY_TOKEN || '',
  REQUIRE_AUTH:
    process.env.REQUIRE_AUTH === 'true' ||
    (isProduction && process.env.REQUIRE_AUTH !== 'false'),
  MAX_BODY_BYTES: Number(process.env.MAX_BODY_BYTES || 256 * 1024),
  MAX_TEXT_CHARS: Number(process.env.MAX_TEXT_CHARS || 100_000),
  RATE_LIMIT_PER_MIN: Number(process.env.RATE_LIMIT_PER_MIN || 60),
  CORS_ORIGINS: String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  TRUSTED_PROXIES,
  MCP_PATH: process.env.MCP_PATH || '/mcp',
  HEALTH_PATH: process.env.HEALTH_PATH || '/health',
  SERVER_NAME: 'babelcodec-mcp-server',
  SERVER_VERSION: '0.1.1',
  REPO_ROOT: join(__dirname, '..', '..'),
});

export default config;
