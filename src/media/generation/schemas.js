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
 * Validate a generation request. Throws on invalid input.
 * @param {Partial<object>} req
 * @returns {object}
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

  /** @type {object} */
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
 * @param {Partial<object>} caps
 * @returns {object}
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
 * @param {object} request
 * @param {string} jobId
 * @returns {object}
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
 * Includes procedural providerMetadata (digest, params, generator) when present.
 * @param {object} job
 * @returns {object}
 */
export function buildProvenance(job) {
  /** @type {object} */
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
  if (job.request.seed != null) p.seed = String(job.request.seed);
  if (job.completedAt) p.completedAt = job.completedAt;
  if (job.request.width) p.width = job.request.width;
  if (job.request.height) p.height = job.request.height;
  if (job.request.outputFormat) p.outputFormat = job.request.outputFormat;
  if (job.error) p.error = job.error;
  if (job.results?.[0]?.asset?.hash) p.originalHash = job.results[0].asset.hash;
  if (job.provenance?.processingHistory) p.processingHistory = [...job.provenance.processingHistory];
  const meta = job.results?.[0]?.providerMetadata;
  if (meta && typeof meta === 'object') {
    p.providerMetadata = { ...meta };
    if (meta.digestHex) p.digestHex = meta.digestHex;
    if (meta.generator) p.generator = meta.generator;
    if (meta.params) p.params = { ...meta.params };
    if (meta.providerVersion) p.providerVersion = meta.providerVersion;
  }
  return p;
}
