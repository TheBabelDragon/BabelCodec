/**
 * Destination router — single handoff interface for labs / tools.
 * Destinations declare accepted representations; incompatible routes are rejected with diagnostics.
 */

import { snapshotArtifact } from './artifact.js';
import { hasBytes, hasText, hasImage, copyBytes } from './representations.js';
import { artifactError, CODES } from './errors.js';

/**
 * @typedef {'converter'|'hex-inspector'|'structure'|'logic'|'sha256'|'computer'|'image-studio'} DestinationId
 */

/**
 * @typedef {object} DestinationCapability
 * @property {DestinationId} id
 * @property {string} label
 * @property {('bytes'|'text'|'image')[]} accepts
 * @property {string} [description]
 */

/** @type {DestinationCapability[]} */
export const DESTINATIONS = [
  {
    id: 'converter',
    label: 'Converter',
    accepts: ['text', 'bytes'],
    description: 'Text and byte encoding / decoding',
  },
  {
    id: 'hex-inspector',
    label: 'Hex Inspector',
    accepts: ['bytes'],
    description: 'Byte-level hex inspection and selection',
  },
  {
    id: 'structure',
    label: 'Structure & Layout',
    accepts: ['bytes'],
    description: 'Structural field analysis',
  },
  {
    id: 'logic',
    label: 'Logic Lab',
    accepts: ['bytes'],
    description: 'Bitwise and circuit operations on bytes or ranges',
  },
  {
    id: 'sha256',
    label: 'SHA-256 Lab',
    accepts: ['bytes'],
    description: 'Cryptographic hash of exact byte representation',
  },
  {
    id: 'computer',
    label: 'Computer Lab',
    accepts: ['bytes'],
    description: 'Interactive computational machine',
  },
  {
    id: 'image-studio',
    label: 'Image Studio',
    accepts: ['image', 'bytes'],
    description: 'Image manipulate / construct / optimize',
  },
];

const byId = new Map(DESTINATIONS.map((d) => [d.id, d]));

/**
 * @param {DestinationId} id
 */
export function getDestination(id) {
  return byId.get(id) || null;
}

/**
 * List destinations that can accept the current artifact.
 * @param {import('./artifact.js').Artifact} artifact
 * @returns {DestinationCapability[]}
 */
export function compatibleDestinations(artifact) {
  const snap = snapshotArtifact(artifact);
  const available = new Set();
  if (hasBytes(snap.representations)) available.add('bytes');
  if (hasText(snap.representations)) available.add('text');
  if (hasImage(snap.representations) || (snap.source.mimeType || '').startsWith('image/')) {
    available.add('image');
  }
  // Image studio also accepts bytes that look like images
  if (hasBytes(snap.representations) && snap.metadata?.detectedFormat && snap.metadata.detectedFormat !== 'unknown') {
    available.add('image');
  }

  return DESTINATIONS.filter((d) => d.accepts.some((a) => available.has(a)));
}

/**
 * Validate and prepare a handoff payload for a destination.
 * Never silently substitutes a different representation.
 *
 * @param {import('./artifact.js').Artifact} artifact
 * @param {DestinationId} destinationId
 * @returns {{
 *   ok: true,
 *   destination: DestinationCapability,
 *   artifactId: string,
 *   revision: number,
 *   bytes: Uint8Array|null,
 *   text: string|null,
 *   image: object|null,
 *   provenance: object,
 * } | {
 *   ok: false,
 *   error: import('./errors.js').ArtifactError,
 *   diagnostics: object[],
 * }}
 */
export function routeTo(artifact, destinationId) {
  const dest = getDestination(destinationId);
  if (!dest) {
    return {
      ok: false,
      error: artifactError(`Unknown destination: ${destinationId}`, CODES.INCOMPATIBLE_DESTINATION),
      diagnostics: [{ level: 'error', code: 'UNKNOWN_DEST', message: `Unknown destination: ${destinationId}` }],
    };
  }

  const snap = snapshotArtifact(artifact);
  const available = {
    bytes: hasBytes(snap.representations),
    text: hasText(snap.representations),
    image: hasImage(snap.representations) || Boolean(snap.metadata?.detectedFormat && snap.metadata.detectedFormat !== 'unknown'),
  };

  const canAccept = dest.accepts.some((a) => available[a]);
  if (!canAccept) {
    return {
      ok: false,
      error: artifactError(
        `Destination "${dest.label}" requires ${dest.accepts.join(' or ')}; artifact has none of these representations`,
        CODES.INCOMPATIBLE_DESTINATION,
        { destination: dest.id, accepts: dest.accepts, available },
      ),
      diagnostics: [{
        level: 'error',
        code: 'INCOMPATIBLE',
        message: `Cannot route to ${dest.label}: missing required representation`,
        detail: { accepts: dest.accepts, available },
      }],
    };
  }

  return {
    ok: true,
    destination: dest,
    artifactId: snap.id,
    revision: snap.revision,
    bytes: available.bytes ? copyBytes(snap.representations.bytes) : null,
    text: available.text ? snap.representations.text : null,
    image: snap.representations.image ? { ...snap.representations.image } : null,
    provenance: { ...snap.provenance },
    source: { ...snap.source },
    hashes: { sha256: snap.hashes?.sha256 ?? null },
    metadata: { ...snap.metadata },
  };
}

/**
 * Map legacy tab names used by app.js switchTab.
 * @param {DestinationId} id
 * @returns {string}
 */
export function destinationToTab(id) {
  const map = {
    converter: 'converter',
    'hex-inspector': 'inspector',
    structure: 'structure',
    logic: 'logic',
    sha256: 'sha256',
    computer: 'computer',
    'image-studio': 'media',
  };
  return map[id] || id;
}
