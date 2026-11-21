/**
 * Binary and structural signature probes (offline, no deps).
 * Full-byte scan with work budget and honest completeness.
 */

import { createFinding, createAlert } from './finding.js';

function sliceEq(bytes, offset, sig) {
  if (offset + sig.length > bytes.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

/** Minimum bytes beyond magic before we call an image "structurally plausible". */
const STRUCTURAL_MIN = {
  png: 24, // sig + IHDR length/type at least
  jpeg: 8,
  gif: 10,
  webp: 16,
  bmp: 14,
  pdf: 8,
  zip: 30,
  heif: 16,
};

/**
 * @param {Uint8Array} bytes
 * @param {{
 *   maxFindings?: number,
 *   budget?: { units: number, max: number },
 * }} [opts]
 * @returns {object[]}
 */
export function probeBinarySignatures(bytes, opts = {}) {
  const findings = [];
  const max = opts.maxFindings ?? 16;
  const budget = opts.budget || null;
  if (!bytes || bytes.length === 0) return findings;

  const probes = [
    {
      name: 'png',
      type: 'image',
      subtype: 'png',
      sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
      decoder: true,
    },
    {
      name: 'jpeg',
      type: 'image',
      subtype: 'jpeg',
      sig: [0xff, 0xd8, 0xff],
      decoder: true,
    },
    {
      name: 'gif',
      type: 'image',
      subtype: 'gif',
      sig: [0x47, 0x49, 0x46, 0x38],
      decoder: true,
    },
    {
      name: 'webp',
      type: 'image',
      subtype: 'webp',
      check: (b, o) =>
        b.length >= o + 12 &&
        sliceEq(b, o, [0x52, 0x49, 0x46, 0x46]) &&
        sliceEq(b, o + 8, [0x57, 0x45, 0x42, 0x50]),
      sigLen: 12,
      decoder: true,
    },
    {
      name: 'bmp',
      type: 'image',
      subtype: 'bmp',
      sig: [0x42, 0x4d],
      decoder: true,
    },
    {
      name: 'pdf',
      type: 'document',
      subtype: 'pdf',
      sig: [0x25, 0x50, 0x44, 0x46],
      decoder: false,
    },
    {
      name: 'zip',
      type: 'archive',
      subtype: 'zip',
      sig: [0x50, 0x4b, 0x03, 0x04],
      decoder: false,
      alert: createAlert('info', 'ARCHIVE', 'ZIP signature recognized; archives are not auto-extracted'),
    },
    {
      name: 'zip-empty',
      type: 'archive',
      subtype: 'zip',
      sig: [0x50, 0x4b, 0x05, 0x06],
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
      sigLen: 8,
      decoder: false,
    },
  ];

  // Full scan — every byte offset; cost is bounded by budget + max findings
  for (let o = 0; o < bytes.length; o++) {
    if (findings.length >= max) break;
    if (budget && budget.units >= budget.max) break;
    if (budget) budget.units += 1;

    for (const p of probes) {
      if (findings.length >= max) break;

      let match = false;
      if (p.check) {
        match = p.check(bytes, o);
      } else if (p.sig) {
        match = sliceEq(bytes, o, p.sig);
      }
      if (!match) continue;

      const sigLen = p.sigLen || p.sig?.length || 4;
      const remaining = bytes.length - o;
      const structuralMin = STRUCTURAL_MIN[p.subtype] || sigLen + 4;

      let completeness;
      if (remaining < sigLen) completeness = 'truncated';
      else if (remaining < structuralMin) completeness = 'partial';
      else if (o > 0) completeness = 'partial'; // embedded — not a whole-file claim
      else completeness = 'complete';

      // Signature match alone is not a validated decode
      const confidence =
        completeness === 'complete' ? (o === 0 ? 0.9 : 0.75) : completeness === 'partial' ? 0.65 : 0.4;

      const alerts = [];
      if (p.alert) alerts.push(p.alert);
      if (completeness === 'partial' || completeness === 'truncated') {
        alerts.push(
          createAlert(
            'warning',
            'PARTIAL_SIGNATURE',
            `${p.subtype} signature at offset ${o}; structure not fully validated`,
          ),
        );
      }
      if (p.subtype === 'zip') {
        alerts.push(
          createAlert('security', 'NO_AUTO_EXTRACT', 'Archive content is not automatically extracted'),
        );
      }

      findings.push(
        createFinding({
          type: p.type,
          subtype: p.subtype,
          confidence,
          evidence: [`magic:${p.name}`, `offset:${o}`, `remaining:${remaining}`],
          offset: o,
          length: Math.min(remaining, structuralMin),
          completeness,
          // decoder_available means BabelCodec has a decoder path — not that this blob is valid
          decoder_available: Boolean(p.decoder) && completeness !== 'truncated',
          supported: true,
          alerts,
        }),
      );

      // Skip past this signature to reduce duplicate adjacent hits
      o += Math.max(0, sigLen - 1);
      break;
    }
  }

  return findings;
}
