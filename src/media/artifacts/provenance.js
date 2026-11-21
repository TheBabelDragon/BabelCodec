/**
 * Provenance helpers for artifact revisions.
 */

/**
 * @typedef {object} Provenance
 * @property {string|null} parentArtifactId
 * @property {number|null} parentRevision
 * @property {string} operation
 * @property {object} [detail]
 * @property {number} [at]
 */

/**
 * @param {Partial<Provenance>} [input]
 * @returns {Provenance}
 */
export function createProvenance(input = {}) {
  return {
    parentArtifactId: input.parentArtifactId ?? null,
    parentRevision: input.parentRevision != null ? Number(input.parentRevision) : null,
    operation: String(input.operation || 'import'),
    detail: input.detail ? { ...input.detail } : undefined,
    at: input.at != null ? Number(input.at) : Date.now(),
  };
}

/**
 * @param {Provenance} parent
 * @param {string} operation
 * @param {object} [detail]
 * @param {string} parentArtifactId
 * @param {number} parentRevision
 */
export function deriveProvenance(parentArtifactId, parentRevision, operation, detail) {
  return createProvenance({
    parentArtifactId,
    parentRevision,
    operation,
    detail,
  });
}
