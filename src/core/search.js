/**
 * Byte-level search — operates on raw bytes, never lossy text rendering.
 */

import { toUint8Array, cloneBytes } from './utils.js';
import { encodeUtf8 } from './utf8.js';
import { encodeAscii as encAscii } from './ascii.js';
import { decodeHex } from './hex.js';
import { ValidationError, MalformedInputError } from './errors.js';

export function patternToBytes(pattern, mode = 'hex') {
  if (pattern instanceof Uint8Array) {
    return cloneBytes(pattern);
  }
  if (Array.isArray(pattern)) {
    return new Uint8Array(pattern);
  }
  if (typeof pattern !== 'string') {
    throw new ValidationError('Pattern must be string, Uint8Array, or number[]');
  }
  if (pattern.length === 0) {
    throw new ValidationError('Empty search pattern is not allowed');
  }

  switch (mode) {
    case 'hex':
      return decodeHex(pattern);
    case 'ascii':
      return encAscii(pattern);
    case 'utf8':
      return encodeUtf8(pattern);
    case 'bytes':
      {
        const out = new Uint8Array(pattern.length);
        for (let i = 0; i < pattern.length; i++) {
          const c = pattern.charCodeAt(i);
          if (c > 0xff) {
            throw new MalformedInputError(
              'bytes mode pattern contains code points > 0xFF; use utf8 or hex',
            );
          }
          out[i] = c;
        }
        return out;
      }
    default:
      throw new ValidationError(`Unknown search mode: ${mode}`);
  }
}

export function searchBytes(bytes, pattern, options = {}) {
  const data = toUint8Array(bytes);
  const mode = options.mode || 'hex';
  const maxResults = options.maxResults ?? 1000;
  const overlap = options.overlap !== false;

  const needle = patternToBytes(pattern, mode);
  if (needle.length === 0) {
    throw new ValidationError('Empty search pattern is not allowed');
  }
  if (needle.length > data.length) {
    return {
      pattern: needle,
      matches: [],
      count: 0,
      truncated: false,
    };
  }

  const matches = [];
  const limit = data.length - needle.length;

  for (let i = 0; i <= limit; ) {
    let found = true;
    for (let j = 0; j < needle.length; j++) {
      if (data[i + j] !== needle[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      matches.push(i);
      if (matches.length >= maxResults) {
        return {
          pattern: needle,
          matches,
          count: matches.length,
          truncated: true,
        };
      }
      i += overlap ? 1 : needle.length;
    } else {
      i += 1;
    }
  }

  return {
    pattern: needle,
    matches,
    count: matches.length,
    truncated: false,
  };
}

export function findNext(bytes, pattern, fromOffset, options = {}) {
  const data = toUint8Array(bytes);
  const mode = options.mode || 'hex';
  const needle = patternToBytes(pattern, mode);
  const start = Math.max(0, Number(fromOffset ?? -1) + 1);
  if (needle.length === 0 || start + needle.length > data.length) return null;

  for (let i = start; i <= data.length - needle.length; i++) {
    let found = true;
    for (let j = 0; j < needle.length; j++) {
      if (data[i + j] !== needle[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return null;
}

export function findPrevious(bytes, pattern, fromOffset, options = {}) {
  const data = toUint8Array(bytes);
  const mode = options.mode || 'hex';
  const needle = patternToBytes(pattern, mode);
  const end = Math.min(data.length - needle.length, Number(fromOffset ?? data.length) - 1);
  if (needle.length === 0 || end < 0) return null;

  for (let i = end; i >= 0; i--) {
    let found = true;
    for (let j = 0; j < needle.length; j++) {
      if (data[i + j] !== needle[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return null;
}
