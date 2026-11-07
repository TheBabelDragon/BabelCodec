/**
 * HEIF/HEIC decoder adapter interface and default implementation.
 *
 * Architecture:
 *   decodeHEIF(fileBytes, options) → structured DecodeResult
 *
 * The pixel decoder is pluggable. When a WASM backend is available it is used;
 * otherwise structural inspection still works and decode reports unsupported codec.
 *
 * No network access. No execution of embedded content.
 */

import { classifyHeif, extensionSuggestsHeif, hasFtypSignature } from './detect.js';
import { walkBoxes, parseFtyp, parseBoxHeader, flattenBoxTree } from './boxes.js';

/** Default max input size (matches BabelCodec file limit unless raised) */
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

/**
 * @typedef {object} DecodedImage
 * @property {number} width
 * @property {number} height
 * @property {Uint8ClampedArray|null} rgba  RGBA8 pixels, or null if not decoded
 * @property {boolean} isPrimary
 * @property {number} index
 * @property {string} [colorSpace]
 */

/**
 * @typedef {object} DecodeResult
 * @property {boolean} ok
 * @property {string} status  'decoded' | 'structural_only' | 'unsupported' | 'error'
 * @property {DecodedImage[]} images
 * @property {number} imageCount
 * @property {number|null} primaryIndex
 * @property {object} container  classification + box summary
 * @property {object|null} metadata
 * @property {string[]} warnings
 * @property {string[]} errors
 * @property {string|null} codec
 * @property {Uint8Array} sourceBytes  reference to original buffer (not copied)
 */

/**
 * Validate input bounds and type.
 * @param {Uint8Array|ArrayBuffer} input
 * @param {object} options
 */
function normalizeInput(input, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let bytes;
  if (input instanceof Uint8Array) {
    bytes = input;
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (ArrayBuffer.isView(input)) {
    bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else {
    throw new TypeError('decodeHEIF: expected Uint8Array or ArrayBuffer');
  }
  if (bytes.length === 0) {
    return { error: 'Empty input', bytes: null };
  }
  if (bytes.length > maxBytes) {
    return {
      error: `File exceeds size limit (${bytes.length} > ${maxBytes} bytes)`,
      bytes: null,
    };
  }
  return { error: null, bytes };
}

/**
 * Extract lightweight structural metadata from boxes (no pixel decode).
 */
function extractStructuralMetadata(bytes, boxes) {
  const meta = {
    dimensions: null,
    brands: null,
    handler: null,
    itemCount: null,
    hasExif: false,
    notes: [],
  };

  const top = boxes || walkBoxes(bytes, 0, bytes.length, { recursive: true, maxBoxes: 2000 });
  const ftypBox = top.find((b) => b.type === 'ftyp');
  if (ftypBox) {
    const ftyp = parseFtyp(bytes, ftypBox);
    if (ftyp) meta.brands = ftyp;
  }

  // Look for ispe (image spatial extents) under ipco
  const flat = flattenBoxTree(top);
  for (const b of flat) {
    if (b.type === 'ispe' && b.dataSize >= 12) {
      try {
        // FullBox + width + height (version/flags already in data)
        const w = (bytes[b.dataOffset + 4] << 24) | (bytes[b.dataOffset + 5] << 16) |
          (bytes[b.dataOffset + 6] << 8) | bytes[b.dataOffset + 7];
        const h = (bytes[b.dataOffset + 8] << 24) | (bytes[b.dataOffset + 9] << 16) |
          (bytes[b.dataOffset + 10] << 8) | bytes[b.dataOffset + 11];
        if (w > 0 && h > 0 && w < 100000 && h < 100000) {
          meta.dimensions = { width: w >>> 0, height: h >>> 0 };
        }
      } catch {
        /* ignore */
      }
    }
    if (b.type === 'Exif' || (b.type === 'infe' /* check later */)) {
      meta.hasExif = meta.hasExif || b.type === 'Exif';
    }
    if (b.type === 'hdlr' && b.dataSize >= 12) {
      try {
        meta.handler = String.fromCharCode(
          bytes[b.dataOffset + 8],
          bytes[b.dataOffset + 9],
          bytes[b.dataOffset + 10],
          bytes[b.dataOffset + 11],
        );
      } catch {
        /* ignore */
      }
    }
  }

  return meta;
}

/** Optional external decoder factory. Set via setHeifDecoderBackend. */
let decoderBackend = null;

/**
 * Register a pixel-decoding backend.
 * Backend must implement: async decode(bytes: Uint8Array, options) => { images: DecodedImage[], warnings?: string[], codec?: string }
 * @param {object|null} backend
 */
export function setHeifDecoderBackend(backend) {
  decoderBackend = backend;
}

export function getHeifDecoderBackend() {
  return decoderBackend;
}

/**
 * Primary decode entry point.
 * Always performs structural validation. Pixel decode only if backend is registered
 * and the file appears to be HEVC-HEIF.
 *
 * @param {Uint8Array|ArrayBuffer} input
 * @param {object} [options]
 * @param {number} [options.maxBytes]
 * @param {string} [options.filename]  extension hint only
 * @param {boolean} [options.pixels=true]  attempt pixel decode when backend present
 * @returns {Promise<DecodeResult>}
 */
export async function decodeHEIF(input, options = {}) {
  const warnings = [];
  const errors = [];
  const { error, bytes } = normalizeInput(input, options);
  if (error) {
    return {
      ok: false,
      status: 'error',
      images: [],
      imageCount: 0,
      primaryIndex: null,
      container: { classification: null },
      metadata: null,
      warnings,
      errors: [error],
      codec: null,
      sourceBytes: bytes || new Uint8Array(0),
    };
  }

  const classification = classifyHeif(bytes);
  if (options.filename && extensionSuggestsHeif(options.filename) && !classification.isIsobmff) {
    warnings.push('Filename suggests HEIF but ftyp signature is missing or invalid');
  }

  if (!classification.isIsobmff) {
    return {
      ok: false,
      status: 'error',
      images: [],
      imageCount: 0,
      primaryIndex: null,
      container: { classification },
      metadata: null,
      warnings: [...warnings, ...classification.warnings],
      errors: ['Not a valid HEIF/ISOBMFF file'],
      codec: null,
      sourceBytes: bytes,
    };
  }

  let boxes = [];
  try {
    boxes = walkBoxes(bytes, 0, bytes.length, { recursive: true, maxBoxes: 5000 });
  } catch (e) {
    errors.push(`Container parse error: ${e.message || e}`);
  }

  const metadata = extractStructuralMetadata(bytes, boxes);
  const container = {
    classification,
    boxCount: boxes.length,
    topLevelTypes: boxes.map((b) => b.type),
  };

  // AVIF is detectable but not decoded by the HEVC backend
  if (classification.isAvif && !classification.hevcBrand) {
    warnings.push('AVIF brand detected — HEVC pixel decoder does not apply');
    return {
      ok: true,
      status: 'unsupported',
      images: [],
      imageCount: 0,
      primaryIndex: null,
      container,
      metadata,
      warnings: [...warnings, ...classification.warnings],
      errors,
      codec: 'av1',
      sourceBytes: bytes,
    };
  }

  const wantPixels = options.pixels !== false;
  if (wantPixels && decoderBackend && typeof decoderBackend.decode === 'function') {
    try {
      const decoded = await decoderBackend.decode(bytes, options);
      const images = (decoded.images || []).map((img, i) => ({
        width: img.width,
        height: img.height,
        rgba: img.rgba ?? img.data ?? null,
        isPrimary: img.isPrimary ?? i === 0,
        index: i,
        colorSpace: img.colorSpace || 'srgb',
      }));
      if (images.length && metadata.dimensions == null && images[0].width) {
        metadata.dimensions = { width: images[0].width, height: images[0].height };
      }
      return {
        ok: images.length > 0,
        status: images.length > 0 ? 'decoded' : 'structural_only',
        images,
        imageCount: images.length,
        primaryIndex: images.findIndex((im) => im.isPrimary),
        container,
        metadata,
        warnings: [...warnings, ...(decoded.warnings || []), ...classification.warnings],
        errors,
        codec: decoded.codec || (classification.hevcBrand ? 'hevc' : 'unknown'),
        sourceBytes: bytes,
      };
    } catch (e) {
      errors.push(`Pixel decoder failed: ${e.message || e}`);
      warnings.push('Falling back to structural inspection only');
    }
  } else if (wantPixels && !decoderBackend) {
    warnings.push('No pixel decoder backend registered — structural inspection only');
  }

  // Structural-only success
  const dims = metadata.dimensions;
  const placeholderImages = dims
    ? [{
        width: dims.width,
        height: dims.height,
        rgba: null,
        isPrimary: true,
        index: 0,
      }]
    : [];

  return {
    ok: true,
    status: 'structural_only',
    images: placeholderImages,
    imageCount: placeholderImages.length,
    primaryIndex: placeholderImages.length ? 0 : null,
    container,
    metadata,
    warnings: [...warnings, ...classification.warnings],
    errors,
    codec: classification.hevcBrand ? 'hevc' : classification.isHeif ? 'heif' : null,
    sourceBytes: bytes,
  };
}

/**
 * Synchronous structural-only path for tests / workers.
 */
export function inspectHEIFSync(input, options = {}) {
  const { error, bytes } = normalizeInput(input, options);
  if (error) {
    return { ok: false, errors: [error], classification: null, boxes: [], flat: [] };
  }
  const classification = classifyHeif(bytes);
  let boxes = [];
  try {
    boxes = walkBoxes(bytes, 0, bytes.length, { recursive: true, maxBoxes: 5000 });
  } catch (e) {
    return {
      ok: false,
      errors: [String(e.message || e)],
      classification,
      boxes: [],
      flat: [],
    };
  }
  return {
    ok: classification.isIsobmff,
    errors: [],
    classification,
    boxes,
    flat: flattenBoxTree(boxes),
    metadata: extractStructuralMetadata(bytes, boxes),
  };
}

export { hasFtypSignature, classifyHeif, extensionSuggestsHeif };
