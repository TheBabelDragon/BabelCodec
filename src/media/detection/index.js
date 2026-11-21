/**
 * Universal detection — public surface.
 */

export { detectInput, normalizeInput, DETECTION_SCHEMA } from './detect.js';
export { createFinding, createAlert } from './finding.js';
export { DEFAULT_LIMITS, resolveLimits } from './limits.js';
export { probeBinarySignatures } from './signatures.js';
export {
  probeTextAndEncoding,
  probeStructuredText,
  probeEncodedForms,
  isValidBase64Token,
  isStrongEmbeddedBase64Candidate,
  isStrongWholeInputBase64,
  hasCanonicalPadBits,
  scanBase64Tokens,
  charRangeToUtf8Bytes,
} from './text.js';
