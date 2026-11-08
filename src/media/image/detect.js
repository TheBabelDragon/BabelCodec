/**
 * Image format detection from magic bytes (offline, no dependencies).
 */

/** @typedef {'png'|'jpeg'|'webp'|'gif'|'bmp'|'heif'|'svg'|'unknown'} ImageFormat */

/**
 * @param {Uint8Array} bytes
 * @returns {{ format: ImageFormat, mimeType: string, confidence: 'high'|'low' }}
 */
export function detectImageFormat(bytes) {
  if (!bytes || bytes.length < 4) {
    return { format: 'unknown', mimeType: 'application/octet-stream', confidence: 'low' };
  }
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes.length >= 8 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { format: 'png', mimeType: 'image/png', confidence: 'high' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { format: 'jpeg', mimeType: 'image/jpeg', confidence: 'high' };
  }
  if (
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39)
  ) {
    return { format: 'gif', mimeType: 'image/gif', confidence: 'high' };
  }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { format: 'bmp', mimeType: 'image/bmp', confidence: 'high' };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { format: 'webp', mimeType: 'image/webp', confidence: 'high' };
  }
  if (looksLikeSvg(bytes)) {
    return { format: 'svg', mimeType: 'image/svg+xml', confidence: 'high' };
  }
  if (bytes.length >= 12) {
    const size = (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
    const type =
      String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (type === 'ftyp' && size >= 16 && size <= bytes.length + 8) {
      return { format: 'heif', mimeType: 'image/heif', confidence: 'high' };
    }
  }
  return { format: 'unknown', mimeType: 'application/octet-stream', confidence: 'low' };
}

function looksLikeSvg(bytes) {
  const n = Math.min(bytes.length, 256);
  let s = '';
  for (let i = 0; i < n; i++) {
    const c = bytes[i];
    if (c === 0) return false;
    s += String.fromCharCode(c);
  }
  const t = s.trimStart().toLowerCase();
  return t.startsWith('<?xml') || t.startsWith('<svg') || t.includes('<svg');
}

export function extensionSuggestsImage(name) {
  if (!name) return false;
  return /\.(png|jpe?g|webp|gif|bmp|heic|heif|svg)$/i.test(name);
}
