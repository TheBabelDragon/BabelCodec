/**
 * Artifact pipeline errors — typed, non-throwing where diagnostics are preferred.
 */

export class ArtifactError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {object} [detail]
   */
  constructor(message, code, detail = {}) {
    super(message);
    this.name = 'ArtifactError';
    this.code = code;
    this.detail = detail;
  }
}

export const CODES = {
  INVALID_SCHEMA: 'ARTIFACT_INVALID_SCHEMA',
  MISSING_REPRESENTATION: 'ARTIFACT_MISSING_REPRESENTATION',
  INCOMPATIBLE_DESTINATION: 'ARTIFACT_INCOMPATIBLE_DESTINATION',
  MUTATION_DENIED: 'ARTIFACT_MUTATION_DENIED',
  DECODE_FAILED: 'ARTIFACT_DECODE_FAILED',
  HASH_FAILED: 'ARTIFACT_HASH_FAILED',
  UNKNOWN_ARTIFACT: 'ARTIFACT_UNKNOWN',
  REVISION_CONFLICT: 'ARTIFACT_REVISION_CONFLICT',
};

export function artifactError(message, code, detail) {
  return new ArtifactError(message, code, detail);
}
