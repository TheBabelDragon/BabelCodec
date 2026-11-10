/**
 * Image Gen integration — navigation surface, gateway config, security invariants.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  clearJobs,
  clearProviders,
  clearTpuBackends,
  ensureGenerationDefaults,
  listProviderIds,
  getGatewayConfig,
  createGatewayProvider,
  submitGeneration,
  awaitJob,
  JOB_STATES,
} from '../../src/media/generation/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

beforeEach(() => {
  clearJobs();
  clearProviders();
  clearTpuBackends();
});

describe('Image Studio navigation registration', () => {
  it('index.html exposes Image Studio media tab and panel root', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    assert.match(html, /data-tab="media"/);
    assert.match(html, /Image Studio/);
    assert.match(html, /id="view-media"/);
    assert.match(html, /id="media-root"/);
  });

  it('studio-ui registers Generate mode', () => {
    const src = readFileSync(join(root, 'src/ui/studio-ui.js'), 'utf8');
    assert.match(src, /\['generate', 'Generate'\]/);
    assert.match(src, /buildGeneratePanel/);
  });

  it('app.js mounts media lab independently', () => {
    const src = readFileSync(join(root, 'src/ui/app.js'), 'utf8');
    assert.match(src, /createMediaLab/);
    assert.match(src, /viewMedia/);
    assert.match(src, /name !== 'media'/);
  });
});

describe('gateway configuration honesty', () => {
  it('reports unconfigured when no URL', () => {
    const cfg = getGatewayConfig();
    assert.equal(cfg.configured, false);
  });

  it('ensureGenerationDefaults does not register gateway without URL', () => {
    ensureGenerationDefaults();
    assert.ok(listProviderIds().includes('mock'));
    assert.ok(listProviderIds().includes('procedural'));
    assert.ok(!listProviderIds().includes('gateway'));
  });

  it('gateway provider capabilities available:false when unconfigured', async () => {
    const p = createGatewayProvider({ autoRegister: false });
    const caps = await p.getCapabilities();
    assert.equal(caps.available, false);
    assert.equal(caps.status, 'unconfigured');
    assert.match(String(caps.message), /gateway URL/i);
  });
});

describe('security: no secrets in client source', () => {
  it('client gateway module has no hardcoded api keys or sk- tokens', () => {
    const src = readFileSync(join(root, 'src/media/generation/providers/gateway.js'), 'utf8');
    assert.doesNotMatch(src, /sk-[a-zA-Z0-9]{10,}/);
    assert.doesNotMatch(src, /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i);
    assert.match(src, /Never embeds cloud API keys/i);
  });

  it('generation-ui does not embed provider credentials', () => {
    const src = readFileSync(join(root, 'src/ui/generation-ui.js'), 'utf8');
    assert.doesNotMatch(src, /sk-[a-zA-Z0-9]{10,}/);
    assert.doesNotMatch(src, /OPENAI_API_KEY|STABILITY_API_KEY/);
  });
});

describe('offline generation still works', () => {
  it('mock completes without network', async () => {
    ensureGenerationDefaults();
    const job = await submitGeneration({
      prompt: 'integration-check',
      providerId: 'mock',
      width: 32,
      height: 32,
    });
    const done = await awaitJob(job.jobId);
    assert.equal(done.state, JOB_STATES.COMPLETE);
    assert.ok(done.results[0].asset.bytes.length > 20);
  });
});
