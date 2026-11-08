/**
 * TPU / compute backend capability registry.
 * Hardware-neutral. Never pretends browser detection proves TPU availability.
 * Never assumes ImageGen itself executes on the user's TPU.
 */

import { normalizeTpuCapabilities } from './schemas.js';

/** @type {Map<string, import('./schemas.js').TpuCapabilities & { healthCheck?: Function, invoke?: Function }>} */
const backends = new Map();

/**
 * Register a TPU / compute backend.
 * @param {object} backend
 * @param {string} backend.id
 * @param {string} [backend.displayName]
 * @param {() => Promise<object>|object} [backend.healthCheck]
 * @param {(op: string, input: unknown, opts?: object) => Promise<unknown>} [backend.invoke]
 * @param {string[]} [backend.operations]
 * @param {string[]} [backend.supportedModels]
 * @param {string[]} [backend.precision]
 * @param {object} [backend.resourceConstraints]
 * @param {object} [backend.deviceMetadata]
 */
export function registerTpuBackend(backend) {
  if (!backend || typeof backend.id !== 'string' || !backend.id) {
    throw new Error('TPU backend requires a non-empty id');
  }
  backends.set(backend.id, {
    ...backend,
    operations: Array.isArray(backend.operations) ? backend.operations : [],
  });
}

/**
 * Unregister a backend by id.
 * @param {string} id
 */
export function unregisterTpuBackend(id) {
  backends.delete(id);
}

/**
 * List registered backend ids.
 * @returns {string[]}
 */
export function listTpuBackendIds() {
  return [...backends.keys()];
}

/**
 * Discover capabilities for one or all backends via health checks.
 * @param {string} [backendId]
 * @returns {Promise<import('./schemas.js').TpuCapabilities[]>}
 */
export async function discoverTpuCapabilities(backendId) {
  const ids = backendId ? [backendId] : listTpuBackendIds();
  const results = [];
  for (const id of ids) {
    const b = backends.get(id);
    if (!b) {
      results.push(
        normalizeTpuCapabilities({
          backendId: id,
          available: false,
          status: 'unavailable',
          operations: [],
        })
      );
      continue;
    }
    try {
      let health = { available: true, status: 'healthy' };
      if (typeof b.healthCheck === 'function') {
        health = (await b.healthCheck()) || health;
      }
      results.push(
        normalizeTpuCapabilities({
          backendId: id,
          displayName: b.displayName || id,
          available: Boolean(health.available),
          status: health.status || (health.available ? 'healthy' : 'unavailable'),
          operations: health.operations || b.operations || [],
          supportedModels: health.supportedModels || b.supportedModels,
          precision: health.precision || b.precision,
          resourceConstraints: health.resourceConstraints || b.resourceConstraints,
          deviceMetadata: health.deviceMetadata || b.deviceMetadata,
          checkedAt: Date.now(),
        })
      );
    } catch (e) {
      results.push(
        normalizeTpuCapabilities({
          backendId: id,
          displayName: b.displayName || id,
          available: false,
          status: 'unavailable',
          operations: b.operations || [],
          checkedAt: Date.now(),
        })
      );
    }
  }
  return results;
}

/**
 * Invoke a registered backend operation (e.g. prompt preparation).
 * @param {string} backendId
 * @param {string} operation
 * @param {unknown} input
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function invokeTpuOperation(backendId, operation, input, opts = {}) {
  const b = backends.get(backendId);
  if (!b) throw new Error(`TPU backend not registered: ${backendId}`);
  if (typeof b.invoke !== 'function') {
    throw new Error(`TPU backend ${backendId} does not support invoke`);
  }
  if (opts.signal?.aborted) {
    const err = new Error('cancelled');
    err.name = 'AbortError';
    throw err;
  }
  return b.invoke(operation, input, opts);
}

/**
 * Clear all backends (tests).
 */
export function clearTpuBackends() {
  backends.clear();
}

/**
 * Built-in unavailable sentinel — reports honestly that no TPU is present.
 * Used when no real backend is configured.
 */
export function registerUnavailableTpuSentinel() {
  registerTpuBackend({
    id: 'none',
    displayName: 'No TPU backend',
    operations: [],
    healthCheck: async () => ({
      available: false,
      status: 'unavailable',
      operations: [],
      deviceMetadata: { note: 'No TPU backend registered. Browser hardware detection is not used.' },
    }),
  });
}
