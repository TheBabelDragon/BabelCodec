/**
 * Conversion registry — consistent interface for all codecs.
 * Engine stays independent of the UI.
 */

import { binaryCodec } from './binary.js';
import { hexCodec } from './hex.js';
import { base64Codec } from './base64.js';
import { asciiCodec } from './ascii.js';
import { utf8Codec } from './utf8.js';
import { decimalCodec } from './decimal.js';
import { octalCodec } from './octal.js';
import { morseCodec } from './morse.js';
import { ConversionError, ValidationError } from './errors.js';
import { toUint8Array } from './utils.js';

/** @type {Map<string, object>} */
const codecs = new Map();

function register(codec) {
  if (!codec?.id) throw new Error('Codec requires id');
  codecs.set(codec.id, codec);
}

register(binaryCodec);
register(hexCodec);
register(base64Codec);
register(asciiCodec);
register(utf8Codec);
register(decimalCodec);
register(octalCodec);
register(morseCodec);

export function listCodecs() {
  return Array.from(codecs.keys());
}

export function getCodec(id) {
  return codecs.get(id);
}

export function listCodecInfo() {
  return Array.from(codecs.values()).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
  }));
}

export function convert(input, fromFormat, toFormat, opts = {}) {
  const textEncoding = opts.encoding === 'ascii' ? 'ascii' : 'utf8';
  const meta = { fromFormat, toFormat, textEncoding };

  if (fromFormat === toFormat) {
    return { output: input, meta: { ...meta, identity: true } };
  }

  if (fromFormat === 'morse' || toFormat === 'morse') {
    const morse = getCodec('morse');
    if (fromFormat === 'text' && toFormat === 'morse') {
      return { output: morse.encode(input), meta };
    }
    if (fromFormat === 'morse' && toFormat === 'text') {
      return { output: morse.decode(input), meta };
    }
    throw new ValidationError(
      `Morse only converts with text (got ${fromFormat} → ${toFormat})`,
      { code: 'UNSUPPORTED_PATH' }
    );
  }

  let bytes;
  if (fromFormat === 'bytes') {
    bytes = toUint8Array(input);
  } else if (fromFormat === 'text') {
    const enc = getCodec(textEncoding);
    bytes = enc.encode(input);
  } else {
    const codec = getCodec(fromFormat);
    if (!codec) {
      throw new ValidationError(`Unknown format: ${fromFormat}`, { code: 'UNKNOWN_FORMAT' });
    }
    bytes = codec.decode(input);
  }

  meta.byteLength = bytes.length;

  if (toFormat === 'bytes') {
    return { output: bytes, meta };
  }
  if (toFormat === 'text') {
    const dec = getCodec(textEncoding);
    return { output: dec.decode(bytes), meta };
  }

  const codec = getCodec(toFormat);
  if (!codec) {
    throw new ValidationError(`Unknown format: ${toFormat}`, { code: 'UNKNOWN_FORMAT' });
  }
  return { output: codec.encode(bytes), meta };
}

export function validate(input, format, opts = {}) {
  try {
    if (format === 'bytes') {
      toUint8Array(input);
      return { valid: true };
    }
    if (format === 'text') {
      if (typeof input !== 'string') {
        return { valid: false, error: new ValidationError('Expected string') };
      }
      if (opts.encoding === 'ascii') {
        getCodec('ascii').encode(input);
      }
      return { valid: true };
    }
    const codec = getCodec(format);
    if (!codec) {
      return { valid: false, error: new ValidationError(`Unknown format: ${format}`) };
    }
    if (format === 'morse') {
      codec.decode(input);
    } else if (format === 'ascii' || format === 'utf8') {
      if (typeof input === 'string') codec.encode(input);
      else codec.decode(input);
    } else {
      codec.decode(input);
    }
    return { valid: true };
  } catch (e) {
    if (e instanceof ConversionError) {
      return { valid: false, error: e };
    }
    return { valid: false, error: new ConversionError(e.message) };
  }
}

export { codecs };
