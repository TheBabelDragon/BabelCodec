/**
 * Universal Artifact Pipeline — public surface.
 *
 * Input enters once. Representations flow through shared analysis.
 * Compatible tools receive the artifact as destinations.
 */

export {
  createArtifact,
  createRevision,
  snapshotArtifact,
  withHash,
  withRepresentations,
  SCHEMA,
  copyBytes,
  hasBytes,
} from './artifact.js';

export { createProvenance, deriveProvenance } from './provenance.js';
export { createMetadata, mergeMetadata } from './metadata.js';
export {
  createRepresentations,
  freezeRepresentations,
  hasText,
  hasImage,
} from './representations.js';
export { nextRevision, revisionKey } from './revisions.js';
export { artifactError, ArtifactError, CODES } from './errors.js';

export {
  fromText,
  fromBytes,
  ensureTextRepresentation,
  ensureBytesFromText,
  bytesToHexText,
  hexTextToBytes,
  bytesToBase64Text,
  base64TextToBytes,
  bytesToBinaryText,
  binaryTextToBytes,
  refreshImageMeta,
} from './representations-service.js';

export { analyzeArtifact } from './analyze.js';

export {
  DESTINATIONS,
  getDestination,
  compatibleDestinations,
  routeTo,
  destinationToTab,
} from './router.js';

export {
  createArtifactLedger,
  getDefaultLedger,
  resetDefaultLedger,
} from './ledger.js';

export { ingestInput, analyzePayload } from './pipeline.js';

/** Convenience: create + optionally hash */
import { fromBytes as _fromBytes, fromText as _fromText } from './representations-service.js';
import { analyzeArtifact as _analyze } from './analyze.js';
import { withHash } from './artifact.js';

/**
 * Create artifact from bytes and compute SHA-256 when possible.
 * @param {Uint8Array} bytes
 * @param {object} [opts]
 */
export async function createHashedArtifactFromBytes(bytes, opts = {}) {
  let art = _fromBytes(bytes, opts);
  const analysis = _analyze(art, { computeHash: true });
  if (analysis.sha256) {
    art = withHash(art, analysis.sha256);
  }
  return { artifact: art, analysis };
}

/**
 * Create artifact from text and compute SHA-256 of UTF-8 bytes.
 * @param {string} text
 * @param {object} [opts]
 */
export async function createHashedArtifactFromText(text, opts = {}) {
  let art = _fromText(text, opts);
  const analysis = _analyze(art, { computeHash: true });
  if (analysis.sha256) {
    art = withHash(art, analysis.sha256);
  }
  return { artifact: art, analysis };
}

/** Ledger convenience APIs */
import { getDefaultLedger as _ledger } from './ledger.js';

export function getArtifactHistory(artifactId) {
  return _ledger().listRecords(artifactId);
}

export function getArtifactOutput(artifactId, revisionId) {
  return _ledger().exportOutput(artifactId, revisionId);
}

export function verifyArtifactOutput(artifactId, revisionId) {
  return _ledger().verify(artifactId, revisionId);
}

export function restoreArtifactRevision(artifactId, revisionId) {
  return _ledger().restore(artifactId, revisionId);
}
