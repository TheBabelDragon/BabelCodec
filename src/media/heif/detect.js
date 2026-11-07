/**
 * HEIC/HEIF format detection and brand validation.
 * Pure structural checks — no decoder required.
 */

import { parseBoxHeader, parseFtyp, walkBoxes, flattenBoxTree } from './boxes.js';

/** Brands commonly used for HEVC still-image HEIF */
export const HEVC_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs',
]);

/** Generic HEIF brands (codec not implied by brand alone) */
export const HEIF_BRANDS = new Set([
  'mif1', 'msf1', 'miaf',
]);

/** AVIF brands (out of scope for HEVC decoder, but detectable) */
export const AVIF_BRANDS = new Set([
  'avif', 'avis', 'avio',
]);

/**
 * Fast signature check: is this plausibly an ISOBMFF file with ftyp?
 * @param {Uint8Array} bytes
 */
export function hasFtypSignature(bytes) {
  if (!bytes || bytes.length < 12) return false;
  try {
    const header = parseBoxHeader(bytes, 0, bytes.length);
    return header !== null && header.type === 'ftyp';
  } catch {
    return false;
  }
}

/**
 * Classify file by brands.
 * @param {Uint8Array} bytes
 * @returns {{
 *   isIsobmff: boolean,
 *   isHeif: boolean,
 *   isHeic: boolean,
 *   isAvif: boolean,
 *   majorBrand: string|null,
 *   compatibleBrands: string[],
 *   hevcBrand: boolean,
 *   warnings: string[],
 * }}
 */
export function classifyHeif(bytes) {
  const result = {
    isIsobmff: false,
    isHeif: false,
    isHeic: false,
    isAvif: false,
    majorBrand: null,
    compatibleBrands: [],
    hevcBrand: false,
    warnings: [],
  };

  if (!bytes || bytes.length < 12) {
    result.warnings.push('Input too short for ftyp');
    return result;
  }

  try {
    const header = parseBoxHeader(bytes, 0, bytes.length);
    if (!header || header.type !== 'ftyp') {
      result.warnings.push('Missing or invalid ftyp box at offset 0');
      return result;
    }
    result.isIsobmff = true;
    const ftyp = parseFtyp(bytes, header);
    if (!ftyp) {
      result.warnings.push('Could not parse ftyp payload');
      return result;
    }
    result.majorBrand = ftyp.majorBrand;
    result.compatibleBrands = ftyp.compatibleBrands;

    const allBrands = [ftyp.majorBrand, ...ftyp.compatibleBrands];
    const hasHevc = allBrands.some((b) => HEVC_BRANDS.has(b));
    const hasHeif = allBrands.some((b) => HEIF_BRANDS.has(b));
    const hasAvif = allBrands.some((b) => AVIF_BRANDS.has(b));

    result.hevcBrand = hasHevc;
    result.isAvif = hasAvif && !hasHevc;
    result.isHeic = hasHevc;
    result.isHeif = hasHevc || hasHeif || (hasAvif && !hasHevc);

    if (hasAvif && hasHevc) {
      result.warnings.push('File advertises both AVIF and HEVC brands');
    }
    if (!result.isHeif && !result.isAvif) {
      result.warnings.push(`Unrecognized brands: major=${ftyp.majorBrand}`);
    }
  } catch (e) {
    result.warnings.push(`classifyHeif error: ${e.message || e}`);
  }

  return result;
}

/**
 * Filename extension hint only — never used as sole validation.
 * @param {string} name
 */
export function extensionSuggestsHeif(name) {
  if (!name || typeof name !== 'string') return false;
  const lower = name.toLowerCase();
  return (
    lower.endsWith('.heic') ||
    lower.endsWith('.heif') ||
    lower.endsWith('.heics') ||
    lower.endsWith('.heifs') ||
    lower.endsWith('.hif')
  );
}

/**
 * Structural container walk for inspection (top-level + common nested).
 * @param {Uint8Array} bytes
 * @param {object} [options]
 */
export function inspectContainer(bytes, options = {}) {
  const classification = classifyHeif(bytes);
  if (!classification.isIsobmff) {
    return {
      classification,
      boxes: [],
      flat: [],
      errors: ['Not a valid ISOBMFF file with leading ftyp'],
    };
  }

  const errors = [];
  let boxes = [];
  try {
    boxes = walkBoxes(bytes, 0, bytes.length, {
      recursive: true,
      maxBoxes: options.maxBoxes ?? 5000,
    });
  } catch (e) {
    errors.push(`Box walk failed: ${e.message || e}`);
  }

  const flat = flattenBoxTree(boxes);

  return {
    classification,
    boxes,
    flat,
    errors,
  };
}
