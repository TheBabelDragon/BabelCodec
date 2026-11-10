/**
 * Deterministic canonical JSON serialization for Neural Signal Contract v1.
 *
 * Rules:
 * - Object keys sorted lexicographically (UTF-16 code unit order, same as JS).
 * - null is emitted; undefined / absent keys are omitted.
 * - Arrays preserve order.
 * - Numbers must be finite; NaN and Infinity are rejected.
 * - Integers outside Number.MAX_SAFE_INTEGER must be represented as decimal strings
 *   (use { $i: "..." } only when constructing events that need bigint timestamps).
 * - Strings are UTF-16 JS strings; canonical bytes are UTF-8 of the JSON text.
 * - No platform-dependent whitespace: compact JSON, no spaces.
 */

export class CanonicalError extends Error {
  constructor(message, code = 'CANONICAL_ERROR') {
    super(message);
    this.name = 'CanonicalError';
    this.code = code;
  }
}

const SERIALIZATION_VERSION = 'babelcodec.canonical-json.v1';

/**
 * Recursively normalize a value for canonical serialization.
 * @param {unknown} value
 * @param {string} path
 * @returns {unknown}
 */
function normalize(value, path = '$') {
  if (value === undefined) {
    return undefined; // omit
  }
  if (value === null) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CanonicalError(`non-finite number at ${path}`, 'NON_FINITE');
    }
    // Normalize -0 to 0 for stability
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === 'bigint') {
    // Represent as decimal string tagged form for cross-language safety
    return { $i: value.toString(10) };
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => {
      const n = normalize(v, `${path}[${i}]`);
      return n === undefined ? null : n; // arrays cannot have holes in canonical form
    });
  }
  if (typeof value === 'object') {
    // Preserve already-tagged integer form
    if (Object.keys(value).length === 1 && typeof value.$i === 'string') {
      if (!/^-?\d+$/.test(value.$i)) {
        throw new CanonicalError(`invalid $i decimal at ${path}`, 'INVALID_INTEGER');
      }
      return { $i: value.$i };
    }
    const keys = Object.keys(value).sort();
    const out = {};
    for (const k of keys) {
      const n = normalize(value[k], `${path}.${k}`);
      if (n !== undefined) {
        out[k] = n;
      }
    }
    return out;
  }
  throw new CanonicalError(`unsupported type at ${path}: ${typeof value}`, 'UNSUPPORTED_TYPE');
}

/**
 * Produce canonical JSON text (compact, sorted keys).
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalize(value) {
  const n = normalize(value);
  if (n === undefined) {
    throw new CanonicalError('cannot canonicalize undefined root', 'EMPTY');
  }
  return JSON.stringify(n);
}

/**
 * Canonical UTF-8 bytes.
 * @param {unknown} value
 * @returns {Uint8Array}
 */
export function canonicalizeBytes(value) {
  const text = canonicalize(value);
  return new TextEncoder().encode(text);
}

/**
 * Parse canonical JSON text back to a JS value.
 * Does not re-sort; assumes input was produced by canonicalize.
 * @param {string|Uint8Array} input
 * @returns {unknown}
 */
export function decodeCanonical(input) {
  const text =
    typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true }).decode(input);
  return JSON.parse(text);
}

export function serializationVersion() {
  return SERIALIZATION_VERSION;
}

/**
 * Deep equality of canonical forms.
 */
export function canonicalEqual(a, b) {
  return canonicalize(a) === canonicalize(b);
}
