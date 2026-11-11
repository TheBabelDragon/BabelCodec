import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  promptToScene,
  refinePromptToScene,
  runImageInference,
  discoverIntelligenceCapabilities,
} from '../../src/media/creative/intelligence.js';
import { buildSceneFromSpec } from '../../src/media/creative/scene-from-spec.js';
import { interpretCreativeIntent } from '../../src/media/creative/intent.js';

describe('prompt-to-artifact', () => {
  it('builds editable scene with local_procedural label', () => {
    const r = promptToScene('dark copper mechanical dragon emblem inventory icon');
    assert.equal(r.ok, true);
    assert.equal(r.operationLabel, 'local_procedural');
    assert.equal(r.spec.interpretationSource, 'local_heuristic');
    assert.ok(r.scene.objects.length > 0);
    assert.ok(r.scene.width >= 16);
  });

  it('refinement creates new derivative spec', () => {
    const first = promptToScene('logo on dark field');
    const second = refinePromptToScene(first.spec, 'make it square icon, copper');
    assert.notEqual(second.spec.originalPrompt, first.spec.originalPrompt);
    assert.equal(second.operationLabel, 'local_procedural');
    assert.ok(second.scene.objects.length > 0);
  });

  it('buildSceneFromSpec covers texture style', () => {
    const spec = interpretCreativeIntent('texture pattern copper');
    const scene = buildSceneFromSpec(spec);
    assert.ok(scene.objects.length > 4);
    assert.equal(scene.operationLabel, 'local_procedural');
  });
});

describe('intelligence adapter', () => {
  it('reports no models by default', async () => {
    const c = await discoverIntelligenceCapabilities();
    assert.equal(c.modelsAvailable, false);
    assert.equal(c.intent.available, true);
    assert.equal(c.imageGeneration.available, false);
  });

  it('inference unavailable without model', async () => {
    const r = await runImageInference({ prompt: 'x' });
    assert.equal(r.ok, false);
    assert.equal(r.source, 'unavailable');
  });

  it('mock inference works when injected', async () => {
    const r = await runImageInference(
      { prompt: 'x' },
      { mockGenerate: async () => ({ pixels: [1, 2, 3] }) },
    );
    assert.equal(r.ok, true);
    assert.equal(r.source, 'mock_model');
  });

  it('mock failure surfaces error', async () => {
    const r = await runImageInference(
      { prompt: 'x' },
      {
        mockGenerate: async () => {
          throw new Error('bad response');
        },
      },
    );
    assert.equal(r.ok, false);
    assert.match(r.error, /bad response/);
  });
});
