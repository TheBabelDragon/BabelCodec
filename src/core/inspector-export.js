/**
 * Pure export helpers for the Hex Inspector.
 * Encode a exact Uint8Array slice into textual representations without DOM.
 * Used by the inspector UI and by regression tests that assert byte fidelity.
 */

import { encodeHex } from './hex.js';
import { encodeBase64 } from './base64.js';
import { encodeBinary } from './binary.js';
import { toUint8Array } from './utils.js';
import { sliceSelection } from './hexgrid.js';

/**
 * @typedef {{ start: number, end: number, length: number, anchor?: number }} Selection
 * end is exclusive (zero-based).
 */

/**
 * Resolve the exact bytes for an export operation.
 * @param {Uint8Array|ArrayBuffer|number[]} bytes full buffer
 * @param {'all'|'selection'} scope
 * @param {Selection|null|undefined} selection
 * @returns {{ ok: true, data: Uint8Array, scope: string, start: number, end: number, length: number }
 *         | { ok: false, error: string }}
 */
export function resolveExportBytes(bytes, scope, selection) {
  const data = toUint8Array(bytes ?? new Uint8Array(0));

  if (scope === 'all') {
    return {
      ok: true,
      data: new Uint8Array(data),
      scope: 'all',
      start: 0,
      end: data.length,
      length: data.length,
    };
  }

  if (scope !== 'selection') {
    return { ok: false, error: `Unknown export scope: ${scope}` };
  }

  if (!selection || !Number.isInteger(selection.length) || selection.length <= 0) {
    return {
      ok: false,
      error: 'No selection. Select one or more bytes, or use Copy/Download All.',
    };
  }

  const slice = sliceSelection(data, selection);
  if (slice.length === 0) {
    return {
      ok: false,
      error: 'Selection is empty. Select one or more bytes, or use Copy/Download All.',
    };
  }

  return {
    ok: true,
    data: slice,
    scope: 'selection',
    start: selection.start,
    end: selection.end,
    length: slice.length,
  };
}

/**
 * Encode resolved bytes into a textual representation.
 * @param {Uint8Array} data
 * @param {'hex'|'base64'|'binary'} format
 * @returns {string}
 */
export function encodeExportText(data, format) {
  if (format === 'hex') return encodeHex(data, { separator: ' ' });
  if (format === 'base64') return encodeBase64(data);
  if (format === 'binary') return encodeBinary(data, { groupBytes: true, separator: ' ' });
  throw new Error(`Unsupported export format: ${format}`);
}

/**
 * Build a download filename that distinguishes full-buffer vs selection.
 * @param {'all'|'selection'} scope
 * @param {'hex'|'base64'|'binary'|'bin'} format
 * @param {{ start?: number, end?: number, length?: number }} meta
 * @returns {string}
 */
export function exportFilename(scope, format, meta = {}) {
  const ext =
    format === 'hex' ? 'hex.txt' :
    format === 'base64' ? 'b64.txt' :
    format === 'binary' ? 'bin.txt' :
    'bin';

  if (scope === 'all') {
    return `babelcodec-all-${meta.length ?? 0}b.${ext}`;
  }
  const start = meta.start ?? 0;
  const end = meta.end ?? start;
  return `babelcodec-sel-${start}-${end}-${meta.length ?? 0}b.${ext}`;
}

/**
 * Attempt to write text to the clipboard.
 * Uses navigator.clipboard when available; falls back to a temporary textarea.
 * Never reports success without a successful write.
 *
 * @param {string} text
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function writeClipboardText(text) {
  if (typeof text !== 'string') {
    return { ok: false, error: 'Clipboard payload must be a string' };
  }

  // Preferred path
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    } catch (e) {
      // Fall through to legacy path
    }
  }

  // Legacy fallback (requires a focused document)
  if (typeof document === 'undefined') {
    return { ok: false, error: 'Clipboard write failed: no document available for fallback' };
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand && document.execCommand('copy');
    document.body.removeChild(ta);
    if (ok) return { ok: true };
    return { ok: false, error: 'Clipboard write failed: execCommand returned false' };
  } catch (e) {
    return { ok: false, error: `Clipboard write failed: ${e && e.message ? e.message : String(e)}` };
  }
}
