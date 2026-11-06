/**
 * Octal byte conversion.
 */

import { MalformedInputError, ValidationError } from './errors.js';
import { byteToOctal, toUint8Array } from './utils.js';

export function encodeOctal(bytes, opts = {}) {
  const data = toUint8Array(bytes);
  const separator = opts.separator ?? ' ';
  const pad = opts.pad !== false;
  if (data.length === 0) return '';
  return Array.from(data)
    .map((b) => (pad ? byteToOctal(b) : (b & 0xff).toString(8)))
    .join(separator);
}

export function decodeOctal(input) {
  if (typeof input !== 'string') {
    throw new ValidationError('Octal input must be a string', { code: 'TYPE_ERROR' });
  }
  if (input.trim().length === 0) return new Uint8Array(0);
  const tokens = input.trim().split(/[\s,;]+/).filter((t) => t.length > 0);
  const out = new Uint8Array(tokens.length);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!/^[0-7]+$/.test(t)) {
      throw new MalformedInputError(`Invalid octal token at position ${i + 1}: "${t}"`, { code: 'INVALID_OCTAL', offset: i });
    }
    const n = parseInt(t, 8);
    if (n > 255) {
      throw new MalformedInputError(`Octal value out of byte range at position ${i + 1}: ${t} (${n})`, { code: 'OUT_OF_RANGE', offset: i, details: { value: n } });
    }
    out[i] = n;
  }
  return out;
}

export const octalCodec = {
  id: 'octal',
  name: 'Octal',
  description: 'Octal byte values',
  sourceFormats: ['bytes'],
  destinationFormats: ['octal-string'],
  encode: encodeOctal,
  decode: decodeOctal,
};
