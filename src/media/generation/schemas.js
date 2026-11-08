/**
 * Versioned, provider-independent data contracts for image generation.
 * Schema versions are explicit. Do not invent metadata a backend does not provide.
 */

export const SCHEMA_VERSION = '1.0.0';

/** @typedef {'QUEUED'|'PREPARING'|'GENERATING'|'INGESTING'|'PROCESSING'|'COMPLETE'|'FAILED'|'CANCELLED'} JobState */

export const JOB_STATES = Object.freeze({
  QUEUED: 'QUEUED',
  PREPARING: 'PREPARING',
  GENERATING: 'GENERATING',
  INGESTING: 'INGESTING',
  PROCESSING: 'PROCESSING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

export const TERMINAL_STATES = new Set(['COMPLETE', 'FAILED', 'CANCELLED']);

/**
 * @typedef {object} TpuCapabilities
 * @property {string} schemaVersion
 * @property {string} backendId
 * @property {string} [displayName]
 * @property {boolean} available
 * @property {string} [status] healthy|degraded|unavailable
 * @property {string[]} operations
 * @property {string[]} [supportedModels]
 * @property {string[]} [precision] e.g. ['fp16','bf16','int8']
 * @property {{maxConcurrent?: number, maxMemoryMb?: number, maxBatch?: number}} [resourceConstraints]
 * @property {Record<string, unknown>} [deviceMetadata]
 * @property {number} [checkedAt]
 */

/**
 * @typedef {object} GenerationRequest
 * @property {string} schemaVersion
 * @property {string} prompt
 * @property {string} [negativePrompt]
 * @property {string} providerId
 * @property {string} [modelId]
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [aspectRatio]
 * @property {string} [outputFormat] png|jpeg|webp
 * @property {number} [quality] 0-1
 * @property {number} [variants] 1..
 * @property {string} [seed]
 * @property {Uint8Array|null} [sourceImage] for img2img
 * @property {number} [strength] img2img strength
 * @property {string} [tpuBackendId]
 * @property {Record<string, unknown>} [providerParams]
 * @property {boolean} [useTpu]
 */

/**
 * @typedef {object} GenerationJob
 * @property {string} schemaVersion
 * @property {string} jobId
 * @property {JobState} state
 * @property {GenerationRequest} request
 * @property {number} createdAt
 * @property {number} [updatedAt]
 * @property {number} [startedAt]
 * @property {number} [completedAt]
 * @property {string} [error]
 * @property {string} [errorCode]
 * @property {number} [progress] 0-1
 * @property {string} [providerJobId]
 * @property {GenerationResult[]} [results]
 * @property {object} [provenance]
 * @property {number} attempt
 */

/**
 * @typedef {object} GenerationResult
 * @property {string} schemaVersion
 * @property {string} resultId
 * @property {string} jobId
 * @property {ImageAsset} asset
 * @property {number} variantIndex
 * @property {Record<string, unknown>} [providerMetadata]
 */

/**
 * @typedef {object} ImageAsset
 * @property {string} schemaVersion
 * @property {string} assetId
 * @property {Uint8Array} bytes
 * @property {string} mimeType
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [hash] sha-256 hex of original bytes
 * @property {string} [filename]
 * @property {number} createdAt
 */

/**
 * @typedef {object} ProcessingDerivative
 * @property {string} schemaVersion
 * @property {string} derivativeId
 * @property {string} sourceAssetId
 * @property {ImageAsset} asset
 * @property {string} operation
 * @property {Record<string, unknown>} [params]
 * @property {number} createdAt
 */

/**
 * @typedef {object} GenerationProvenance
 * @property {string} schemaVersion
 * @property {string} jobId
 * @property {string} prompt
 * @property {string} [negativePrompt]
 * @property {string} providerId
 * @property {string} [modelId]
 * @property {string} [tpuBackendId]
 * @property {number} createdAt
 * @property {number} [completedAt]
 * @property {number} [width]
 * @property {number} [height]
 * @property {string} [outputFormat]
 * @property {string} [originalHash]
 * @property {string[]} [processingHistory]
 * @property {string} [error]
 * @property {Record<string, unknown>} [providerMetadata]
 */

/**
 * Validate a generation request. Throws on invalid input.
 * @param {Partial<GenerationRequest>} req
 * @returns {GenerationRequest}
 */
export function validateGenerationRequest(req) {
  if (!req || typeof req !== 'object') throw new Error('request must be an object');
  const prompt = typeof req.prompt === 'string' ? req.prompt.trim() : '';
  if (!prompt) throw new Error('prompt is required');
  if (prompt.length > 8000) throw new Error('prompt exceeds maximum length');

  const providerId = typeof req.providerId === 'string' && req.providerId ? req.providerId : 'mock';
  const width = clampDim(req.width, 64, 2048, 1024);
  const height = clampDim(req.height, 64, 2048, 1024);
  const variants = Math.max(1, Math.min(8, Math.round(Number(req.variants) || 1)));
  const quality = Math.max(0.05, Math.min(1, Number(req.quality) || 0.92));
  const outputFormat = normalizeFormat(req.outputFormat);

  /** @type {GenerationRequest} */
  const out = {
    schemaVersion: SCHEMA_VERSION,
    prompt,
    providerId,
    width,
    height,
    variants,
    quality,
    outputFormat,
    useTpu: Boolean(req.useTpu),
  };

  if (typeof req.negativePrompt === 'string' && req.negativePrompt.trim()) {
    out.negativePrompt = req.negativePrompt.trim().slice(0, 4000);
  }
  if (typeof req.modelId === 'string' && req.modelId) out.modelId = req.modelId;
  if (typeof req.aspectRatio === 'string' && req.aspectRatio) out.aspectRatio = req.aspectRatio;
  if (typeof req.seed === 'string' || typeof req.seed === 'number') out.seed = String(req.seed);
  if (req.sourceImage instanceof Uint8Array && req.sourceImage.length) {
    out.sourceImage = req.sourceImage;
    out.strength = Math.max(0, Math.min(1, Number(req.strength) ?? 0.75));
  }
  if (typeof req.tpuBackendId === 'string' && req.tpuBackendId) out.tpuBackendId = req.tpuBackendId;
  if (req.providerParams && typeof req.providerParams === 'object') {
    out.providerParams = { ...req.providerParams };
  }
  return out;
}

function clampDim(v, lo, hi, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function normalizeFormat(f) {
  const s = String(f || 'png').toLowerCase();
  if (s === 'jpeg' || s === 'jpg') return 'jpeg';
  if (s === 'webp') return 'webp';
  return 'png';
}

/**
 * @param {Partial<TpuCapabilities>} caps
 * @returns {TpuCapabilities}
 */
export function normalizeTpuCapabilities(caps) {
  return {
    schemaVersion: SCHEMA_VERSION,
    backendId: String(caps?.backendId || 'unknown'),
    displayName: caps?.displayName ? String(caps.displayName) : undefined,
    available: Boolean(caps?.available),
    status: caps?.status || (caps?.available ? 'healthy' : 'unavailable'),
    operations: Array.isArray(caps?.operations) ? [...caps.operations] : [],
    supportedModels: Array.isArray(caps?.supportedModels) ? [...caps.supportedModels] : undefined,
    precision: Array.isArray(caps?.precision) ? [...caps.precision] : undefined,
    resourceConstraints: caps?.resourceConstraints ? { ...caps.resourceConstraints } : undefined,
    deviceMetadata: caps?.deviceMetadata ? { ...caps.deviceMetadata } : undefined,
    checkedAt: Number(caps?.checkedAt) || Date.now(),
  };
}

/**
 * Create an empty job shell.
 * @param {GenerationRequest} request
 * @param {string} jobId
 * @returns {GenerationJob}
 */
export function createJobShell(request, jobId) {
  const now = Date.now();
  return {
    schemaVersion: SCHEMA_VERSION,
    jobId,
    state: JOB_STATES.QUEUED,
    request,
    createdAt: now,
    updatedAt: now,
    attempt: 1,
    results: [],
  };
}

/**
 * Build provenance from a completed (or failed) job.
 * @param {GenerationJob} job
 * @returns {GenerationProvenance}
 */
export function buildProvenance(job) {
  /** @type {GenerationProvenance} */
  const p = {
    schemaVersion: SCHEMA_VERSION,
    jobId: job.jobId,
    prompt: job.request.prompt,
    providerId: job.request.providerId,
    createdAt: job.createdAt,
  };
  if (job.request.negativePrompt) p.negativePrompt = job.request.negativePrompt;
  if (job.request.modelId) p.modelId = job.request.modelId;
  if (job.request.tpuBackendId) p.tpuBackendId = job.request.tpuBackendId;
  if (job.completedAt) p.completedAt = job.completedAt;
  if (job.request.width) p.width = job.request.width;
  if (job.request.height) p.height = job.request.height;
  if (job.request.outputFormat) p.outputFormat = job.request.outputFormat;
  if (job.error) p.error = job.error;
  if (job.results?.[0]?.asset?.hash) p.originalHash = job.results[0].asset.hash;
  if (job.provenance?.processingHistory) p.processingHistory = [...job.provenance.processingHistory];
  return p;
}
