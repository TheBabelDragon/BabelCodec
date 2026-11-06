/**
 * UTF-8 encoding and decoding.
 * Uses TextEncoder / TextDecoder with fatal: true for strict validation.
 */

import { MalformedInputError, ValidationError } from './errors.js';
import { toUint8Array } from './utils.js';

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const decoderFatal =
  typeof TextDecoder !== 'undefined'
    ? new TextDecoder('utf-8', { fatal: true })
    : null;
const decoderReplace =
  typeof TextDecoder !== 'undefined'
    ? new TextDecoder('utf-8', { fatal: false })
    : null;

export function encodeUtf8(text) {
  if (typeof text !== 'string') {
    throw new ValidationError('UTF-8 encode expects a string', { code: 'TYPE_ERROR' });
  }
  if (encoder) {
    return encoder.encode(text);
  }
  throw new ValidationError('TextEncoder not available', { code: 'NO_TEXT_ENCODER' });
}

export function decodeUtf8(bytes, opts = {}) {
  const data = toUint8Array(bytes);
  const fatal = opts.fatal !== false;

  if (data.length === 0) return '';

  const dec = fatal ? decoderFatal : decoderReplace;
  if (!dec) {
    throw new ValidationError('TextDecoder not available', { code: 'NO_TEXT_DECODER' });
  }

  try {
    return dec.decode(data);
  } catch (e) {
    throw new MalformedInputError(
      `Invalid UTF-8 sequence: ${e.message}`,
      { code: 'INVALID_UTF8', details: { originalMessage: e.message } }
    );
  }
}

export function analyzeUtf8(bytes) {
  const data = toUint8Array(bytes);
  const sequences = [];
  let i = 0;
  let valid = true;

  while (i < data.length) {
    const b0 = data[i];
    let len = 1;
    let error = null;
    let char = null;

    if (b0 <= 0x7f) {
      len = 1;
      char = String.fromCharCode(b0);
    } else if ((b0 & 0xe0) === 0xc0) {
      len = 2;
    } else if ((b0 & 0xf0) === 0xe0) {
      len = 3;
    } else if ((b0 & 0xf8) === 0xf0) {
      len = 4;
    } else {
      error = 'Invalid leading byte';
      valid = false;
      len = 1;
    }

    if (!error && len > 1) {
      if (i + len > data.length) {
        error = 'Truncated multi-byte sequence';
        valid = false;
        len = data.length - i;
      } else {
        for (let j = 1; j < len; j++) {
          if ((data[i + j] & 0xc0) !== 0x80) {
            error = 'Invalid continuation byte';
            valid = false;
            len = j;
            break;
          }
        }
      }
    }

    const seqBytes = Array.from(data.subarray(i, i + len));
    if (!error) {
      try {
        char = decodeUtf8(new Uint8Array(seqBytes), { fatal: true });
      } catch {
        error = 'Decode failure';
        valid = false;
        char = null;
      }
    }

    sequences.push({ offset: i, length: len, bytes: seqBytes, char, error });
    i += len;
  }

  return { valid, sequences };
}

export const utf8Codec = {
  id: 'utf8',
  name: 'UTF-8',
  description: 'Unicode UTF-8',
  sourceFormats: ['text', 'bytes'],
  destinationFormats: ['bytes', 'text'],
  encode: encodeUtf8,
  decode: decodeUtf8,
};
