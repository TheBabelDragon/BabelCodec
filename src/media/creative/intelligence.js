/**
 * Provider-neutral creative intelligence interface.
 * Separates intent, design-spec, composition, image generation, and refinement.
 * No secrets. No automatic paid calls. Local heuristic is the default.
 */

import { interpretCreativeIntent, summarizeDesignSpec } from './intent.js';
import { buildSceneFromSpec, refineDesignSpec } from './scene-from-spec.js';
import { detectLocalInferenceCapabilities } from '../inference/index.js';

/**
 * @typedef {'local_heuristic'|'local_model'|'remote_model'|'unavailable'} IntelligenceSource
 */

/**
 * Discover what intelligence backends are actually available.
 */
export async function discoverIntelligenceCapabilities() {
  const local = await detectLocalInferenceCapabilities();
  return {
    intent: { available: true, source: 'local_heuristic', label: 'Local heuristic intent' },
    designSpec: { available: true, source: 'local_heuristic', label: 'Local design specification' },
    composition: { available: true, source: 'local_procedural', label: 'Local scene construction' },
    imageGeneration: {
      available: Boolean(local.modelsAvailable),
      source: local.modelsAvailable ? local.backend : 'unavailable',
      label: local.modelsAvailable ? 'Local model inference' : 'No local models bundled',
    },
    refinement: { available: true, source: 'local_heuristic', label: 'Local prompt refinement' },
    webgpu: local.webgpu,
    wasm: local.wasm,
    modelsAvailable: local.modelsAvailable,
    message: local.message,
    remoteConfigured: false,
  };
}

/**
 * Interpret creative intent. Always offline unless a future adapter is registered.
 */
export function interpretIntent(prompt, opts = {}) {
  const spec = interpretCreativeIntent(prompt, opts);
  return {
    ok: true,
    source: 'local_heuristic',
    operationLabel: 'local_heuristic',
    spec,
    summary: summarizeDesignSpec(spec),
  };
}

/** Build scene from prompt (prompt → artifact). */
export function promptToScene(prompt, opts = {}) {
  const { spec, summary, source, operationLabel } = interpretIntent(prompt, opts);
  const scene = buildSceneFromSpec(spec);
  return {
    ok: true,
    source,
    operationLabel: 'local_procedural',
    interpretationSource: operationLabel,
    spec,
    summary,
    scene,
  };
}

/** Refine existing spec + rebuild scene. */
export function refinePromptToScene(spec, instruction) {
  const next = refineDesignSpec(spec, instruction);
  const scene = buildSceneFromSpec(next);
  return {
    ok: true,
    source: 'local_heuristic',
    operationLabel: 'local_procedural',
    spec: next,
    summary: summarizeDesignSpec(next),
    scene,
  };
}

/**
 * Optional model path — honest failure when no model is registered.
 * A mock can be injected via opts.mockGenerate for tests.
 */
export async function runImageInference(request, opts = {}) {
  if (typeof opts.mockGenerate === 'function') {
    try {
      const result = await opts.mockGenerate(request);
      return { ok: true, source: 'mock_model', operationLabel: 'local_model', result };
    } catch (e) {
      return { ok: false, source: 'mock_model', error: String(e.message || e), operationLabel: 'failed' };
    }
  }
  const caps = await discoverIntelligenceCapabilities();
  if (!caps.modelsAvailable && !opts.remoteUrl) {
    return {
      ok: false,
      source: 'unavailable',
      operationLabel: 'unavailable',
      error: 'No local or remote inference model is configured. Use Playground procedural create or Generate procedural provider.',
    };
  }
  // Remote path would go through the generation gateway only when explicitly configured.
  return {
    ok: false,
    source: 'unavailable',
    operationLabel: 'unavailable',
    error: 'Inference adapter present but no model weights or remote endpoint are active.',
  };
}
