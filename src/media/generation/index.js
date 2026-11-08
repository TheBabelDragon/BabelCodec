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
  submitGeneration,
  awaitJob,
  cancelGeneration,
  retryGeneration,
  getJob,
  listJobs,
} from './orchestrator.js';

export { putJob, clearJobs } from './job-store.js';

/**
 * Bootstrap defaults for the offline workstation:
 * - mock provider always available
 * - honest "no TPU" sentinel
 */
export function bootstrapGenerationDefaults() {
  const { createMockProvider } = requireMock();
  const { registerUnavailableTpuSentinel, listTpuBackendIds } = requireCaps();
  const { listProviderIds } = requireReg();

  if (!listProviderIds().includes('mock')) {
    createMockProvider({ autoRegister: true });
  }
  if (!listTpuBackendIds().includes('none')) {
    registerUnavailableTpuSentinel();
  }
}

// Avoid circular static imports for bootstrap helpers
function requireMock() {
  return { createMockProvider: (...a) => import('./providers/mock.js').then((m) => m.createMockProvider(...a)) };
}
// Simpler synchronous bootstrap used by UI:
import { createMockProvider as _cmp } from './providers/mock.js';
import { registerUnavailableTpuSentinel as _rus, listTpuBackendIds as _ltb } from './capabilities.js';
import { listProviderIds as _lpi } from './providers/registry.js';

export function ensureGenerationDefaults() {
  if (!_lpi().includes('mock')) {
    _cmp({ autoRegister: true });
  }
  if (!_ltb().includes('none')) {
    _rus();
  }
}
