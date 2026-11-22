/**
 * Typed representations for an artifact.
 * Missing representations are explicit (null), never implicit.
 *
 * Ownership: every public byte buffer is an independent copy.
 * Typed-array views must not share the caller's ArrayBuffer.
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
 * Always allocates a new ArrayBuffer; never returns a view over the source.
 *
 * @param {Uint8Array|ArrayBuffer|ArrayBufferView|null|undefined} bytes
 * @returns {Uint8Array|null}
 */
export function copyBytes(bytes) {
  if (bytes == null) return null;
  if (bytes instanceof Uint8Array) {
    // new Uint8Array(typedArray) copies into a fresh buffer
    return new Uint8Array(bytes);
  }
  if (bytes instanceof ArrayBuffer) {
    return new Uint8Array(bytes.slice(0));
  }
  if (ArrayBuffer.isView(bytes)) {
    // Critical: do NOT use (buffer, byteOffset, byteLength) — that shares storage.
    // Copy the visible range into a new Uint8Array.
    const view = /** @type {ArrayBufferView} */ (bytes);
    const out = new Uint8Array(view.byteLength);
    out.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return out;
  }
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
