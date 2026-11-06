/**
 * Binary (bit-string) encoding and decoding.
 *
 * Input forms accepted when decoding:
 * - Continuous 8-bit sequences: 01000001
 * - Whitespace-separated byte groups: 01000001 01000010
 * - Mixed whitespace (spaces, tabs, newlines)
 *
 * Incomplete trailing groups are rejected (never truncated).
 * Leading zeros are preserved.
 */

import { MalformedInputError, ValidationError } from './errors.js';
import { byteToBinary, stripWhitespace, toUint8Array } from './utils.js';

/**
 * Encode bytes to binary bit string.
 * @param {Uint8Array|ArrayBuffer|number[]} bytes
 * @param {{ groupBytes?: boolean, separator?: string }} [opts]
 * @returns {string}
 */
export function encodeBinary(bytes, opts = {}) {
  const data = toUint8Array(bytes);
  const groupBytes = opts.groupBytes !== false;
  const separator = opts.separator ?? ' ';

  if (data.length === 0) return '';

  const parts = [];
  for (let i = 0; i < data.length; i++) {
    parts.push(byteToBinary(data[i]));
  }
  return groupBytes ? parts.join(separator) : parts.join('');
}

/**
 * Decode binary bit string to bytes.
 * @param {string} input
 * @returns {Uint8Array}
 */
export function decodeBinary(input) {
  if (typeof input !== 'string') {
    throw new ValidationError('Binary input must be a string', { code: 'TYPE_ERROR' });
  }

  if (input.length === 0 || input.trim().length === 0) {
    return new Uint8Array(0);
  }

  // Prefer whitespace-separated groups when present
  const hasWhitespace = /[\s]/.test(input);

  if (hasWhitespace) {
    const groups = input.trim().split(/[\s]+/).filter((g) => g.length > 0);
    const out = new Uint8Array(groups.length);
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (!/^[01]+$/.test(g)) {
        throw new MalformedInputError(
          `Invalid binary characters in group ${i + 1}: "${g}"`,
          { code: 'INVALID_BITS', offset: i, details: { group: g } }
        );
      }
      if (g.length !== 8) {
        throw new MalformedInputError(
          `Incomplete or oversized byte group ${i + 1}: expected 8 bits, got ${g.length} ("${g}")`,
          { code: 'INCOMPLETE_BYTE', offset: i, details: { group: g, length: g.length } }
        );
      }
      out[i] = parseInt(g, 2);
    }
    return out;
  }

  // Continuous bit stream
  const bits = stripWhitespace(input);
  if (!/^[01]+$/.test(bits)) {
    const bad = bits.match(/[^01]/);
    throw new MalformedInputError(
      `Invalid binary character at position ${bits.indexOf(bad[0])}: "${bad[0]}"`,
      { code: 'INVALID_BITS', offset: bits.indexOf(bad[0]) }
    );
  }
  if (bits.length % 8 !== 0) {
    throw new MalformedInputError(
      `Incomplete byte: bit length ${bits.length} is not a multiple of 8`,
      { code: 'INCOMPLETE_BYTE', details: { bitLength: bits.length } }
    );
  }

  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return out;
}

export const binaryCodec = {
  id: 'binary',
  name: 'Binary',
  description: '8-bit binary groups (0/1)',
  sourceFormats: ['bytes'],
  destinationFormats: ['binary-string'],
  encode: encodeBinary,
  decode: decodeBinary,
};
