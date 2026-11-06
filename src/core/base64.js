/**
 * Base64 encoding and decoding.
 * Standard Base64 (RFC 4648) with padding.
 * Uses browser/Node native atob/btoa where available, with Uint8Array path.
 */

import { MalformedInputError, ValidationError } from './errors.js';
import { toUint8Array } from './utils.js';

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function encodeBase64(bytes) {
  const data = toUint8Array(bytes);
  if (data.length === 0) return '';

  if (typeof btoa === 'function') {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < data.length; i += chunk) {
      const slice = data.subarray(i, Math.min(i + chunk, data.length));
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  let result = '';
  let i = 0;
  while (i < data.length) {
    const a = data[i++];
    const b = i < data.length ? data[i++] : NaN;
    const c = i < data.length ? data[i++] : NaN;

    const bitmap = (a << 16) | ((isNaN(b) ? 0 : b) << 8) | (isNaN(c) ? 0 : c);
    result += B64_ALPHABET[(bitmap >> 18) & 63];
    result += B64_ALPHABET[(bitmap >> 12) & 63];
    result += isNaN(b) ? '=' : B64_ALPHABET[(bitmap >> 6) & 63];
    result += isNaN(c) ? '=' : B64_ALPHABET[bitmap & 63];
  }
  return result;
}

export function decodeBase64(input) {
  if (typeof input !== 'string') {
    throw new ValidationError('Base64 input must be a string', { code: 'TYPE_ERROR' });
  }

  const cleaned = input.replace(/[\s]/g, '');
  if (cleaned.length === 0) return new Uint8Array(0);

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new MalformedInputError('Invalid Base64 characters', { code: 'INVALID_BASE64' });
  }

  if (cleaned.length % 4 !== 0) {
    throw new MalformedInputError(
      `Invalid Base64 length ${cleaned.length} (must be multiple of 4 with padding)`,
      { code: 'INVALID_BASE64_LENGTH' }
    );
  }

  if (typeof atob === 'function') {
    try {
      const binary = atob(cleaned);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
      }
      return out;
    } catch (e) {
      throw new MalformedInputError(`Base64 decode failed: ${e.message}`, { code: 'INVALID_BASE64' });
    }
  }

  const lookup = new Uint8Array(256);
  for (let i = 0; i < B64_ALPHABET.length; i++) {
    lookup[B64_ALPHABET.charCodeAt(i)] = i;
  }

  let padding = 0;
  if (cleaned.endsWith('==')) padding = 2;
  else if (cleaned.endsWith('=')) padding = 1;

  const outLen = (cleaned.length / 4) * 3 - padding;
  const out = new Uint8Array(outLen);
  let oi = 0;

  for (let i = 0; i < cleaned.length; i += 4) {
    const a = lookup[cleaned.charCodeAt(i)];
    const b = lookup[cleaned.charCodeAt(i + 1)];
    const c = cleaned[i + 2] === '=' ? 0 : lookup[cleaned.charCodeAt(i + 2)];
    const d = cleaned[i + 3] === '=' ? 0 : lookup[cleaned.charCodeAt(i + 3)];

    const bitmap = (a << 18) | (b << 12) | (c << 6) | d;
    if (oi < outLen) out[oi++] = (bitmap >> 16) & 255;
    if (oi < outLen) out[oi++] = (bitmap >> 8) & 255;
    if (oi < outLen) out[oi++] = bitmap & 255;
  }

  return out;
}

export const base64Codec = {
  id: 'base64',
  name: 'Base64',
  description: 'RFC 4648 Base64',
  sourceFormats: ['bytes'],
  destinationFormats: ['base64-string'],
  encode: encodeBase64,
  decode: decodeBase64,
};
