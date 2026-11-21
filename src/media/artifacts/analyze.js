/**
 * Passthrough analysis — capability-aware, never mutates the source artifact.
 */

import { sha256 } from '../../sha256/index.js';
import { detectImageFormat } from '../image/detect.js';
import { hasBytes, hasText, hasImage } from './representations.js';
import { snapshotArtifact } from './artifact.js';

/**
 * @typedef {object} AnalysisResult
 * @property {string} artifactId
 * @property {number} revision
 * @property {number|null} byteLength
 * @property {string|null} declaredMime
 * @property {string|null} detectedMime
 * @property {string|null} detectedFormat
 * @property {{ width?: number, height?: number, format?: string }|null} image
 * @property {string|null} sha256
 * @property {{ bytes: boolean, text: boolean, image: boolean }} representations
 * @property {string[]} capabilities
 * @property {object[]} diagnostics
 * @property {object} [structure]  // optional structural summary when available
 */

/**
 * Analyze an artifact without mutating it.
 * @param {import('./artifact.js').Artifact} artifact
 * @param {{
 *   computeHash?: boolean,
 *   structuralInspect?: (bytes: Uint8Array) => object|null,
 * }} [opts]
 * @returns {AnalysisResult}
 */
export function analyzeArtifact(artifact, opts = {}) {
  const snap = snapshotArtifact(artifact);
  const diagnostics = [];
  const capabilities = [];

  const byteLength = hasBytes(snap.representations)
    ? snap.representations.bytes.byteLength
    : snap.metadata.byteLength ?? null;

  let detectedMime = snap.metadata.detectedMime ?? null;
  let detectedFormat = snap.metadata.detectedFormat ?? null;
  let imageMeta = snap.representations.image ? { ...snap.representations.image } : null;

  if (hasBytes(snap.representations)) {
    capabilities.push('bytes');
    const det = detectImageFormat(snap.representations.bytes);
    if (det.format !== 'unknown') {
      detectedFormat = det.format;
      detectedMime = det.mimeType;
      capabilities.push('image-detect');
      if (!imageMeta) {
        imageMeta = {
          format: det.format,
          mimeType: det.mimeType,
          confidence: det.confidence,
        };
      }
    }
  }

  if (hasText(snap.representations)) capabilities.push('text');
  if (hasImage(snap.representations) || imageMeta) capabilities.push('image');

  let digest = snap.hashes?.sha256 ?? null;
  if (opts.computeHash !== false && hasBytes(snap.representations)) {
    try {
      digest = sha256(snap.representations.bytes).hex;
      capabilities.push('sha256');
    } catch (e) {
      diagnostics.push({
        level: 'error',
        code: 'HASH_FAILED',
        message: String(e.message || e),
      });
    }
  } else if (!hasBytes(snap.representations)) {
    diagnostics.push({
      level: 'info',
      code: 'NO_BYTES',
      message: 'No byte representation available for hashing',
    });
  }

  let structure = null;
  if (typeof opts.structuralInspect === 'function' && hasBytes(snap.representations)) {
    try {
      structure = opts.structuralInspect(snap.representations.bytes);
      if (structure) capabilities.push('structure');
    } catch (e) {
      diagnostics.push({
        level: 'warn',
        code: 'STRUCTURE_FAILED',
        message: String(e.message || e),
      });
    }
  }

  // HEIF structural capability note without requiring decoder
  if (detectedFormat === 'heif') {
    capabilities.push('heif-structure');
    diagnostics.push({
      level: 'info',
      code: 'HEIF_STRUCTURE',
      message: 'HEIF container may be structurally inspectable even without a pixel decoder',
    });
  }

  return {
    artifactId: snap.id,
    revision: snap.revision,
    byteLength,
    declaredMime: snap.source.mimeType || snap.metadata.declaredMime || null,
    detectedMime,
    detectedFormat,
    image: imageMeta,
    sha256: digest,
    representations: {
      bytes: hasBytes(snap.representations),
      text: hasText(snap.representations),
      image: Boolean(imageMeta),
    },
    capabilities,
    diagnostics,
    structure,
  };
}
