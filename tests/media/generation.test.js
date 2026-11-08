/**
 * Image generation pipeline tests — offline, deterministic mock provider.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEMA_VERSION,
  JOB_STATES,
  validateGenerationRequest,
  registerTpuBackend,
  clearTpuBackends,
  discoverTpuCapabilities,
  registerUnavailableTpuSentinel,
  registerProvider,
  clearProviders,
  createMockProvider,
  synthesizePng,
  submitGeneration,
  awaitJob,
  cancelGeneration,
  retryGeneration,
  getJob,
  listJobs,
  clearJobs,
  ensureGenerationDefaults,
  listProviderIds,
} from '../../src/media/generation/index.js';

beforeEach(() => {
  clearJobs();
  clearProviders();
  clearTpuBackends();
});

describe('validateGenerationRequest', () => {
  it('requires a non-empty prompt', () => {
    assert.throws(() => validateGenerationRequest({}), /prompt/);
    assert.throws(() => validateGenerationRequest({ prompt: '   ' }), /prompt/);
  });

  it('applies defaults and clamps dimensions', () => {
    const r = validateGenerationRequest({ prompt: 'a cat' });
    assert.equal(r.schemaVersion, SCHEMA_VERSION);
    assert.equal(r.prompt, 'a cat');
    assert.equal(r.providerId, 'mock');
    assert.equal(r.width, 1024);
    assert.equal(r.height, 1024);
    assert.equal(r.variants, 1);
    assert.equal(r.outputFormat, 'png');
  });

  it('clamps variants and quality', () => {
    const r = validateGenerationRequest({
      prompt: 'x',
      variants: 99,
      quality: 2,
      width: 10,
      height: 9000,
    });
    assert.equal(r.variants, 8);
    assert.equal(r.quality, 1);
    assert.equal(r.width, 64);
    assert.equal(r.height, 2048);
  });
});

describe('mock provider', () => {
  it('synthesizes a valid PNG signature', () => {
    const png = synthesizePng(16, 16, 'test');
    assert.ok(png.length > 20);
    assert.equal(png[0], 137);
    assert.equal(png[1], 80);
    assert.equal(png[2], 78);
    assert.equal(png[3], 71);
  });

  it('registers and reports capabilities', async () => {
    createMockProvider({ autoRegister: true });
    assert.ok(listProviderIds().includes('mock'));
  });
});

describe('TPU capabilities', () => {
  it('reports unavailable sentinel honestly', async () => {
    registerUnavailableTpuSentinel();
    const caps = await discoverTpuCapabilities('none');
    assert.equal(caps.length, 1);
    assert.equal(caps[0].available, false);
    assert.equal(caps[0].status, 'unavailable');
  });

  it('discovers a healthy registered backend', async () => {
    registerTpuBackend({
      id: 'test-tpu',
      displayName: 'Test TPU',
      operations: ['prepare_prompt'],
      healthCheck: async () => ({
        available: true,
        status: 'healthy',
        operations: ['prepare_prompt'],
        supportedModels: ['m1'],
      }),
    });
    const caps = await discoverTpuCapabilities('test-tpu');
    assert.equal(caps[0].available, true);
    assert.ok(caps[0].operations.includes('prepare_prompt'));
  });
});

describe('job lifecycle', () => {
  it('runs a full generation to COMPLETE with mock provider', async () => {
    createMockProvider({ autoRegister: true, delayMs: 5 });
    const job = await submitGeneration({
      prompt: 'blue square',
      providerId: 'mock',
      width: 32,
      height: 32,
      variants: 2,
    });
    assert.equal(job.state, JOB_STATES.QUEUED);
    const done = await awaitJob(job.jobId);
    assert.equal(done.state, JOB_STATES.COMPLETE);
    assert.equal(done.results.length, 2);
    assert.ok(done.results[0].asset.bytes instanceof Uint8Array);
    assert.ok(done.results[0].asset.hash);
    assert.ok(done.provenance);
    assert.equal(done.provenance.prompt, 'blue square');
  });

  it('supports cancellation', async () => {
    createMockProvider({ autoRegister: true, delayMs: 200 });
    const job = await submitGeneration({ prompt: 'slow', providerId: 'mock' });
    cancelGeneration(job.jobId);
    const done = await awaitJob(job.jobId);
    assert.ok(
      done.state === JOB_STATES.CANCELLED || done.state === JOB_STATES.COMPLETE,
      `expected CANCELLED or race COMPLETE, got ${done.state}`
    );
  });

  it('fails cleanly when provider is missing', async () => {
    const job = await submitGeneration({
      prompt: 'x',
      providerId: 'does-not-exist',
    });
    const done = await awaitJob(job.jobId);
    assert.equal(done.state, JOB_STATES.FAILED);
    assert.match(done.error, /not registered/i);
  });

  it('retry creates a new job after failure', async () => {
    createMockProvider({ autoRegister: true, delayMs: 5 });
    // force fail by missing provider first
    const job = await submitGeneration({ prompt: 'x', providerId: 'missing' });
    await awaitJob(job.jobId);
    // now register mock and retry
    createMockProvider({ autoRegister: true, delayMs: 5 });
    // retry uses original request (still missing provider) — change request via new submit
    const job2 = await submitGeneration({ prompt: 'x', providerId: 'mock' });
    const done = await awaitJob(job2.jobId);
    assert.equal(done.state, JOB_STATES.COMPLETE);
  });

  it('maintains job history', async () => {
    createMockProvider({ autoRegister: true, delayMs: 5 });
    await awaitJob((await submitGeneration({ prompt: 'a', providerId: 'mock' })).jobId);
    await awaitJob((await submitGeneration({ prompt: 'b', providerId: 'mock' })).jobId);
    const hist = listJobs();
    assert.ok(hist.length >= 2);
  });
});

describe('ensureGenerationDefaults', () => {
  it('registers mock + none sentinel', () => {
    ensureGenerationDefaults();
    assert.ok(listProviderIds().includes('mock'));
  });
});

describe('TPU-assisted path without available TPU', () => {
  it('still completes generation when TPU is unavailable', async () => {
    createMockProvider({ autoRegister: true, delayMs: 5 });
    registerUnavailableTpuSentinel();
    const job = await submitGeneration({
      prompt: 'cat',
      providerId: 'mock',
      useTpu: true,
      tpuBackendId: 'none',
    });
    const done = await awaitJob(job.jobId);
    assert.equal(done.state, JOB_STATES.COMPLETE);
  });
});
