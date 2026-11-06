/**
 * Strict ASCII encoding and decoding.
 * Rejects any byte > 0x7F on encode-from-text and decode-to-text.
 * Distinct from UTF-8.
 */

import { MalformedInputError, ValidationError } from './errors.js';
import { toUint8Array } from './utils.js';

export function encodeAscii(text) {
  if (typeof text !== 'string') {
    throw new ValidationError('ASCII encode expects a string', { code: 'TYPE_ERROR' });
  }
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0x7f) {
      throw new MalformedInputError(
        `Non-ASCII character U+${code.toString(16).toUpperCase().padStart(4, '0')} at index ${i}`,
        { code: 'NON_ASCII', offset: i, details: { codePoint: code } }
      );
    }
    out[i] = code;
  }
  return out;
}

export function decodeAscii(bytes) {
  const data = toUint8Array(bytes);
  let result = '';
  for (let i = 0; i < data.length; i++) {
    if (data[i] > 0x7f) {
      throw new MalformedInputError(
        `Non-ASCII byte 0x${data[i].toString(16).toUpperCase().padStart(2, '0')} at offset ${i}`,
        { code: 'NON_ASCII', offset: i, details: { byte: data[i] } }
      );
    }
    result += String.fromCharCode(data[i]);
  }
  return result;
}

export function isAscii(bytes) {
  const data = toUint8Array(bytes);
  for (let i = 0; i < data.length; i++) {
    if (data[i] > 0x7f) return false;
  }
  return true;
}

export const asciiCodec = {
  id: 'ascii',
  name: 'ASCII',
  description: 'Strict 7-bit ASCII',
  sourceFormats: ['text', 'bytes'],
  destinationFormats: ['bytes', 'text'],
  encode: encodeAscii,
  decode: decodeAscii,
};
