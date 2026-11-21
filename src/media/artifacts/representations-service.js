/**
 * Shared representation service — decode / encode using existing BabelCodec engines.
 * Does not introduce competing converters.
 */

import { encodeUtf8, decodeUtf8 } from '../../core/utf8.js';
import { encodeHex, decodeHex } from '../../core/hex.js';
import { encodeBase64, decodeBase64 } from '../../core/base64.js';
import { encodeBinary, decodeBinary } from '../../core/binary.js';
import { detectImageFormat } from '../image/detect.js';
import { sniffMimeType } from '../assets/registry.js';
import { createArtifact, withRepresentations, SCHEMA } from './artifact.js';
import { createRepresentations, copyBytes, hasBytes } from './representations.js';
import { artifactError, CODES } from './errors.js';

/**
 * Build an artifact from text input.
 * @param {string} text
 * @param {{ filename?: string, name?: string, encoding?: 'utf8'|'ascii' }} [opts]
 */
export function fromText(text, opts = {}) {
  const str = String(text ?? '');
  const bytes = encodeUtf8(str);
  return createArtifact({
    source: {
      kind: 'text',
      name: opts.name ?? null,
      mimeType: 'text/plain',
      filename: opts.filename ?? null,
    },
    representations: {
      bytes,
      text: str,
      image: null,
    },
    metadata: {
      byteLength: bytes.byteLength,
      encoding: opts.encoding || 'utf8',
    },
    provenance: { operation: 'import' },
  });
}

/**
 * Build an artifact from raw bytes (file / binary).
 * @param {Uint8Array} bytes
 * @param {{
 *   filename?: string,
 *   mimeType?: string,
 *   name?: string,
 *   kind?: string,
 *   width?: number,
 *   height?: number,
 * }} [opts]
 */
export function fromBytes(bytes, opts = {}) {
  const buf = copyBytes(bytes);
  if (!buf) throw artifactError('bytes required', CODES.MISSING_REPRESENTATION);

  const detected = detectImageFormat(buf);
  const sniffed = sniffMimeType(buf);
  const declared = opts.mimeType || null;
  const mimeType =
    declared && declared !== 'application/octet-stream'
      ? declared
      : detected.mimeType !== 'application/octet-stream'
        ? detected.mimeType
        : sniffed;

  const isImage =
    detected.format !== 'unknown' ||
    (mimeType && mimeType.startsWith('image/'));

  return createArtifact({
    source: {
      kind: opts.kind || (isImage ? 'image' : 'file'),
      name: opts.name ?? null,
      mimeType,
      filename: opts.filename ?? null,
    },
    representations: {
      bytes: buf,
      text: null,
      image: isImage
        ? {
            format: detected.format,
            mimeType,
            confidence: detected.confidence,
            width: opts.width,
            height: opts.height,
            declaredMime: declared,
            detectedMime: detected.mimeType,
          }
        : null,
    },
    metadata: {
      byteLength: buf.byteLength,
      declaredMime: declared,
      detectedMime: detected.mimeType,
      detectedFormat: detected.format,
      width: opts.width,
      height: opts.height,
    },
    provenance: { operation: 'import' },
  });
}

/**
 * Ensure UTF-8 text representation from bytes (does not erase original bytes).
 * Returns a new object (same revision) with text filled if possible.
 * @param {import('./artifact.js').Artifact} artifact
 */
export function ensureTextRepresentation(artifact) {
  if (artifact.representations.text != null) return artifact;
  if (!hasBytes(artifact.representations)) {
    throw artifactError('No bytes to decode as text', CODES.MISSING_REPRESENTATION);
  }
  try {
    const text = decodeUtf8(artifact.representations.bytes);
    return withRepresentations(artifact, {
      bytes: artifact.representations.bytes,
      text,
      image: artifact.representations.image,
    });
  } catch (e) {
    throw artifactError(
      `Text decode failed: ${e.message || e}`,
      CODES.DECODE_FAILED,
      { cause: String(e.message || e) },
    );
  }
}

/**
 * Ensure bytes from text representation.
 * @param {import('./artifact.js').Artifact} artifact
 */
export function ensureBytesFromText(artifact) {
  if (hasBytes(artifact.representations)) return artifact;
  if (artifact.representations.text == null) {
    throw artifactError('No text to encode as bytes', CODES.MISSING_REPRESENTATION);
  }
  const bytes = encodeUtf8(artifact.representations.text);
  return withRepresentations(artifact, {
    bytes,
    text: artifact.representations.text,
    image: artifact.representations.image,
  }, { byteLength: bytes.byteLength });
}

/**
 * Hex / Base64 / Binary round-trip helpers (text forms).
 */
export function bytesToHexText(bytes) {
  return encodeHex(copyBytes(bytes));
}

export function hexTextToBytes(text) {
  return decodeHex(String(text));
}

export function bytesToBase64Text(bytes) {
  return encodeBase64(copyBytes(bytes));
}

export function base64TextToBytes(text) {
  return decodeBase64(String(text));
}

export function bytesToBinaryText(bytes) {
  return encodeBinary(copyBytes(bytes));
}

export function binaryTextToBytes(text) {
  return decodeBinary(String(text));
}

/**
 * Refresh image representation metadata from current bytes.
 * @param {import('./artifact.js').Artifact} artifact
 */
export function refreshImageMeta(artifact) {
  if (!hasBytes(artifact.representations)) return artifact;
  const detected = detectImageFormat(artifact.representations.bytes);
  if (detected.format === 'unknown') return artifact;
  return withRepresentations(artifact, {
    bytes: artifact.representations.bytes,
    text: artifact.representations.text,
    image: {
      ...(artifact.representations.image || {}),
      format: detected.format,
      mimeType: detected.mimeType,
      confidence: detected.confidence,
      detectedMime: detected.mimeType,
    },
  }, {
    detectedFormat: detected.format,
    detectedMime: detected.mimeType,
  });
}
