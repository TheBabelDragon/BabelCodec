/**
 * Hexadecimal encoding and decoding.
 * Preserves leading zero bytes. Case-insensitive decode.
 */

import { MalformedInputError, ValidationError } from './errors.js';
import { byteToHex, stripWhitespace, toUint8Array } from './utils.js';

/**
 * @param {Uint8Array|ArrayBuffer|number[]} bytes
 * @param {{ uppercase?: boolean, separator?: string }} [opts]
 * @returns {string}
 */
export function encodeHex(bytes, opts = {}) {
  const data = toUint8Array(bytes);
  const uppercase = opts.uppercase !== false;
  const separator = opts.separator ?? '';

  if (data.length === 0) return '';

  const parts = [];
  for (let i = 0; i < data.length; i++) {
    let h = byteToHex(data[i]);
    if (!uppercase) h = h.toLowerCase();
    parts.push(h);
  }
  return parts.join(separator);
}

/**
 * @param {string} input
 * @returns {Uint8Array}
 */
export function decodeHex(input) {
  if (typeof input !== 'string') {
    throw new ValidationError('Hex input must be a string', { code: 'TYPE_ERROR' });
  }

  if (input.length === 0 || input.trim().length === 0) {
    return new Uint8Array(0);
  }

  let cleaned = input.trim();
  if (/[\s]/.test(cleaned) || /0x/i.test(cleaned)) {
    const tokens = cleaned.split(/[\s,]+/).filter((t) => t.length > 0);
    const hexParts = [];
    for (const t of tokens) {
      let p = t;
      if (/^0x/i.test(p)) p = p.slice(2);
      if (p.length === 0) continue;
      if (!/^[0-9a-fA-F]+$/.test(p)) {
        throw new MalformedInputError(`Invalid hex token: "${t}"`, { code: 'INVALID_HEX' });
      }
      if (p.length % 2 !== 0) {
        throw new MalformedInputError(
          `Incomplete hex byte in token "${t}" (odd length)`,
          { code: 'INCOMPLETE_BYTE' }
        );
      }
      hexParts.push(p);
    }
    cleaned = hexParts.join('');
  } else {
    cleaned = stripWhitespace(cleaned);
    if (/^0x/i.test(cleaned)) cleaned = cleaned.slice(2);
  }

  if (cleaned.length === 0) return new Uint8Array(0);

  if (!/^[0-9a-fA-F]+$/.test(cleaned)) {
    const m = cleaned.match(/[^0-9a-fA-F]/);
    throw new MalformedInputError(
      `Invalid hex character: "${m[0]}"`,
      { code: 'INVALID_HEX', offset: cleaned.indexOf(m[0]) }
    );
  }

  if (cleaned.length % 2 !== 0) {
    throw new MalformedInputError(
      `Incomplete hex byte: odd number of digits (${cleaned.length})`,
      { code: 'INCOMPLETE_BYTE', details: { length: cleaned.length } }
    );
  }

  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export const hexCodec = {
  id: 'hex',
  name: 'Hexadecimal',
  description: 'Hex bytes (00–FF)',
  sourceFormats: ['bytes'],
  destinationFormats: ['hex-string'],
  encode: encodeHex,
  decode: decodeHex,
};
