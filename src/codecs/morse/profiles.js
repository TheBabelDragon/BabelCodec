/**
 * Versioned International Morse profile.
 */

export const PROFILE_ID = 'international-morse';
export const PROFILE_VERSION = '1.0.0';

export const CHAR_TO_MORSE = Object.freeze({
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
});

export const MORSE_TO_CHAR = Object.freeze(
  Object.fromEntries(Object.entries(CHAR_TO_MORSE).map(([k, v]) => [v, k])),
);

export const DEFAULT_TIMING = Object.freeze({
  dot: 1,
  dash: 3,
  intra_symbol_gap: 1,
  letter_gap: 3,
  word_gap: 7,
});
