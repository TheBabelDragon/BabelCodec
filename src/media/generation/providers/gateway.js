/**
 * Remote generation gateway client (browser).
 * Never embeds cloud API keys — only an optional lab bearer and gateway base URL
 * from runtime config (window / localStorage).
 */

import { registerProvider } from './registry.js';
import { SCHEMA_VERSION } from '../schemas.js';

export const GATEWAY_PROVIDER_ID = 'gateway';
export const GATEWAY_PROVIDER_VERSION = '1.0.0';

const LS_URL = 'babelcodec.gen.gatewayUrl';
const LS_TOKEN = 'babelcodec.gen.gatewayToken';

/**
 * Read gateway configuration from runtime only.
 * @returns {{ url: string|null, token: string|null, configured: boolean }}
 */
export function getGatewayConfig() {
  let url = null;
  let token = null;
  try {
    if (typeof window !== 'undefined' && window.BabelCodecGenConfig) {
      const c = window.BabelCodecGenConfig;
      if (c.gatewayUrl) url = String(c.gatewayUrl).replace(/\/$/, '');
      if (c.token) token = String(c.token);
      if (c.enabled === false) return { url: null, token: null, configured: false };
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      if (!url) {
        const v = localStorage.getItem(LS_URL);
        if (v) url = String(v).replace(/\/$/, '');
      }
      if (!token) {
        const t = localStorage.getItem(LS_TOKEN);
        if (t) token = String(t);
      }
    }
  } catch {
    /* private mode */
  }
  if (url && !/^https?:\/\//i.test(url)) {
    url = null;
  }
  return { url, token, configured: Boolean(url) };
}

export function setGatewayConfig({ url, token } = {}) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (url == null || url === '') localStorage.removeItem(LS_URL);
    else localStorage.setItem(LS_URL, String(url).replace(/\/$/, ''));
    if (token == null || token === '') localStorage.removeItem(LS_TOKEN);
    else localStorage.setItem(LS_TOKEN, String(token));
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ autoRegister?: boolean, baseUrl?: string, token?: string }} [opts]
 */
export function createGatewayProvider(opts = {}) {
  const provider = {
    id: GATEWAY_PROVIDER_ID,
    displayName: 'Gateway (remote)',
    requiresNetwork: true,

    async getCapabilities() {
      const cfg = getGatewayConfig();
      const base = opts.baseUrl || cfg.url;
      if (!base) {
        return {
          providerId: GATEWAY_PROVIDER_ID,
          displayName: 'Gateway (remote)',
          requiresNetwork: true,
          available: false,
          textToImage: true,
          models: [],
          status: 'unconfigured',
          message:
            'No gateway URL configured. Set localStorage babelcodec.gen.gatewayUrl or window.BabelCodecGenConfig.gatewayUrl. Offline mock/procedural remain available.',
          providerVersion: GATEWAY_PROVIDER_VERSION,
        };
      }
      try {
        const headers = {};
        const token = opts.token || cfg.token;
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${base}/v1/capabilities`, { headers });
        if (!res.ok) throw new Error(`capabilities ${res.status}`);
        const data = await res.json();
        return {
          providerId: GATEWAY_PROVIDER_ID,
          displayName: 'Gateway (remote)',
          requiresNetwork: true,
          available: true,
          textToImage: data.textToImage !== false,
          models: data.models || [{ id: 'default', name: 'Default' }],
          maxDimension: data.maxDimension || 2048,
          status: data.mode || 'ready',
          providerVersion: GATEWAY_PROVIDER_VERSION,
        };
      } catch (e) {
        return {
          providerId: GATEWAY_PROVIDER_ID,
          displayName: 'Gateway (remote)',
          requiresNetwork: true,
          available: false,
          textToImage: true,
          models: [{ id: 'default', name: 'Default' }],
          status: 'unreachable',
          message: String(e.message || e),
          providerVersion: GATEWAY_PROVIDER_VERSION,
        };
      }
    },

    async generate(request, genOpts = {}) {
      const cfg = getGatewayConfig();
      const base = opts.baseUrl || cfg.url;
      if (!base) {
        throw Object.assign(new Error('Gateway URL not configured'), { code: 'GATEWAY_UNCONFIGURED' });
      }
      const token = opts.token || cfg.token;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${base}/v1/generate`, {
        method: 'POST',
        headers,
        signal: genOpts.signal,
        body: JSON.stringify({
          prompt: request.prompt,
          negative_prompt: request.negativePrompt || '',
          width: request.width || 512,
          height: request.height || 512,
          seed: request.seed != null ? String(request.seed) : '',
          model: request.modelId || 'default',
        }),
      });

      if (!res.ok) {
        let detail = '';
        try {
          const j = await res.json();
          detail = j.error || j.code || '';
        } catch {
          detail = await res.text().catch(() => '');
        }
        throw Object.assign(new Error(`gateway ${res.status}${detail ? ': ' + detail : ''}`), {
          code: 'GATEWAY_HTTP',
          status: res.status,
        });
      }

      const ctype = res.headers.get('content-type') || 'image/png';
      if (!ctype.startsWith('image/')) {
        throw Object.assign(new Error('gateway returned non-image content-type'), {
          code: 'GATEWAY_BAD_TYPE',
        });
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > 12 * 1024 * 1024) {
        throw Object.assign(new Error('gateway image exceeds size limit'), { code: 'GATEWAY_TOO_LARGE' });
      }
      const generationId = res.headers.get('x-generation-id') || `gw-${Date.now()}`;

      return {
        providerJobId: generationId,
        results: [
          {
            schemaVersion: SCHEMA_VERSION,
            resultId: `gw-r-${generationId}`,
            variantIndex: 0,
            asset: {
              schemaVersion: SCHEMA_VERSION,
              assetId: `gw-a-${generationId}`,
              bytes: buf,
              mimeType: ctype,
              width: request.width || 512,
              height: request.height || 512,
              filename: `gateway-${generationId}.png`,
              createdAt: Date.now(),
            },
            providerMetadata: {
              model: request.modelId || 'default',
              gateway: true,
              generationId,
              providerVersion: GATEWAY_PROVIDER_VERSION,
            },
          },
        ],
      };
    },
  };

  if (opts.autoRegister !== false) {
    registerProvider(provider);
  }
  return provider;
}
