/**
 * Generation orchestrator.
 * Coordinates optional TPU preprocessing with provider generation,
 * tracks job lifecycle, supports cancel/retry, and yields assets for Image Studio.
 */

import {
  JOB_STATES,
  TERMINAL_STATES,
  SCHEMA_VERSION,
  validateGenerationRequest,
  createJobShell,
  buildProvenance,
} from './schemas.js';
import { discoverTpuCapabilities, invokeTpuOperation } from './capabilities.js';
import { getProvider } from './providers/registry.js';
import { putJob, getJob, updateJob, listJobs } from './job-store.js';

let jobSeq = 0;
function nextJobId() {
  jobSeq += 1;
  return `gen-${Date.now()}-${jobSeq}`;
}

/** @type {Map<string, AbortController>} */
const controllers = new Map();

/**
 * Submit a generation job.
 * @param {Partial<import('./schemas.js').GenerationRequest>} rawRequest
 * @param {{ onProgress?: (job: object) => void }} [opts]
 * @returns {Promise<import('./schemas.js').GenerationJob>}
 */
export async function submitGeneration(rawRequest, opts = {}) {
  const request = validateGenerationRequest(rawRequest);
  const jobId = nextJobId();
  const job = createJobShell(request, jobId);
  putJob(job);

  const ac = new AbortController();
  controllers.set(jobId, ac);

  const notify = () => {
    if (typeof opts.onProgress === 'function') opts.onProgress(getJob(jobId));
  };

  // Fire and track asynchronously; caller can await or observe via onProgress / getJob.
  const run = runJob(jobId, ac.signal, notify);
  // Attach for callers who want the promise
  job._promise = run;
  return getJob(jobId);
}

/**
 * Await completion of a previously submitted job.
 * @param {string} jobId
 */
export async function awaitJob(jobId) {
  const job = getJob(jobId);
  if (!job) throw new Error(`unknown job ${jobId}`);
  if (TERMINAL_STATES.has(job.state)) return job;
  if (job._promise) return job._promise;
  // poll fallback
  while (!TERMINAL_STATES.has(getJob(jobId)?.state)) {
    await new Promise((r) => setTimeout(r, 40));
  }
  return getJob(jobId);
}

async function runJob(jobId, signal, notify) {
  const set = (patch) => {
    updateJob(jobId, patch);
    notify();
  };

  try {
    if (signal.aborted) throw abortErr();

    // PREPARING — optional TPU assist
    set({ state: JOB_STATES.PREPARING, progress: 0.05, startedAt: Date.now() });
    const job = getJob(jobId);
    let effectivePrompt = job.request.prompt;

    if (job.request.useTpu && job.request.tpuBackendId) {
      const caps = await discoverTpuCapabilities(job.request.tpuBackendId);
      const c = caps[0];
      if (c?.available && c.operations?.includes('prepare_prompt')) {
        try {
          const prepared = await invokeTpuOperation(
            job.request.tpuBackendId,
            'prepare_prompt',
            { prompt: effectivePrompt, negativePrompt: job.request.negativePrompt },
            { signal }
          );
          if (prepared && typeof prepared.prompt === 'string') {
            effectivePrompt = prepared.prompt;
          }
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          // TPU assist is optional; continue without it
        }
      }
    }

    if (signal.aborted) throw abortErr();

    // GENERATING
    set({ state: JOB_STATES.GENERATING, progress: 0.15 });
    const provider = getProvider(job.request.providerId);
    if (!provider) {
      throw Object.assign(new Error(`Provider not registered: ${job.request.providerId}`), {
        code: 'PROVIDER_MISSING',
      });
    }

    const genRequest = { ...job.request, prompt: effectivePrompt };
    const genResult = await provider.generate(genRequest, {
      signal,
      onProgress: (p) => {
        const clamped = 0.15 + Math.max(0, Math.min(1, Number(p) || 0)) * 0.7;
        set({ progress: clamped });
      },
    });

    if (signal.aborted) throw abortErr();

    // INGESTING
    set({
      state: JOB_STATES.INGESTING,
      progress: 0.9,
      providerJobId: genResult?.providerJobId,
    });

    const results = Array.isArray(genResult?.results) ? genResult.results : [];
    if (!results.length) {
      throw Object.assign(new Error('Provider returned no results'), { code: 'EMPTY_RESULT' });
    }

    // Validate and attach hashes
    for (const r of results) {
      if (!(r.asset?.bytes instanceof Uint8Array) || !r.asset.bytes.length) {
        throw Object.assign(new Error('Invalid asset bytes from provider'), {
          code: 'MALFORMED_ASSET',
        });
      }
      // soft size limit 12 MiB per asset
      if (r.asset.bytes.length > 12 * 1024 * 1024) {
        throw Object.assign(new Error('Asset exceeds size limit'), { code: 'ASSET_TOO_LARGE' });
      }
      if (!r.asset.hash) {
        r.asset.hash = await sha256Hex(r.asset.bytes);
      }
      r.jobId = jobId;
      r.schemaVersion = r.schemaVersion || SCHEMA_VERSION;
      r.asset.schemaVersion = r.asset.schemaVersion || SCHEMA_VERSION;
    }

    // PROCESSING (hook for future local post-process; currently pass-through)
    set({ state: JOB_STATES.PROCESSING, progress: 0.95, results });

    const completedAt = Date.now();
    const provenance = buildProvenance({
      ...getJob(jobId),
      results,
      completedAt,
    });

    set({
      state: JOB_STATES.COMPLETE,
      progress: 1,
      results,
      completedAt,
      provenance,
    });
  } catch (e) {
    if (e.name === 'AbortError' || signal.aborted) {
      set({
        state: JOB_STATES.CANCELLED,
        error: 'cancelled',
        errorCode: 'CANCELLED',
        completedAt: Date.now(),
      });
    } else {
      set({
        state: JOB_STATES.FAILED,
        error: String(e.message || e),
        errorCode: e.code || 'GENERATION_FAILED',
        completedAt: Date.now(),
      });
    }
  } finally {
    controllers.delete(jobId);
  }
  return getJob(jobId);
}

function abortErr() {
  const e = new Error('cancelled');
  e.name = 'AbortError';
  return e;
}

/**
 * Cancel an in-flight job.
 * @param {string} jobId
 */
export function cancelGeneration(jobId) {
  const ac = controllers.get(jobId);
  if (ac) ac.abort();
  const job = getJob(jobId);
  if (job && !TERMINAL_STATES.has(job.state)) {
    updateJob(jobId, {
      state: JOB_STATES.CANCELLED,
      error: 'cancelled',
      errorCode: 'CANCELLED',
      completedAt: Date.now(),
    });
  }
  return getJob(jobId);
}

/**
 * Retry a failed/cancelled job without duplicating completed work.
 * @param {string} jobId
 * @param {{ onProgress?: Function }} [opts]
 */
export async function retryGeneration(jobId, opts = {}) {
  const prev = getJob(jobId);
  if (!prev) throw new Error(`unknown job ${jobId}`);
  if (prev.state === JOB_STATES.COMPLETE) return prev;
  const request = { ...prev.request };
  // new job id to avoid colliding history
  return submitGeneration(request, opts);
}

export { getJob, listJobs };

/** Minimal SHA-256 hex for asset integrity (Web Crypto when available, else FNV-1a fallback for Node tests). */
async function sha256Hex(bytes) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const dig = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // FNV-1a 64-ish fallback for deterministic tests without subtle
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}
