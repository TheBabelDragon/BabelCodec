/**
 * Typed representations for an artifact.
 * Missing representations are explicit (null), never implicit.
 */

/**
 * @typedef {object} Representations
 * @property {Uint8Array|null} bytes
 * @property {string|null} text
 * @property {object|null} image  // { width, height, format, mimeType, ... } — not pixels by default
 */

/**
 * @param {Partial<Representations>} [input]
 * @returns {Representations}
 */
export function createRepresentations(input = {}) {
  return {
    bytes: copyBytes(input.bytes),
    text: input.text != null ? String(input.text) : null,
    image: input.image ? { ...input.image } : null,
  };
}

/**
 * Defensive copy of byte buffer.
 * @param {Uint8Array|ArrayBuffer|null|undefined} bytes
 * @returns {Uint8Array|null}
 */
export function copyBytes(bytes) {
  if (bytes == null) return null;
  if (bytes instanceof Uint8Array) return new Uint8Array(bytes);
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return null;
}

/**
 * Read-only view helper — returns a copy so callers cannot mutate internal state.
 * @param {Representations} reps
 */
export function freezeRepresentations(reps) {
  return {
    bytes: copyBytes(reps.bytes),
    text: reps.text,
    image: reps.image ? { ...reps.image } : null,
  };
}

export function hasBytes(reps) {
  return reps && reps.bytes != null && reps.bytes.byteLength >= 0;
}

export function hasText(reps) {
  return reps && reps.text != null;
}

export function hasImage(reps) {
  return reps && reps.image != null;
}
