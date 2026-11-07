import { CHAR_TO_MORSE, MORSE_TO_CHAR } from './profiles.js';

export function isSupportedMorseChar(ch) {
  if (typeof ch !== 'string' || !ch) return false;
  const u = ch.length === 1 ? ch.toUpperCase() : ch;
  return Object.prototype.hasOwnProperty.call(CHAR_TO_MORSE, u);
}

export function isValidMorsePattern(pattern) {
  return Object.prototype.hasOwnProperty.call(MORSE_TO_CHAR, pattern);
}
