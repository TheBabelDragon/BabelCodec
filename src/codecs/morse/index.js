/**
 * Morse subsystem — package subpath: babelcodec/morse
 */

export {
  PROFILE_ID,
  PROFILE_VERSION,
  CHAR_TO_MORSE,
  MORSE_TO_CHAR,
  DEFAULT_TIMING,
} from './profiles.js';

export { encodeMorse, encodeMorseDetailed } from './encoder.js';
export { decodeMorse, decodeMorseDetailed } from './decoder.js';
export {
  MORSE_BLOCK_SCHEMA,
  patternToSymbols,
  textToMorseBlock,
  blockToMorseString,
  blockDuration,
  blockTimeline,
  serializeMorseBlock,
} from './blocks.js';
export { unitsToMs } from './timing.js';
export { isSupportedMorseChar, isValidMorsePattern } from './validation.js';
