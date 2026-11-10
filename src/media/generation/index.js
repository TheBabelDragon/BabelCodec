/**
 * Image generation pipeline — public entry.
 */

export {
  SCHEMA_VERSION,
  JOB_STATES,
  TERMINAL_STATES,
  validateGenerationRequest,
  normalizeTpuCapabilities,
  createJobShell,
  buildProvenance,
} from './schemas.js';

export {
  registerTpuBackend,
  unregisterTpuBackend,
  listTpuBackendIds,
  discoverTpuCapabilities,
  invokeTpuOperation,
  clearTpuBackends,
  registerUnavailableTpuSentinel,
} from './capabilities.js';

export {
  registerProvider,
  unregisterProvider,
  listProviderIds,
  getProvider,
  discoverProviderCapabilities,
  clearProviders,
} from './providers/registry.js';

export { createMockProvider, synthesizePng } from './providers/mock.js';

export {
  createProceduralProvider,
  digestToParams,
  promptSeedDigest,
  generateProceduralImage,
  generateFbm,
  generateTruchet,
  generateGrayScott,
  hashRgba,
  encodeRgbaToPng,
  rngFromDigest,
  sfc32,
  SSTV_PRESETS,
  PROCEDURAL_PROVIDER_VERSION,
  PROCEDURAL_PROVIDER_ID,
} from './providers/procedural.js';

export {
  submitGeneration,
  awaitJob,
  cancelGeneration,
  retryGeneration,
  getJob,
  listJobs,
} from './orchestrator.js';

export { putJob, clearJobs } from './job-store.js';

import { createMockProvider } from './providers/mock.js';
import { createProceduralProvider } from './providers/procedural.js';
import { registerUnavailableTpuSentinel, listTpuBackendIds } from './capabilities.js';
import { listProviderIds } from './providers/registry.js';

/**
 * Ensure offline defaults: mock + procedural providers + honest "no TPU" sentinel.
 * Safe to call multiple times.
 */
export function ensureGenerationDefaults() {
  if (!listProviderIds().includes('mock')) {
    createMockProvider({ autoRegister: true });
  }
  if (!listProviderIds().includes('procedural')) {
    createProceduralProvider({ autoRegister: true });
  }
  if (!listTpuBackendIds().includes('none')) {
    registerUnavailableTpuSentinel();
  }
}
