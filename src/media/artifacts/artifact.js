/**
 * Core artifact model — identity, representations, provenance, hashes.
 *
 * Contract (conceptual):
 * {
 *   schema: "babelcodec.artifact.v1",
 *   id, revision, source, representations, metadata, hashes, provenance
 * }
 *
 * Public consumers always receive defensive copies. Mutating a returned
 * artifact (including its byte buffer) must not affect pipeline internals
 * or subsequent snapshots of the same logical artifact.
 */

import { createProvenance, deriveProvenance } from './provenance.js';
import { createMetadata, mergeMetadata } from './metadata.js';
import {
  createRepresentations,
  freezeRepresentations,
  copyBytes,
  hasBytes,
} from './representations.js';
import { nextRevision } from './revisions.js';
import { artifactError, CODES } from './errors.js';

const SCHEMA = 'babelcodec.artifact.v1';

let seq = 0;
function generateId() {
  seq += 1;
  return `art-${Date.now().toString(36)}-${seq.toString(36)}`;
}

/**
 * @typedef {object} ArtifactSource
 * @property {'text'|'bytes'|'image'|'file'|'generated'|'transformed'} kind
 * @property {string|null} name
 * @property {string|null} mimeType
 * @property {string|null} filename
 */

/**
 * @typedef {object} Artifact
 * @property {string} schema
 * @property {string} id
 * @property {number} revision
 * @property {ArtifactSource} source
 * @property {import('./representations.js').Representations} representations
 * @property {object} metadata
 * @property {{ sha256: string|null }} hashes
 * @property {import('./provenance.js').Provenance} provenance
 */

/**
 * Internal builder — always paired with a public defensive return.
 * @param {object} opts
 * @returns {Artifact}
 */
function buildArtifact(opts = {}) {
  const source = {
    kind: opts.source?.kind || 'bytes',
    name: opts.source?.name ?? null,
    mimeType: opts.source?.mimeType ?? null,
    filename: opts.source?.filename ?? null,
  };

  const artifact = {
    schema: SCHEMA,
    id: opts.id || generateId(),
    revision: opts.revision != null ? Number(opts.revision) : 1,
    source,
    representations: createRepresentations(opts.representations),
    metadata: createMetadata(opts.metadata),
    hashes: {
      sha256: opts.hashes?.sha256 ?? null,
    },
    provenance: createProvenance(opts.provenance || { operation: 'import' }),
  };

  if (hasBytes(artifact.representations) && artifact.metadata.byteLength == null) {
    artifact.metadata.byteLength = artifact.representations.bytes.byteLength;
  }

  return artifact;
}

/**
 * Public snapshot — defensive copies so callers cannot mutate internals.
 * @param {Artifact} artifact
 * @returns {Artifact}
 */
export function snapshotArtifact(artifact) {
  if (!artifact || artifact.schema !== SCHEMA) {
    throw artifactError('Not a valid babelcodec artifact', CODES.INVALID_SCHEMA);
  }
  return {
    schema: SCHEMA,
    id: artifact.id,
    revision: artifact.revision,
    source: { ...artifact.source },
    representations: freezeRepresentations(artifact.representations),
    metadata: { ...artifact.metadata },
    hashes: { sha256: artifact.hashes?.sha256 ?? null },
    provenance: {
      ...artifact.provenance,
      detail: artifact.provenance?.detail ? { ...artifact.provenance.detail } : undefined,
    },
  };
}

/**
 * Create a new artifact. Returns a defensive copy.
 * Does not hash by default (call analyze / withHash).
 *
 * @param {{
 *   id?: string,
 *   source?: Partial<ArtifactSource>,
 *   representations?: object,
 *   metadata?: object,
 *   provenance?: object,
 *   hashes?: { sha256?: string|null },
 * }} [opts]
 * @returns {Artifact}
 */
export function createArtifact(opts = {}) {
  return snapshotArtifact(buildArtifact(opts));
}

/**
 * Create a new revision from an existing artifact.
 * Identity (id) is preserved; revision increments; provenance points to parent.
 * Returns a defensive copy.
 *
 * @param {Artifact} parent
 * @param {{
 *   representations?: object,
 *   metadata?: object,
 *   operation?: string,
 *   detail?: object,
 *   hashes?: { sha256?: string|null },
 *   sourceKind?: string,
 * }} [opts]
 * @returns {Artifact}
 */
export function createRevision(parent, opts = {}) {
  if (!parent || parent.schema !== SCHEMA) {
    throw artifactError('Parent is not a valid artifact', CODES.INVALID_SCHEMA);
  }

  const reps = opts.representations
    ? createRepresentations(opts.representations)
    : createRepresentations(parent.representations);

  const meta = mergeMetadata(parent.metadata, opts.metadata || {});
  if (hasBytes(reps)) {
    meta.byteLength = reps.bytes.byteLength;
  }

  const built = buildArtifact({
    id: parent.id,
    revision: nextRevision(parent.revision),
    source: {
      ...parent.source,
      kind: opts.sourceKind || 'transformed',
    },
    representations: reps,
    metadata: meta,
    hashes: {
      sha256: opts.hashes?.sha256 ?? null,
    },
    provenance: deriveProvenance(
      parent.id,
      parent.revision,
      opts.operation || 'transform',
      opts.detail,
    ),
  });

  return snapshotArtifact(built);
}

/**
 * Attach or update SHA-256 on a copy of the artifact (does not mutate).
 * @param {Artifact} artifact
 * @param {string|null} hex
 */
export function withHash(artifact, hex) {
  const snap = snapshotArtifact(artifact);
  snap.hashes = { sha256: hex };
  return snap;
}

/**
 * Replace representations on a copy (new revision semantics preferred via createRevision).
 * Kept for internal pipeline steps that normalize without advancing revision.
 * @param {Artifact} artifact
 * @param {object} representations
 * @param {object} [metadataPatch]
 */
export function withRepresentations(artifact, representations, metadataPatch) {
  const snap = snapshotArtifact(artifact);
  snap.representations = createRepresentations(representations);
  if (metadataPatch) snap.metadata = mergeMetadata(snap.metadata, metadataPatch);
  if (hasBytes(snap.representations)) {
    snap.metadata.byteLength = snap.representations.bytes.byteLength;
  }
  if (representations.bytes !== undefined) {
    snap.hashes = { sha256: null };
  }
  return snap;
}

export { SCHEMA, copyBytes, hasBytes };
