/**
 * Lightweight image inspection: dimensions, checksum, format.
 */

import { detectImageFormat } from './detect.js';

export async function sha256Hex(bytes) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  try {
    const { createHash } = await import('node:crypto');
    return createHash('sha256').update(bytes).digest('hex');
  } catch {
    return '';
  }
}

export function inspectPngHeader(bytes) {
  if (!bytes || bytes.length < 24) return null;
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50)) return null;
  const w =
    (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const h =
    (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  if (w <= 0 || h <= 0 || w > 1e7 || h > 1e7) return null;
  return { width: w, height: h, bitDepth, colorType };
}

export function inspectJpegHeader(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i < bytes.length - 8) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || marker === 0xff) {
      i++;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2) break;
    if (marker === 0xc0 || marker === 0xc2) {
      const h = (bytes[i + 5] << 8) | bytes[i + 6];
      const w = (bytes[i + 7] << 8) | bytes[i + 8];
      if (w > 0 && h > 0) return { width: w, height: h };
    }
    i += 2 + len;
  }
  return null;
}

export async function inspectImageBytes(bytes, decoded = {}) {
  const det = detectImageFormat(bytes);
  let width = decoded.width ?? null;
  let height = decoded.height ?? null;
  let bitDepth = null;
  let colorType = null;
  if (width == null || height == null) {
    if (det.format === 'png') {
      const p = inspectPngHeader(bytes);
      if (p) {
        width = p.width;
        height = p.height;
        bitDepth = p.bitDepth;
        colorType = p.colorType;
      }
    } else if (det.format === 'jpeg') {
      const j = inspectJpegHeader(bytes);
      if (j) {
        width = j.width;
        height = j.height;
      }
    }
  }
  const hash = await sha256Hex(bytes);
  return {
    format: det.format,
    mimeType: det.mimeType,
    byteLength: bytes.length,
    width,
    height,
    aspectRatio: width && height ? width / height : null,
    bitDepth,
    colorType,
    hasAlpha: decoded.hasAlpha ?? (colorType === 4 || colorType === 6 || null),
    animated: decoded.animated ?? (det.format === 'gif' ? null : false),
    codec: decoded.codec ?? null,
    sha256: hash,
  };
}
