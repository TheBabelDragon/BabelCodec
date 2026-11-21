/**
 * Revision helpers — identity stays stable; revisions are distinguishable.
 */

/**
 * @param {number} current
 * @returns {number}
 */
export function nextRevision(current) {
  const n = Number(current);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n) + 1;
}

/**
 * Create a revision key for maps / logs.
 * @param {string} id
 * @param {number} revision
 */
export function revisionKey(id, revision) {
  return `${id}@${revision}`;
}
