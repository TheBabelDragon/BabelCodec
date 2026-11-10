/**
 * Explicit suite handoff helpers — Image Studio ↔ labs.
 * Does not require network. Optional asset registry integration.
 */

import { getDefaultRegistry } from './assets/index.js';

/**
 * @param {Uint8Array} bytes
 * @param {{
 *   filename?: string,
 *   mimeType?: string,
 *   width?: number,
 *   height?: number,
 *   source?: string,
 *   onBytes?: (b: Uint8Array|null) => void,
 *   onNavigate?: (tab: string) => void,
 *   register?: boolean,
 * }} [opts]
 */
export async function handoffBytesToSuite(bytes, opts = {}) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let asset = null;
  if (opts.register !== false) {
    try {
      asset = await getDefaultRegistry().createFromBytes(buf, {
        filename: opts.filename || 'handoff.bin',
        mimeType: opts.mimeType || 'application/octet-stream',
        width: opts.width,
        height: opts.height,
        source: opts.source || 'transformed',
      });
    } catch {
      asset = null;
    }
  }
  if (typeof opts.onBytes === 'function') opts.onBytes(buf);
  return { bytes: buf, asset };
}

export function openInHexInspector(onNavigate, onBytes, bytes) {
  if (typeof onBytes === 'function') onBytes(bytes);
  if (typeof onNavigate === 'function') onNavigate('inspector');
}

export function openInStructure(onNavigate, onBytes, bytes) {
  if (typeof onBytes === 'function') onBytes(bytes);
  if (typeof onNavigate === 'function') onNavigate('structure');
}

export function openInConverter(onNavigate, onBytes, bytes) {
  if (typeof onBytes === 'function') onBytes(bytes);
  if (typeof onNavigate === 'function') onNavigate('converter');
}

export function openInLogicLab(onNavigate, onBytes, bytes) {
  if (typeof onBytes === 'function') onBytes(bytes);
  if (typeof onNavigate === 'function') onNavigate('logic');
}

/**
 * Compose Unicode text into a simple PNG-compatible canvas payload description.
 * Actual rasterization remains in Create scene / canvas callers.
 */
export function textOverlaySpec(text, opts = {}) {
  return {
    type: 'text',
    text: String(text ?? ''),
    x: opts.x ?? 40,
    y: opts.y ?? 40,
    w: opts.w ?? 400,
    h: opts.h ?? 64,
    fill: opts.fill ?? '#e6eaf2',
    fontSize: opts.fontSize ?? 28,
    fontFamily: opts.fontFamily ?? 'system-ui, "Noto Sans", sans-serif',
    opacity: opts.opacity ?? 1,
  };
}
