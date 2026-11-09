/**
 * BabelCodec ↔ Signal Processor media job manifest (contract v1).
 * File-based handoff only. No shared origin / runtime dependency.
 */

export const CONTRACT_VERSION = 1;
export const SUPPORTED_OPERATIONS = Object.freeze([
  'image_to_sstv',
  'sstv_to_image',
  'image_handoff',
  'audio_handoff',
  'reconstructed_image',
]);
export const SSTV_MODES = Object.freeze(['martin_m1', 'robot36', 'unknown']);

/**
 * @param {object} raw
 * @returns {{ ok: true, manifest: object } | { ok: false, errors: string[] }}
 */
export function validateMediaJobManifest(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['manifest must be an object'] };
  }
  if (raw.contract_version !== CONTRACT_VERSION) {
    errors.push(`unsupported contract_version (expected ${CONTRACT_VERSION})`);
  }
  if (typeof raw.job_id !== 'string' || !raw.job_id.trim()) {
    errors.push('job_id is required');
  }
  if (typeof raw.created_at !== 'string' || !raw.created_at) {
    errors.push('created_at is required');
  }
  if (raw.source_application !== 'BabelCodec' && raw.source_application !== 'signal-processor') {
    errors.push('source_application must be BabelCodec or signal-processor');
  }
  if (!SUPPORTED_OPERATIONS.includes(raw.operation)) {
    errors.push(`unsupported operation: ${raw.operation}`);
  }
  if (!raw.asset || typeof raw.asset !== 'object') {
    errors.push('asset is required');
  } else {
    if (typeof raw.asset.filename !== 'string' || !raw.asset.filename) {
      errors.push('asset.filename is required');
    }
    if (typeof raw.asset.mime_type !== 'string' || !raw.asset.mime_type) {
      errors.push('asset.mime_type is required');
    }
    if (raw.asset.width != null) {
      const w = Number(raw.asset.width);
      if (!Number.isInteger(w) || w < 1 || w > 8192) errors.push('asset.width out of range');
    }
    if (raw.asset.height != null) {
      const h = Number(raw.asset.height);
      if (!Number.isInteger(h) || h < 1 || h > 8192) errors.push('asset.height out of range');
    }
    if (raw.asset.sha256 != null && !/^[a-f0-9]{64}$/.test(raw.asset.sha256)) {
      errors.push('asset.sha256 must be 64-char lowercase hex');
    }
  }
  if (raw.sstv) {
    if (raw.sstv.mode && !SSTV_MODES.includes(raw.sstv.mode)) {
      errors.push(`unsupported sstv.mode: ${raw.sstv.mode}`);
    }
    if (raw.sstv.sample_rate_hz != null && ![44100, 48000].includes(raw.sstv.sample_rate_hz)) {
      errors.push('sstv.sample_rate_hz must be 44100 or 48000');
    }
  }
  if (raw.audio) {
    if (raw.audio.sample_rate != null && ![44100, 48000].includes(raw.audio.sample_rate)) {
      errors.push('audio.sample_rate must be 44100 or 48000');
    }
    if (raw.audio.channels != null && raw.audio.channels !== 1) {
      errors.push('audio.channels must be 1 (mono)');
    }
    if (raw.audio.encoding != null && raw.audio.encoding !== 'pcm_s16le') {
      errors.push('audio.encoding must be pcm_s16le');
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, manifest: structuredCloneSafe(raw) };
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Create a v1 image→SSTV handoff manifest.
 * @param {object} opts
 */
export function createImageToSstvManifest(opts) {
  const {
    jobId,
    filename,
    mimeType = 'image/png',
    width,
    height,
    sha256,
    mode = 'robot36',
    sampleRate = 48000,
    provenance,
  } = opts || {};

  const manifest = {
    contract_version: CONTRACT_VERSION,
    job_id: String(jobId || `job-${Date.now()}`),
    created_at: new Date().toISOString(),
    source_application: 'BabelCodec',
    operation: 'image_to_sstv',
    asset: {
      filename: String(filename || 'source.png'),
      mime_type: mimeType,
    },
    sstv: {
      mode: SSTV_MODES.includes(mode) ? mode : 'unknown',
      sample_rate_hz: sampleRate === 44100 ? 44100 : 48000,
    },
    audio: {
      sample_rate: sampleRate === 44100 ? 44100 : 48000,
      channels: 1,
      encoding: 'pcm_s16le',
    },
  };
  if (width != null) manifest.asset.width = width;
  if (height != null) manifest.asset.height = height;
  if (sha256) {
    manifest.asset.sha256 = sha256;
    manifest.integrity = { algorithm: 'sha-256', sha256 };
  }
  if (width != null && height != null) {
    manifest.dimensions = { width, height };
  }
  if (provenance && typeof provenance === 'object') {
    manifest.provenance = { ...provenance };
  }
  const v = validateMediaJobManifest(manifest);
  if (!v.ok) throw new Error('invalid manifest: ' + v.errors.join('; '));
  return v.manifest;
}

/**
 * Parse JSON text into a validated manifest.
 * @param {string} text
 */
export function parseMediaJobManifest(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: ['invalid JSON: ' + (e.message || e)] };
  }
  return validateMediaJobManifest(raw);
}

/**
 * SHA-256 hex of bytes (Web Crypto when available).
 * @param {Uint8Array} bytes
 */
export async function sha256HexBytes(bytes) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const dig = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8).padStart(64, '0');
}
