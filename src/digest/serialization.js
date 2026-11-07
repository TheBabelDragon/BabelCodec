import { applyNormalization, NormalizationProfile } from '../text/normalization.js';

export function utf8Bytes(text) {
  return new TextEncoder().encode(text ?? '');
}

export function serializeCanonicalToBytes(canonical, opts = {}) {
  const source = canonical?.source?.text ?? '';
  const norm = applyNormalization(source, opts.normalization || NormalizationProfile.NONE);
  const bytes = utf8Bytes(norm.text);
  return {
    bytes,
    profile: `utf8+${norm.profile}`,
    text: norm.text,
  };
}

export function serializeMorseBlockToBytes(block) {
  const text = block?.source?.text ?? '';
  return {
    bytes: utf8Bytes(text),
    profile: 'utf8+source-text',
    text,
  };
}
