/**
 * Binary structure interpretation — explicit endianness, no host assumptions.
 * Never mutates caller buffers.
 */

import { toUint8Array, cloneBytes, byteToHex, byteToBinary, isPrintableAscii } from './utils.js';
import { ValidationError } from './errors.js';
import { analyzeUtf8, decodeUtf8 } from './utf8.js';

const TYPE_SIZES = {
  uint8: 1,
  int8: 1,
  uint16: 2,
  int16: 2,
  uint32: 4,
  int32: 4,
  uint64: 8,
  int64: 8,
  float32: 4,
  float64: 8,
  bytes: null,
  hex: null,
  ascii: null,
  utf8: null,
};

export function interpretBytes(bytes, options = {}) {
  const data = toUint8Array(bytes);
  const offset = Number(options.offset ?? 0);
  const endian = options.endian === 'big' ? 'big' : 'little';
  const littleEndian = endian === 'little';

  if (!Number.isInteger(offset) || offset < 0 || offset > data.length) {
    throw new ValidationError(`Offset out of range: ${offset} (length ${data.length})`);
  }

  const remaining = data.length - offset;
  const length = options.length != null ? Number(options.length) : remaining;

  if (!Number.isInteger(length) || length < 0 || offset + length > data.length) {
    throw new ValidationError(
      `Invalid range: offset=${offset} length=${length} (buffer length ${data.length})`,
    );
  }

  const slice = data.subarray(offset, offset + length);
  const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);

  const preview = Array.from(slice)
    .map((b) => byteToHex(b))
    .join(' ');

  const results = {
    offset,
    length,
    endian,
    preview,
    bytes: cloneBytes(slice),
    values: {},
  };

  const want = options.types
    ? new Set(options.types)
    : new Set([...Object.keys(TYPE_SIZES), 'binary', 'decimal']);

  function need(n, name) {
    if (length < n) {
      results.values[name] = {
        ok: false,
        error: `Insufficient bytes: need ${n}, have ${length}`,
        size: n,
      };
      return false;
    }
    return true;
  }

  if (want.has('uint8') && need(1, 'uint8')) {
    results.values.uint8 = { ok: true, value: view.getUint8(0), size: 1 };
  }
  if (want.has('int8') && need(1, 'int8')) {
    results.values.int8 = { ok: true, value: view.getInt8(0), size: 1 };
  }
  if (want.has('uint16') && need(2, 'uint16')) {
    results.values.uint16 = {
      ok: true,
      value: view.getUint16(0, littleEndian),
      size: 2,
    };
  }
  if (want.has('int16') && need(2, 'int16')) {
    results.values.int16 = {
      ok: true,
      value: view.getInt16(0, littleEndian),
      size: 2,
    };
  }
  if (want.has('uint32') && need(4, 'uint32')) {
    results.values.uint32 = {
      ok: true,
      value: view.getUint32(0, littleEndian),
      size: 4,
    };
  }
  if (want.has('int32') && need(4, 'int32')) {
    results.values.int32 = {
      ok: true,
      value: view.getInt32(0, littleEndian),
      size: 4,
    };
  }
  if (want.has('uint64') && need(8, 'uint64')) {
    const v = view.getBigUint64(0, littleEndian);
    results.values.uint64 = {
      ok: true,
      value: v,
      valueString: v.toString(),
      size: 8,
    };
  }
  if (want.has('int64') && need(8, 'int64')) {
    const v = view.getBigInt64(0, littleEndian);
    results.values.int64 = {
      ok: true,
      value: v,
      valueString: v.toString(),
      size: 8,
    };
  }
  if (want.has('float32') && need(4, 'float32')) {
    const v = view.getFloat32(0, littleEndian);
    results.values.float32 = {
      ok: true,
      value: v,
      valueString: formatFloat(v),
      size: 4,
    };
  }
  if (want.has('float64') && need(8, 'float64')) {
    const v = view.getFloat64(0, littleEndian);
    results.values.float64 = {
      ok: true,
      value: v,
      valueString: formatFloat(v),
      size: 8,
    };
  }

  if (want.has('hex')) {
    results.values.hex = {
      ok: true,
      value: Array.from(slice).map((b) => byteToHex(b)).join(''),
      size: length,
    };
  }
  if (want.has('binary')) {
    results.values.binary = {
      ok: true,
      value: Array.from(slice).map((b) => byteToBinary(b)).join(' '),
      size: length,
    };
  }
  if (want.has('decimal')) {
    results.values.decimal = {
      ok: true,
      value: Array.from(slice).join(' '),
      size: length,
    };
  }
  if (want.has('ascii')) {
    let asciiOk = true;
    let asciiText = '';
    for (let i = 0; i < slice.length; i++) {
      const b = slice[i];
      if (b > 0x7f) {
        asciiOk = false;
        break;
      }
      asciiText += isPrintableAscii(b) ? String.fromCharCode(b) : '.';
    }
    results.values.ascii = {
      ok: asciiOk,
      value: asciiOk ? asciiText : null,
      error: asciiOk ? undefined : 'Contains non-ASCII bytes',
      size: length,
    };
  }
  if (want.has('utf8')) {
    const analysis = analyzeUtf8(slice);
    let decoded = null;
    let error = null;
    if (analysis.valid) {
      try {
        decoded = decodeUtf8(slice, { fatal: true });
      } catch (e) {
        error = e.message;
      }
    } else {
      error = 'Invalid UTF-8 sequence';
    }
    results.values.utf8 = {
      ok: analysis.valid && error == null,
      value: decoded,
      error: error || undefined,
      size: length,
    };
  }
  if (want.has('bytes')) {
    results.values.bytes = {
      ok: true,
      value: cloneBytes(slice),
      size: length,
    };
  }

  return results;
}

function formatFloat(v) {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return '+Infinity';
  if (v === -Infinity) return '-Infinity';
  return String(v);
}

export function validateLayout(layout, byteLength) {
  const errors = [];
  const warnings = [];
  const coverage = new Array(byteLength).fill(null);

  if (!layout || typeof layout !== 'object') {
    return { ok: false, errors: ['Layout must be an object'], warnings, coverage: [] };
  }

  const fields = Array.isArray(layout.fields) ? layout.fields : [];
  if (fields.length === 0) {
    warnings.push('Layout has no fields');
  }

  const names = new Set();

  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const label = f?.name ? `"${f.name}"` : `field[${i}]`;

    if (!f || typeof f !== 'object') {
      errors.push(`${label}: must be an object`);
      continue;
    }
    if (typeof f.name !== 'string' || !f.name.trim()) {
      errors.push(`${label}: name is required`);
    } else if (names.has(f.name)) {
      errors.push(`${label}: duplicate field name`);
    } else {
      names.add(f.name);
    }

    const off = Number(f.offset);
    const len = Number(f.length);

    if (!Number.isInteger(off) || off < 0) {
      errors.push(`${label}: invalid offset ${f.offset}`);
      continue;
    }
    if (!Number.isInteger(len) || len < 0) {
      errors.push(`${label}: invalid length ${f.length}`);
      continue;
    }
    if (off + len > byteLength) {
      errors.push(
        `${label}: range [${off}, ${off + len}) exceeds buffer length ${byteLength}`,
      );
    }

    const type = f.type || 'bytes';
    const fixed = TYPE_SIZES[type];
    if (fixed != null && len !== fixed && type !== 'bytes') {
      warnings.push(
        `${label}: type ${type} typically uses ${fixed} byte(s), layout length is ${len}`,
      );
    }
    if (f.endian && f.endian !== 'little' && f.endian !== 'big') {
      errors.push(`${label}: endian must be "little" or "big"`);
    }

    for (let p = off; p < off + len && p < byteLength; p++) {
      if (coverage[p] != null) {
        errors.push(
          `${label}: overlaps with field "${coverage[p]}" at offset ${p}`,
        );
      } else {
        coverage[p] = f.name || `field[${i}]`;
      }
    }
  }

  const covered = coverage.filter((c) => c != null).length;
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    coverage,
    coveredBytes: covered,
    gapBytes: byteLength - covered,
  };
}

export function decodeLayout(bytes, layout) {
  const data = toUint8Array(bytes);
  const validation = validateLayout(layout, data.length);
  if (!validation.ok) {
    return { ok: false, fields: [], errors: validation.errors, validation };
  }

  const fields = [];
  const list = Array.isArray(layout.fields) ? layout.fields : [];

  for (const f of list) {
    const off = Number(f.offset);
    const len = Number(f.length);
    const type = f.type || 'bytes';
    const endian = f.endian === 'big' ? 'big' : 'little';
    const slice = data.subarray(off, off + len);

    let value = null;
    let valueString = null;
    let error = null;

    try {
      if (type === 'bytes' || type === 'hex') {
        value = cloneBytes(slice);
        valueString = Array.from(slice)
          .map((b) => byteToHex(b))
          .join(type === 'hex' ? '' : ' ');
      } else if (TYPE_SIZES[type] != null && TYPE_SIZES[type] > 0) {
        const interp = interpretBytes(slice, {
          offset: 0,
          length: Math.min(len, TYPE_SIZES[type]),
          endian,
          types: [type],
        });
        const entry = interp.values[type];
        if (entry?.ok) {
          value = entry.value;
          valueString =
            entry.valueString != null ? entry.valueString : String(entry.value);
        } else {
          error = entry?.error || 'Interpretation failed';
        }
      } else if (type === 'ascii' || type === 'utf8') {
        const interp = interpretBytes(slice, {
          offset: 0,
          length: len,
          types: [type],
        });
        const entry = interp.values[type];
        if (entry?.ok) {
          value = entry.value;
          valueString = entry.value;
        } else {
          error = entry?.error || 'Interpretation failed';
        }
      } else {
        value = cloneBytes(slice);
        valueString = Array.from(slice)
          .map((b) => byteToHex(b))
          .join(' ');
      }
    } catch (e) {
      error = e.message;
    }

    fields.push({
      name: f.name,
      offset: off,
      length: len,
      type,
      endian,
      description: f.description || null,
      value,
      valueString,
      error,
      preview: Array.from(slice)
        .map((b) => byteToHex(b))
        .join(' '),
    });
  }

  return {
    ok: true,
    fields,
    errors: [],
    validation,
    byteLength: data.length,
  };
}

export { TYPE_SIZES };
