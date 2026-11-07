/**
 * Morse code conversion (ITU International Morse).
 * Delegates to src/codecs/morse for code-point-safe encode/decode.
 */

import { MalformedInputError, ValidationError } from './errors.js';
import {
  encodeMorseDetailed,
  decodeMorseDetailed,
  CHAR_TO_MORSE,
  MORSE_TO_CHAR,
} from '../codecs/morse/index.js';

export { CHAR_TO_MORSE, MORSE_TO_CHAR };

export function encodeMorse(text) {
  if (typeof text !== 'string') {
    throw new ValidationError('Morse encode expects a string', { code: 'TYPE_ERROR' });
  }
  const r = encodeMorseDetailed(text, { strict: true });
  if (!r.ok) {
    const d = r.diagnostics[0] || {};
    throw new MalformedInputError(d.message || 'Unsupported Morse character', {
      code: d.code || 'UNSUPPORTED_CHAR',
      offset: d.offset,
      details: d,
    });
  }
  return r.morse;
}

export function decodeMorse(input) {
  if (typeof input !== 'string') {
    throw new ValidationError('Morse decode expects a string', { code: 'TYPE_ERROR' });
  }
  const r = decodeMorseDetailed(input, { strict: true });
  if (!r.ok) {
    const d = r.diagnostics[0] || {};
    throw new MalformedInputError(d.message || 'Unknown Morse sequence', {
      code: d.code || 'UNKNOWN_MORSE',
      details: d,
    });
  }
  return r.text;
}

export const morseCodec = {
  id: 'morse',
  name: 'Morse',
  description: 'ITU International Morse code',
  sourceFormats: ['text'],
  destinationFormats: ['morse-string'],
  encode: encodeMorse,
  decode: decodeMorse,
};
