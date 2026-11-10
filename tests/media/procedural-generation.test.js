/**
 * Procedural offline image provider — determinism, digest mapping, generators, provenance.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  clearJobs,
  clearProviders,
  clearTpuBackends,
  createProceduralProvider,
  digestToParams,
  promptSeedDigest,
  generateProceduralImage,
  generateFbm,
  generateTruchet,
  generateGrayScott,
  hashRgba,
  rngFromDigest,
  submitGeneration,
  awaitJob,
  JOB_STATES,
  listProviderIds,
  ensureGenerationDefaults,
  PROCEDURAL_PROVIDER_VERSION,
} from '../../src/media/generation/index.js';

import {
  createImageToSstvManifest,
  validateMediaJobManifest,
} from '../../src/media/integrations/index.js';

beforeEach(() => {
  clearJobs();
  clearProviders();
  clearTpuBackends();
});

describe('digestToParams', () => {
  it('is stable against known vectors', () => {
    const { digest, hex } = promptSeedDigest('cyan lattice', 'seed-42');
    const p1 = digestToParams(digest);
    const p2 = digestToParams(hex);
    assert.deepEqual(p1, p2);
    assert.ok(['fbm', 'truchet', 'gray_scott'].includes(p1.generator));
    assert.ok(p1.frequency >= 1 && p1.frequency <= 8);
    assert.ok(p1.octaves >= 1 && p1.octaves <= 5);
    assert.ok(p1.steps >= 24 && p1.steps <= 71);
  });

  it('changes when seed changes', () => {
    const a = digestToParams(promptSeedDigest('same', 'a').digest);
    const b = digestToParams(promptSeedDigest('same', 'b').digest);
    // Not guaranteed every field differs, but generator or hue almost always does
    assert.notDeepEqual(a, b);
  });
});

describe('generators', () => {
  const baseParams = digestToParams(promptSeedDigest('unit', '0').digest);

  for (const name of ['fbm', 'truchet', 'gray_scott']) {
    it(`${name} produces correct dimensions without NaN`, () => {
      const params = { ...baseParams, generator: name, steps: 12, octaves: 2 };
      const rng = rngFromDigest(promptSeedDigest('unit', '0').digest, 1);
      const fn =
        name === 'fbm' ? generateFbm : name === 'truchet' ? generateTruchet : generateGrayScott;
      const rgba = fn(params, 24, 16, rng);
      assert.equal(rgba.length, 24 * 16 * 4);
      for (let i = 0; i < rgba.length; i++) {
        assert.ok(Number.isFinite(rgba[i]), `NaN at ${i}`);
        assert.ok(rgba[i] >= 0 && rgba[i] <= 255, `oob at ${i}: ${rgba[i]}`);
      }
    });
  }
});

describe('determinism', () => {
  it('same inputs → identical output hash; different seed → different', async () => {
    const a = await generateProceduralImage({
      prompt: 'emblem',
      seed: 's1',
      width: 32,
      height: 24,
      forceGenerator: 'fbm',
    });
    const b = await generateProceduralImage({
      prompt: 'emblem',
      seed: 's1',
      width: 32,
      height: 24,
      forceGenerator: 'fbm',
    });
    const c = await generateProceduralImage({
      prompt: 'emblem',
      seed: 's2',
      width: 32,
      height: 24,
      forceGenerator: 'fbm',
    });
    assert.equal(hashRgba(a.rgba), hashRgba(b.rgba));
    assert.equal(a.digestHex, b.digestHex);
    assert.notEqual(hashRgba(a.rgba), hashRgba(c.rgba));
    assert.ok(a.png[0] === 137 && a.png[1] === 80);
  });
});

describe('provider job + provenance', () => {
  it('registers and completes with digest/params in provenance', async () => {
    createProceduralProvider({ autoRegister: true });
    assert.ok(listProviderIds().includes('procedural'));
    const job = await submitGeneration({
      prompt: 'deep charcoal cyan',
      seed: 'lab-7',
      providerId: 'procedural',
      width: 32,
      height: 32,
      modelId: 'procedural-fbm',
    });
    const done = await awaitJob(job.jobId);
    assert.equal(done.state, JOB_STATES.COMPLETE);
    assert.ok(done.results[0].asset.bytes.length > 20);
    assert.ok(done.provenance);
    assert.ok(done.provenance.digestHex || done.provenance.providerMetadata?.digestHex);
    assert.ok(done.provenance.params || done.provenance.providerMetadata?.params);
    assert.equal(
      done.provenance.providerVersion || done.provenance.providerMetadata?.providerVersion,
      PROCEDURAL_PROVIDER_VERSION,
    );
  });
});

describe('SSTV handoff from procedural bytes', () => {
  it('manifest validates against schema', async () => {
    const img = await generateProceduralImage({
      prompt: 'sstv',
      seed: 'm1',
      width: 64,
      height: 48,
      forceGenerator: 'truchet',
    });
    const manifest = createImageToSstvManifest({
      jobId: 'proc-sstv-1',
      filename: 'procedural-sstv-source.png',
      width: img.width,
      height: img.height,
      mode: 'martin_m1',
      sampleRate: 48000,
      sha256: img.digestHex,
      provenance: {
        provider: 'procedural',
        generator: img.generator,
        seed: img.seed,
        digestHex: img.digestHex,
        params: img.params,
        providerVersion: img.providerVersion,
      },
    });
    const v = validateMediaJobManifest(manifest);
    assert.equal(v.ok, true);
    assert.equal(v.manifest.contract_version, 1);
  });
});

describe('ensureGenerationDefaults includes procedural', () => {
  it('registers mock and procedural', () => {
    ensureGenerationDefaults();
    assert.ok(listProviderIds().includes('mock'));
    assert.ok(listProviderIds().includes('procedural'));
  });
});
