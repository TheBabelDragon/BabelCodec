/**
 * Typed feature-vector representation — feature.vector.v1
 *
 * No silent normalize/clip/reinterpret. Transformations must be recorded.
 */

export const FEATURE_TYPES = Object.freeze([
  'float64',
  'int64',
  'boolean',
  'categorical',
  'vector_fixed',
  'vector_variable',
]);

/**
 * @typedef {{
 *   feature_id: string,
 *   name: string,
 *   type: string,
 *   unit?: string|null,
 *   dimensions?: number[]|null,
 *   value: unknown,
 *   extraction_method?: string|null,
 *   provenance?: object|null,
 *   transform?: { method: string, params?: object }|null,
 * }}
 * Feature
 */

/**
 * Validate a single feature descriptor + value.
 * @param {Feature} f
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateFeature(f) {
  const errors = [];
  if (!f || typeof f !== 'object') return { ok: false, errors: ['feature must be object'] };
  if (typeof f.feature_id !== 'string' || !f.feature_id) errors.push('feature_id required');
  if (typeof f.name !== 'string' || !f.name) errors.push('name required');
  if (!FEATURE_TYPES.includes(f.type)) errors.push(`unsupported type: ${f.type}`);

  const v = f.value;
  switch (f.type) {
    case 'float64':
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        errors.push(`float64 value must be finite number (${f.feature_id})`);
      }
      break;
    case 'int64':
      if (typeof v === 'number') {
        if (!Number.isInteger(v) || !Number.isSafeInteger(v)) {
          errors.push(`int64 number must be safe integer (${f.feature_id})`);
        }
      } else if (typeof v === 'object' && v && typeof v.$i === 'string') {
        if (!/^-?\d+$/.test(v.$i)) errors.push(`int64 $i invalid (${f.feature_id})`);
      } else {
        errors.push(`int64 value must be safe integer or {$i:"..."} (${f.feature_id})`);
      }
      break;
    case 'boolean':
      if (typeof v !== 'boolean') errors.push(`boolean required (${f.feature_id})`);
      break;
    case 'categorical':
      if (typeof v !== 'string') errors.push(`categorical must be string (${f.feature_id})`);
      break;
    case 'vector_fixed': {
      if (!Array.isArray(v)) {
        errors.push(`vector_fixed must be array (${f.feature_id})`);
        break;
      }
      const dims = f.dimensions;
      if (!Array.isArray(dims) || dims.length < 1) {
        errors.push(`vector_fixed requires dimensions (${f.feature_id})`);
      } else {
        const expected = dims.reduce((a, b) => a * b, 1);
        if (v.length !== expected) {
          errors.push(
            `vector_fixed length ${v.length} != product(dimensions)=${expected} (${f.feature_id})`,
          );
        }
      }
      for (let i = 0; i < v.length; i++) {
        if (typeof v[i] !== 'number' || !Number.isFinite(v[i])) {
          errors.push(`vector_fixed[${i}] non-finite (${f.feature_id})`);
          break;
        }
      }
      break;
    }
    case 'vector_variable':
      if (!Array.isArray(v)) {
        errors.push(`vector_variable must be array (${f.feature_id})`);
      } else {
        for (let i = 0; i < v.length; i++) {
          if (typeof v[i] !== 'number' || !Number.isFinite(v[i])) {
            errors.push(`vector_variable[${i}] non-finite (${f.feature_id})`);
            break;
          }
        }
      }
      break;
    default:
      break;
  }

  return errors.length ? { ok: false, errors } : { ok: true };
}

/**
 * Validate a feature vector (array of features).
 * @param {Feature[]} features
 */
export function validateFeatureVector(features) {
  if (!Array.isArray(features)) return { ok: false, errors: ['features must be array'] };
  const errors = [];
  const ids = new Set();
  for (const f of features) {
    const r = validateFeature(f);
    if (!r.ok) errors.push(...r.errors);
    if (f && f.feature_id) {
      if (ids.has(f.feature_id)) errors.push(`duplicate feature_id: ${f.feature_id}`);
      ids.add(f.feature_id);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

/**
 * Build a feature object (does not validate).
 */
export function feature(opts) {
  const f = {
    feature_id: String(opts.feature_id),
    name: String(opts.name),
    type: opts.type,
    value: opts.value,
  };
  if (opts.unit != null) f.unit = opts.unit;
  if (opts.dimensions != null) f.dimensions = opts.dimensions;
  if (opts.extraction_method != null) f.extraction_method = opts.extraction_method;
  if (opts.provenance != null) f.provenance = opts.provenance;
  if (opts.transform != null) f.transform = opts.transform;
  return f;
}
