/**
 * Explicit Unicode normalization profiles. Default is NONE.
 */

export const NormalizationProfile = Object.freeze({
  NONE: 'NONE',
  NFC: 'NFC',
  NFD: 'NFD',
  NFKC: 'NFKC',
  NFKD: 'NFKD',
});

export function applyNormalization(text, profile = NormalizationProfile.NONE) {
  if (typeof text !== 'string') {
    return { text: '', profile, changed: false };
  }
  if (profile === NormalizationProfile.NONE || !profile) {
    return { text, profile: NormalizationProfile.NONE, changed: false };
  }
  const form = profile;
  if (!['NFC', 'NFD', 'NFKC', 'NFKD'].includes(form)) {
    return { text, profile: NormalizationProfile.NONE, changed: false };
  }
  const normalized = text.normalize(form);
  return {
    text: normalized,
    profile: form,
    changed: normalized !== text,
  };
}
