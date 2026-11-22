/**
 * Artifact metadata — distinct from source content and representations.
 * Nested objects and arrays are deep-cloned so mutations never cross artifacts.
 */

/**
 * Deep clone plain JSON-like values (objects, arrays, primitives).
 * Does not attempt to clone class instances or functions.
 * @param {*} value
 */
export function deepCloneMeta(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => deepCloneMeta(v));
  }
  // Typed arrays / ArrayBuffer are not metadata — leave as-is (caller should not put them here)
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  const out = {};
  for (const k of Object.keys(value)) {
    out[k] = deepCloneMeta(value[k]);
  }
  return out;
}

/**
 * @param {object} [input]
 * @returns {object}
 */
export function createMetadata(input = {}) {
  const out = deepCloneMeta(input && typeof input === 'object' ? input : {});
  if (out.width != null) out.width = Number(out.width);
  if (out.height != null) out.height = Number(out.height);
  if (out.byteLength != null) out.byteLength = Number(out.byteLength);
  return out;
}

/**
 * Merge without mutating original. Nested structures are independently owned.
 * @param {object} base
 * @param {object} patch
 */
export function mergeMetadata(base, patch) {
  return createMetadata({ ...deepCloneMeta(base || {}), ...deepCloneMeta(patch || {}) });
}
