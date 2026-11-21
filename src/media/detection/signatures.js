/**
 * Binary and structural signature probes (offline, no deps).
 */

import { createFinding, createAlert } from './finding.js';

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 */
function sliceEq(bytes, offset, sig) {
  if (offset + sig.length > bytes.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

/**
 * Probe well-known binary formats at offset 0 and common embedded offsets.
 * @param {Uint8Array} bytes
 * @param {{ maxFindings?: number }} [opts]
 * @returns {object[]}
 */
export function probeBinarySignatures(bytes, opts = {}) {
  const findings = [];
  const max = opts.maxFindings ?? 16;
  if (!bytes || bytes.length === 0) return findings;

  const probes = [
    {
      name: 'png',
      type: 'image',
      subtype: 'png',
      sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      minLen: 8,
      decoder: true,
    },
    {
      name: 'jpeg',
      type: 'image',
      subtype: 'jpeg',
      sig: [0xff, 0xd8, 0xff],
      minLen: 3,
      decoder: true,
    },
    {
      name: 'gif',
      type: 'image',
      subtype: 'gif',
      sig: [0x47, 0x49, 0x46, 0x38],
      minLen: 6,
      decoder: true,
    },
    {
      name: 'webp',
      type: 'image',
      subtype: 'webp',
      // RIFF....WEBP — checked specially
      check: (b, o) =>
        b.length >= o + 12 &&
        sliceEq(b, o, [0x52, 0x49, 0x46, 0x46]) &&
        sliceEq(b, o + 8, [0x57, 0x45, 0x42, 0x50]),
      minLen: 12,
      decoder: true,
    },
    {
      name: 'bmp',
      type: 'image',
      subtype: 'bmp',
      sig: [0x42, 0x4d],
      minLen: 14,
      decoder: true,
    },
    {
      name: 'pdf',
      type: 'document',
      subtype: 'pdf',
      sig: [0x25, 0x50, 0x44, 0x46], // %PDF
      minLen: 5,
      decoder: false,
    },
    {
      name: 'zip',
      type: 'archive',
      subtype: 'zip',
      sig: [0x50, 0x4b, 0x03, 0x04],
      minLen: 4,
      decoder: false,
      alert: createAlert('info', 'ARCHIVE', 'ZIP signature recognized; archives are not auto-extracted'),
    },
    {
      name: 'zip-empty',
      type: 'archive',
      subtype: 'zip',
      sig: [0x50, 0x4b, 0x05, 0x06],
      minLen: 4,
      decoder: false,
    },
    {
      name: 'heif',
      type: 'image',
      subtype: 'heif',
      check: (b, o) => {
        if (b.length < o + 12) return false;
        const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
        return type === 'ftyp';
      },
      minLen: 12,
      decoder: false,
    },
  ];

  // Scan at offset 0 first, then light scan for embedded signatures
  const offsets = [0];
  const step = Math.max(16, Math.floor(bytes.length / 64) || 16);
  for (let o = step; o < bytes.length - 4 && offsets.length < 32; o += step) {
    offsets.push(o);
  }
  // Also check a few common embed starts
  for (const o of [4, 8, 16, 32, 64, 128, 256, 512, 1024]) {
    if (o < bytes.length) offsets.push(o);
  }

  const seen = new Set();

  for (const o of offsets) {
    if (findings.length >= max) break;
    for (const p of probes) {
      if (findings.length >= max) break;
      const key = `${p.name}@${o}`;
      if (seen.has(key)) continue;

      let match = false;
      if (p.check) {
        match = p.check(bytes, o);
      } else if (p.sig) {
        match = sliceEq(bytes, o, p.sig);
      }
      if (!match) continue;
      seen.add(key);

      const remaining = bytes.length - o;
      const complete =
        remaining >= (p.minLen || p.sig?.length || 4)
          ? o === 0 && remaining >= (p.minLen || 8)
            ? 'complete'
            : remaining < (p.minLen || 8)
              ? 'partial'
              : o > 0
                ? 'partial'
                : 'complete'
          : 'truncated';

      const alerts = [];
      if (p.alert) alerts.push(p.alert);
      if (complete === 'partial' || complete === 'truncated') {
        alerts.push(
          createAlert('warning', 'PARTIAL_SIGNATURE', `${p.subtype} signature at offset ${o} may be incomplete`),
        );
      }
      if (p.name === 'zip' || p.name === 'zip-empty') {
        alerts.push(
          createAlert('security', 'NO_AUTO_EXTRACT', 'Archive content is not automatically extracted'),
        );
      }

      findings.push(
        createFinding({
          type: p.type,
          subtype: p.subtype,
          confidence: o === 0 ? 0.95 : 0.7,
          evidence: [`magic:${p.name}`, `offset:${o}`],
          offset: o,
          length: Math.min(remaining, p.minLen || 16),
          completeness: complete,
          decoder_available: Boolean(p.decoder),
          supported: true,
          alerts,
        }),
      );
    }
  }

  return findings;
}
