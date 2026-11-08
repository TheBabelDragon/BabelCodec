/**
 * Provider-independent image generation registry.
 * Additional providers are installable without modifying Image Studio.
 */

/** @type {Map<string, object>} */
const providers = new Map();

/**
 * @typedef {object} GenerationProvider
 * @property {string} id
 * @property {string} [displayName]
 * @property {boolean} [requiresNetwork]
 * @property {() => Promise<object>|object} [getCapabilities]
 * @property {(request: object, opts?: { signal?: AbortSignal, onProgress?: Function }) => Promise<object>} generate
 * @property {(providerJobId: string) => Promise<object>} [poll]
 * @property {(providerJobId: string) => Promise<void>} [cancel]
 */

/**
 * Register a generation provider.
 * @param {GenerationProvider} provider
 */
export function registerProvider(provider) {
  if (!provider || typeof provider.id !== 'string' || !provider.id) {
    throw new Error('Provider requires a non-empty id');
  }
  if (typeof provider.generate !== 'function') {
    throw new Error('Provider must implement generate()');
  }
  providers.set(provider.id, provider);
}

/**
 * @param {string} id
 */
export function unregisterProvider(id) {
  providers.delete(id);
}

/**
 * @returns {string[]}
 */
export function listProviderIds() {
  return [...providers.keys()];
}

/**
 * @param {string} id
 * @returns {GenerationProvider|undefined}
 */
export function getProvider(id) {
  return providers.get(id);
}

/**
 * Discover capabilities for registered providers.
 * @returns {Promise<object[]>}
 */
export async function discoverProviderCapabilities() {
  const out = [];
  for (const [id, p] of providers) {
    try {
      let caps = {
        providerId: id,
        displayName: p.displayName || id,
        requiresNetwork: Boolean(p.requiresNetwork),
        textToImage: true,
        imageToImage: false,
        models: [],
      };
      if (typeof p.getCapabilities === 'function') {
        const c = await p.getCapabilities();
        caps = { ...caps, ...c, providerId: id };
      }
      out.push(caps);
    } catch {
      out.push({
        providerId: id,
        displayName: p.displayName || id,
        requiresNetwork: Boolean(p.requiresNetwork),
        available: false,
        error: 'capability discovery failed',
      });
    }
  }
  return out;
}

/**
 * Clear all providers (tests).
 */
export function clearProviders() {
  providers.clear();
}
