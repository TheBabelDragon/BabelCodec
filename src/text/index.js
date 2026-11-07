/**
 * BabelCodec text foundation — package subpath: babelcodec/text
 */

export {
  iterateCodePoints,
  codePointsUPlus,
  codePointToUPlus,
  scriptOfCodePoint,
  SCRIPT_RANGES,
} from './unicode.js';

export { segmentGraphemes } from './graphemes.js';
export { detectScripts } from './script-detection.js';
export {
  NormalizationProfile,
  applyNormalization,
} from './normalization.js';
export { makeDiagnostic } from './diagnostics.js';
export {
  CANONICAL_SCHEMA,
  toCanonical,
  serializeCanonical,
} from './canonical.js';
