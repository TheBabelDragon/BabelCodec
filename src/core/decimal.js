/**
 * Decimal byte conversion (space-separated 0–255 values).
 */

import { MalformedInputError, ValidationError } from './errors.js';
import { toUint8Array } from './utils.js';

/**
 * @param {Uint8Array|ArrayBuffer|number[]} bytes
 * @param {{ separator?: string }} [opts]
 * @returns {string}
 */
export function encodeDecimal(bytes, opts = {}) {
  const data = toUint8Array(bytes);
  const separator = opts.separator ?? ' ';
  if (data.length === 0) return '';
  return Array.from(data).map((b) => String(b)).join(separator);
}

/**
 * @param {string} input
 * @returns {Uint8Array}
 */
export function decodeDecimal(input) {
  if (typeof input !== 'string') {
    throw new ValidationError('Decimal input must be a string', { code: 'TYPE_ERROR' });
  }

  if (input.trim().length === 0) return new Uint8Array(0);

  const tokens = input.trim().split(/[\s,;]+/).filter((t) => t.length > 0);
  const out = new Uint8Array(tokens.length);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!/^\d+$/.test(t)) {
      throw new MalformedInputError(
        `Invalid decimal token at position ${i + 1}: "${t}"`,
        { code: 'INVALID_DECIMAL', offset: i }
      );
    }
    const n = Number(t);
    if (n > 255) {
      throw new MalformedInputError(
        `Decimal value out of byte range at position ${i + 1}: ${n}`,
        { code: 'OUT_OF_RANGE', offset: i, details: { value: n } }
      );
    }
    out[i] = n;
  }
  return out;
}

export const decimalCodec = {
  id: 'decimal',
  name: 'Decimal',
  description: 'Decimal byte values 0–255',
  sourceFormats: ['bytes'],
  destinationFormats: ['decimal-string'],
  encode: encodeDecimal,
  decode: decodeDecimal,
};
