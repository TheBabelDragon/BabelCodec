/**
 * Raster export helpers via Canvas (browser) or limited Node stubs.
 */

export function canEncodeMime(mimeType) {
  if (typeof document === 'undefined') {
    return mimeType === 'image/svg+xml';
  }
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    const url = c.toDataURL(mimeType);
    return typeof url === 'string' && url.startsWith('data:');
  } catch {
    return false;
  }
}

export function canvasToBlob(canvas, opts = {}) {
  const mimeType = opts.mimeType || 'image/png';
  const quality = opts.quality != null ? opts.quality : 0.92;
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      try {
        const dataUrl = canvas.toDataURL(mimeType, quality);
        resolve(dataUrlToBlob(dataUrl));
      } catch (e) {
        reject(e);
      }
      return;
    }
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error(`Failed to encode ${mimeType}`));
        else resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

export async function imageDataToBlob(imageData, opts = {}) {
  if (typeof document === 'undefined') {
    throw new Error('Raster export requires a browser Canvas environment');
  }
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  const id =
    imageData instanceof ImageData
      ? imageData
      : new ImageData(imageData.data, imageData.width, imageData.height);
  ctx.putImageData(id, 0, 0);
  return canvasToBlob(canvas, opts);
}

export function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const header = parts[0] || '';
  const data = parts[1] || '';
  const mimeMatch = /data:([^;]+)/.exec(header);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function exportFilename(originalName, format) {
  const base = (originalName || 'image').replace(/\.[^.]+$/, '') || 'image';
  const ext = format === 'jpeg' ? 'jpg' : format;
  return `${base}.${ext}`;
}
