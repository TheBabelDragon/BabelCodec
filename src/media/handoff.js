/**
 * Explicit suite handoff helpers — Image Studio ↔ labs.
 * Does not require network. Optional asset registry integration.
 *
 * v0.13: routes through universal artifact pipeline when available;
 * public function signatures remain compatible.
 */

import { getDefaultRegistry } from './assets/index.js';
import {
  fromBytes,
  analyzeArtifact,
  withHash,
  routeTo,
  destinationToTab,
} from './artifacts/index.js';

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
 *   onArtifact?: (artifact: object, analysis: object) => void,
 * }} [opts]
 */
export async function handoffBytesToSuite(bytes, opts = {}) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  // Artifact pipeline
  let artifact = fromBytes(buf, {
    filename: opts.filename || 'handoff.bin',
    mimeType: opts.mimeType || 'application/octet-stream',
    width: opts.width,
    height: opts.height,
    kind: opts.source === 'generated' ? 'generated' : opts.source === 'transformed' ? 'transformed' : 'file',
  });
  const analysis = analyzeArtifact(artifact, { computeHash: true });
  if (analysis.sha256) {
    artifact = withHash(artifact, analysis.sha256);
  }

  let asset = null;
  if (opts.register !== false) {
    try {
      asset = await getDefaultRegistry().createFromBytes(buf, {
        filename: opts.filename || 'handoff.bin',
        mimeType: opts.mimeType || artifact.source.mimeType || 'application/octet-stream',
        width: opts.width,
        height: opts.height,
        source: opts.source || 'transformed',
      });
    } catch {
      asset = null;
    }
  }

  if (typeof opts.onArtifact === 'function') opts.onArtifact(artifact, analysis);
  if (typeof opts.onBytes === 'function') opts.onBytes(buf);

  return { bytes: buf, asset, artifact, analysis };
}

/**
 * Route an artifact (or raw bytes) to a named destination.
 * @param {object|Uint8Array} artifactOrBytes
 * @param {string} destinationId  // router id e.g. 'hex-inspector'
 * @param {{
 *   onBytes?: (b: Uint8Array|null) => void,
 *   onNavigate?: (tab: string) => void,
 *   onRoute?: (payload: object) => void,
 * }} [opts]
 */
export function handoffArtifactToDestination(artifactOrBytes, destinationId, opts = {}) {
  let artifact = artifactOrBytes;
  if (artifactOrBytes instanceof Uint8Array || ArrayBuffer.isView(artifactOrBytes)) {
    artifact = fromBytes(
      artifactOrBytes instanceof Uint8Array
        ? artifactOrBytes
        : new Uint8Array(artifactOrBytes),
    );
  }
  const result = routeTo(artifact, destinationId);
  if (!result.ok) {
    return result;
  }
  if (typeof opts.onBytes === 'function' && result.bytes) {
    opts.onBytes(result.bytes);
  }
  if (typeof opts.onNavigate === 'function') {
    opts.onNavigate(destinationToTab(destinationId));
  }
  if (typeof opts.onRoute === 'function') {
    opts.onRoute(result);
  }
  return result;
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

export function openInSha256(onNavigate, onBytes, bytes) {
  if (typeof onBytes === 'function') onBytes(bytes);
  if (typeof onNavigate === 'function') onNavigate('sha256');
}

export function openInImageStudio(onNavigate, onBytes, bytes) {
  if (typeof onBytes === 'function') onBytes(bytes);
  if (typeof onNavigate === 'function') onNavigate('media');
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
