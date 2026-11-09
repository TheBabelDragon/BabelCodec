/**
 * Explicit Unicode normalization profiles.
 * Canonical implementation is the Rust unicode-normalization crate.
 * Default profile remains NONE — source is never silently overwritten.
 */

import {
  initializeUnicodeCore,
  normalize as rustNormalize,
} from './unicode-core-loader.js';

export const NormalizationProfile = Object.freeze({
  NONE: 'NONE',
  NFC: 'NFC',
  NFD: 'NFD',
  NFKC: 'NFKC',
  NFKD: 'NFKD',
});

export async function applyNormalization(text, profile = NormalizationProfile.NONE) {
  if (typeof text !== 'string') {
    return { text: '', profile, changed: false };
  }
  if (profile === NormalizationProfile.NONE || !profile) {
    return { text, profile: NormalizationProfile.NONE, changed: false };
  }
  if (!['NFC', 'NFD', 'NFKC', 'NFKD'].includes(profile)) {
    return { text, profile: NormalizationProfile.NONE, changed: false };
  }
  await initializeUnicodeCore();
  const res = await rustNormalize(text, profile);
  return {
    text: res.text,
    profile: res.profile,
    changed: !!res.changed,
  };
}
