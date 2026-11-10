/**
 * Generate workspace status helpers (gateway config honesty).
 */
import {
  getGatewayConfig,
  setGatewayConfig,
  ensureGenerationDefaults,
} from '../media/generation/index.js';

export function describeGatewayStatus() {
  const cfg = getGatewayConfig();
  if (!cfg.configured) {
    return {
      className: 'gen-config-banner gen-config-off',
      text:
        'Offline mode: mock + procedural work with no network. Optional remote gateway is not configured (docs/IMAGE_GEN_SETUP.md).',
    };
  }
  return {
    className: 'gen-config-banner gen-config-ok',
    text: `Remote gateway configured: ${cfg.url} — offline providers still available.`,
  };
}

export function saveGatewayUrl(url) {
  setGatewayConfig({ url: url || null });
  ensureGenerationDefaults();
  return getGatewayConfig();
}

export { getGatewayConfig, setGatewayConfig };
