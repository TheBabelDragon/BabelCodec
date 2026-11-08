/**
 * Lightweight helpers to export BabelCodec → Signal Processor handoff files.
 */
import { createImageToSstvManifest, sha256HexBytes } from './manifest.js';

/**
 * Download image bytes + manifest JSON for SSTV processing.
 * @param {Uint8Array} bytes PNG preferred
 * @param {{ width?: number, height?: number, mode?: string, filename?: string }} [opts]
 */
export async function exportSstvHandoff(bytes, opts = {}) {
  if (!(bytes instanceof Uint8Array) || !bytes.length) {
    throw new Error('No image bytes to export');
  }
  const filename = opts.filename || 'babelcodec-sstv-source.png';
  const sha256 = await sha256HexBytes(bytes);
  const manifest = createImageToSstvManifest({
    filename,
    mimeType: 'image/png',
    width: opts.width,
    height: opts.height,
    mode: opts.mode || 'martin_m1',
    sampleRate: 48000,
    sha256,
  });

  downloadBytes(bytes, filename, 'image/png');
  downloadBytes(
    new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    filename.replace(/\.\w+$/, '') + '.job.json',
    'application/json'
  );
  return manifest;
}

function downloadBytes(bytes, name, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
