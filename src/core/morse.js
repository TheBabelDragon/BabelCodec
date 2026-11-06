/**
 * Morse code conversion (ITU International Morse).
 */

import { MalformedInputError, ValidationError } from './errors.js';

const CHAR_TO_MORSE = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.',
  G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..',
  M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.',
  S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.',
  '!': '-.-.--', '/': '-..-.', '(': '-.--.', ')': '-.--.-',
  '&': '.-...', ':': '---...', ';': '-.-.-.', '=': '-...-',
  '+': '.-.-.', '-': '-....-', '_': '..--.-', '"': '.-..-.',
  '$': '...-..-', '@': '.--.-.',
  ' ': '/',
};

const MORSE_TO_CHAR = Object.fromEntries(
  Object.entries(CHAR_TO_MORSE).map(([k, v]) => [v, k])
);

export function encodeMorse(text) {
  if (typeof text !== 'string') {
    throw new ValidationError('Morse encode expects a string', { code: 'TYPE_ERROR' });
  }
  if (text.length === 0) return '';

  const upper = text.toUpperCase();
  const words = upper.split(/\s+/);
  const outWords = [];

  for (const word of words) {
    if (word.length === 0) continue;
    const letters = [];
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      const code = CHAR_TO_MORSE[ch];
      if (!code) {
        throw new MalformedInputError(
          `Unsupported character for Morse: "${ch}" (U+${ch.charCodeAt(0).toString(16).toUpperCase()})`,
          { code: 'UNSUPPORTED_CHAR', offset: i, details: { char: ch } }
        );
      }
      if (code === '/') continue;
      letters.push(code);
    }
    if (letters.length) outWords.push(letters.join(' '));
  }
  return outWords.join(' / ');
}

export function decodeMorse(input) {
  if (typeof input !== 'string') {
    throw new ValidationError('Morse decode expects a string', { code: 'TYPE_ERROR' });
  }
  if (input.trim().length === 0) return '';

  const normalized = input.trim().replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ');
  const words = normalized.split(' / ');
  const outWords = [];

  for (const word of words) {
    if (word.trim().length === 0) {
      outWords.push('');
      continue;
    }
    const codes = word.trim().split(' ').filter((c) => c.length > 0);
    let letters = '';
    for (const code of codes) {
      const ch = MORSE_TO_CHAR[code];
      if (!ch) {
        throw new MalformedInputError(
          `Unknown Morse sequence: "${code}"`,
          { code: 'UNKNOWN_MORSE', details: { sequence: code } }
        );
      }
      if (ch === ' ') continue;
      letters += ch;
    }
    outWords.push(letters);
  }
  return outWords.join(' ');
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
