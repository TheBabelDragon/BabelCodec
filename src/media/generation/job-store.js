/**
 * In-memory job history store.
 * Deterministic; no persistence required for the offline workstation.
 */

/** @type {Map<string, import('./schemas.js').GenerationJob>} */
const jobs = new Map();
const MAX_HISTORY = 100;

/**
 * @param {import('./schemas.js').GenerationJob} job
 */
export function putJob(job) {
  jobs.set(job.jobId, job);
  // prune oldest if over limit
  if (jobs.size > MAX_HISTORY) {
    const sorted = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
    const remove = sorted.slice(0, jobs.size - MAX_HISTORY);
    for (const j of remove) jobs.delete(j.jobId);
  }
}

/**
 * @param {string} jobId
 * @returns {import('./schemas.js').GenerationJob|undefined}
 */
export function getJob(jobId) {
  return jobs.get(jobId);
}

/**
 * @returns {import('./schemas.js').GenerationJob[]}
 */
export function listJobs() {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * @param {string} jobId
 * @param {Partial<import('./schemas.js').GenerationJob>} patch
 */
export function updateJob(jobId, patch) {
  const j = jobs.get(jobId);
  if (!j) return null;
  Object.assign(j, patch, { updatedAt: Date.now() });
  return j;
}

export function clearJobs() {
  jobs.clear();
}
