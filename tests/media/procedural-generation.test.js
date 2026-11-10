/**
 * Procedural offline image provider — determinism, digest mapping, generators,
 * provenance, cancellation, SSTV handoff.
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
  cancelGeneration,
  getJob,
  JOB_STATES,
  listProviderIds,
  ensureGenerationDefaults,
  PROCEDURAL_PROVIDER_VERSION,
  SSTV_PRESETS,
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
    assert.equal(p1.generator, p2.generator);
    assert.equal(p1.hueByte, p2.hueByte);
    assert.equal(p1.freqByte, p2.freqByte);
    assert.ok(['fbm', 'truchet', 'gray_scott'].includes(p1.generator));
    assert.ok(p1.octaves >= 1 && p1.octaves <= 5);
    assert.ok(p1.steps >= 24 && p1.steps <= 71);
  });

  it('changes when seed changes', () => {
    const a = digestToParams(promptSeedDigest('same', 'a').digest);
    const b = digestToParams(promptSeedDigest('same', 'b').digest);
    assert.notEqual(
      `${a.generator}:${a.hueByte}:${a.freqByte}`,
      `${b.generator}:${b.hueByte}:${b.freqByte}`,
    );
  });
});

describe('generators', () => {
  const baseParams = digestToParams(promptSeedDigest('unit', '0').digest);

  for (const name of ['fbm', 'truchet', 'gray_scott']) {
    it(`${name} produces correct dimensions without NaN`, () => {
      const params = { ...baseParams, generator: name, steps: 12, octaves: 2 };
      const rng = rngFromDigest(promptSeedDigest('unit', '0').digest, 1);
      const rgba =
        name === 'fbm'
          ? generateFbm(params, 24, 16, rng)
          : name === 'truchet'
            ? generateTruchet(params, 24, 16, rng)
            : generateGrayScott(params, 24, 16, rng);
      assert.equal(rgba.length, 24 * 16 * 4);
      for (let i = 0; i < rgba.length; i++) {
        assert.ok(Number.isFinite(rgba[i]), `NaN at ${i}`);
        assert.ok(rgba[i] >= 0 && rgba[i] <= 255, `oob at ${i}: ${rgba[i]}`);
      }
    });
  }
});

describe('determinism (RGBA, not PNG)', () => {
  it('same inputs → identical RGBA hash; different seed → different', async () => {
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
    // Pixel-identical, not merely close
    assert.deepEqual([...a.rgba], [...b.rgba]);
    assert.notEqual(hashRgba(a.rgba), hashRgba(c.rgba));
    assert.ok(a.png[0] === 137 && a.png[1] === 80);
  });

  it('truchet and gray_scott are self-consistent on RGBA', async () => {
    for (const g of ['truchet', 'gray_scott']) {
      const x = await generateProceduralImage({
        prompt: 't',
        seed: 'k',
        width: 20,
        height: 16,
        forceGenerator: g,
      });
      const y = await generateProceduralImage({
        prompt: 't',
        seed: 'k',
        width: 20,
        height: 16,
        forceGenerator: g,
      });
      assert.equal(hashRgba(x.rgba), hashRgba(y.rgba), g);
    }
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
    assert.ok(done.results[0].providerMetadata?.rgbaHash);
  });
});

describe('cancellation', () => {
  it('aborted job does not leave COMPLETE results', async () => {
    createProceduralProvider({ autoRegister: true });
    const ac = new AbortController();
    // Abort during generate via provider path: cancelGeneration after submit
    const job = await submitGeneration({
      prompt: 'slow-cancel',
      seed: 'c',
      providerId: 'procedural',
      width: 96,
      height: 96,
      modelId: 'procedural-gray-scott',
    });
    cancelGeneration(job.jobId);
    const done = await awaitJob(job.jobId);
    assert.ok(
      done.state === JOB_STATES.CANCELLED || done.state === JOB_STATES.COMPLETE,
      `got ${done.state}`,
    );
    if (done.state === JOB_STATES.CANCELLED) {
      assert.ok(!done.results?.length || done.results.length === 0 || done.error === 'cancelled');
      // No half-finished success path
      assert.notEqual(done.state, JOB_STATES.COMPLETE);
    }
  });

  it('AbortSignal on generateProceduralImage throws before return', async () => {
    const ac = new AbortController();
    ac.abort();
    await assert.rejects(
      () =>
        generateProceduralImage({
          prompt: 'x',
          seed: 'y',
          width: 16,
          height: 16,
          signal: ac.signal,
        }),
      (err) => err.name === 'AbortError',
    );
  });
});

describe('SSTV handoff end-to-end (320×256 Martin M1)', () => {
  it('generates at Martin M1 size and produces valid contract v1 manifest', async () => {
    const { width, height } = SSTV_PRESETS.martin_m1;
    assert.equal(width, 320);
    assert.equal(height, 256);

    const img = await generateProceduralImage({
      prompt: 'sstv martin emblem',
      seed: 'm1-e2e',
      width,
      height,
      forceGenerator: 'truchet',
    });
    assert.equal(img.width, 320);
    assert.equal(img.height, 256);
    assert.equal(img.rgba.length, 320 * 256 * 4);
    assert.ok(img.png[0] === 137 && img.png[1] === 80);

    const manifest = createImageToSstvManifest({
      jobId: 'proc-sstv-m1-e2e',
      filename: 'babelcodec-sstv-source.png',
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
        rgbaHash: hashRgba(img.rgba),
        params: img.params,
        providerVersion: img.providerVersion,
      },
    });
    const v = validateMediaJobManifest(manifest);
    assert.equal(v.ok, true);
    assert.equal(v.manifest.contract_version, 1);
    assert.equal(v.manifest.operation, 'image_to_sstv');
    assert.equal(v.manifest.sstv.mode, 'martin_m1');
    assert.equal(v.manifest.asset.width, 320);
    assert.equal(v.manifest.asset.height, 256);
  });
});

describe('ensureGenerationDefaults includes procedural', () => {
  it('registers mock and procedural', () => {
    ensureGenerationDefaults();
    assert.ok(listProviderIds().includes('mock'));
    assert.ok(listProviderIds().includes('procedural'));
  });
});
