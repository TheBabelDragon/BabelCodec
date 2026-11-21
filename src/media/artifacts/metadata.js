/**
 * Artifact metadata — distinct from source content and representations.
 */

/**
 * @param {object} [input]
 * @returns {object}
 */
export function createMetadata(input = {}) {
  const out = { ...input };
  // Normalize common fields
  if (out.width != null) out.width = Number(out.width);
  if (out.height != null) out.height = Number(out.height);
  if (out.byteLength != null) out.byteLength = Number(out.byteLength);
  return out;
}

/**
 * Merge without mutating original.
 * @param {object} base
 * @param {object} patch
 */
export function mergeMetadata(base, patch) {
  return createMetadata({ ...(base || {}), ...(patch || {}) });
}
