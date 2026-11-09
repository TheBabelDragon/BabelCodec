/**
 * BabelCodec text foundation — package subpath: babelcodec/text
 * Version 0.10.0 — Rust Unicode Core is the canonical authority.
 */

export {
  iterateCodePoints,
  codePointsUPlus,
  codePointToUPlus,
  scriptOfCodePoint,
  SCRIPT_RANGES,
  initializeUnicodeCore,
  isUnicodeCoreReady,
  getUnicodeCore,
  stringToUtf16Units,
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

export {
  inspectCanonical,
  normalize,
  isXidIdentifier,
  engineVersion,
} from './unicode-core-loader.js';
