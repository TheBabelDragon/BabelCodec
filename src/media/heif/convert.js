/**
 * Convert decoded RGBA images to PNG / JPEG / WebP via browser Canvas.
 * Preserves original bytes; never mutates the source.
 */

/**
 * @param {object} image  { width, height, rgba: Uint8ClampedArray }
 * @param {string} mimeType  'image/png' | 'image/jpeg' | 'image/webp'
 * @param {number} [quality=0.92]  JPEG/WebP quality 0–1
 * @returns {Promise<Blob>}
 */
export async function rgbaToBlob(image, mimeType, quality = 0.92) {
  if (!image || !image.rgba || !image.width || !image.height) {
    throw new Error('rgbaToBlob: missing image pixel data');
  }
  if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined') {
    throw new Error('rgbaToBlob: requires browser Canvas or OffscreenCanvas');
  }

  const { width, height, rgba } = image;
  const expected = width * height * 4;
  if (rgba.length < expected) {
    throw new Error(`rgbaToBlob: pixel buffer too small (${rgba.length} < ${expected})`);
  }

  let canvas;
  let ctx;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext('2d');
  } else {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');
  }
  if (!ctx) throw new Error('rgbaToBlob: 2d context unavailable');

  const imageData = new ImageData(
    rgba instanceof Uint8ClampedArray ? rgba.subarray(0, expected) : new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, expected),
    width,
    height,
  );
  ctx.putImageData(imageData, 0, 0);

  if (canvas.convertToBlob) {
    return canvas.convertToBlob({ type: mimeType, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      mimeType,
      quality,
    );
  });
}

/**
 * Check whether the current environment can encode a given MIME type.
 * @param {string} mimeType
 */
export function canEncode(mimeType) {
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') {
    return false;
  }
  try {
    const c = typeof document !== 'undefined'
      ? document.createElement('canvas')
      : new OffscreenCanvas(1, 1);
    c.width = 1;
    c.height = 1;
    if (c.toDataURL) {
      const url = c.toDataURL(mimeType);
      return typeof url === 'string' && url.startsWith(`data:${mimeType}`);
    }
    // OffscreenCanvas: assume png/jpeg ok; webp environment-dependent
    return mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/webp';
  } catch {
    return false;
  }
}

/**
 * Build a download filename from original name + new extension.
 * @param {string} originalName
 * @param {string} ext  without dot
 */
export function exportFilename(originalName, ext) {
  const base = (originalName || 'image').replace(/\.(heic|heif|heics|heifs|hif)$/i, '');
  return `${base}.${ext}`;
}

/**
 * Convert a DecodeResult primary (or selected) image to a target format.
 * @param {import('./decoder.js').DecodeResult} decodeResult
 * @param {object} options
 * @param {'png'|'jpeg'|'webp'} options.format
 * @param {number} [options.quality]
 * @param {number} [options.imageIndex]
 * @param {string} [options.originalName]
 * @returns {Promise<{ blob: Blob, mimeType: string, filename: string, lossless: boolean }>}
 */
export async function convertDecodedImage(decodeResult, options = {}) {
  const format = options.format || 'png';
  const mimeMap = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    webp: 'image/webp',
  };
  const mimeType = mimeMap[format];
  if (!mimeType) throw new Error(`Unsupported export format: ${format}`);

  if (!canEncode(mimeType) && format === 'webp') {
    throw new Error('WebP encoding is not supported in this browser');
  }

  const idx = options.imageIndex ?? decodeResult.primaryIndex ?? 0;
  const image = decodeResult.images[idx];
  if (!image || !image.rgba) {
    throw new Error('No decoded pixel data available for conversion');
  }

  const quality = options.quality ?? 0.92;
  const blob = await rgbaToBlob(image, mimeType, quality);
  const ext = format === 'jpg' ? 'jpg' : format;
  return {
    blob,
    mimeType,
    filename: exportFilename(options.originalName, ext),
    lossless: format === 'png',
  };
}
