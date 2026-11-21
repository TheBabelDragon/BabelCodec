/**
 * Universal input recognition — multi-type, bounded, safe passthrough.
 */

import { encodeUtf8, decodeUtf8 } from '../../core/utf8.js';
import { decodeBase64 } from '../../core/base64.js';
import { copyBytes } from '../artifacts/representations.js';
import { resolveLimits } from './limits.js';
import { createFinding, createAlert } from './finding.js';
import { probeBinarySignatures } from './signatures.js';
import { probeTextAndEncoding, probeStructuredText, probeEncodedForms } from './text.js';

const SCHEMA = 'babelcodec.detection.v1';

/**
 * @param {string|Uint8Array|ArrayBuffer|ArrayBufferView|File|Blob|null|undefined} input
 * @param {{ typeHint?: string }} [opts]
 */
export async function normalizeInput(input, opts = {}) {
  if (input == null) {
    return { bytes: new Uint8Array(0), text: '', sourceKind: 'empty' };
  }

  if (typeof input === 'string') {
    const bytes = encodeUtf8(input);
    return { bytes, text: input, sourceKind: 'text' };
  }

  if (typeof File !== 'undefined' && input instanceof File) {
    const buf = new Uint8Array(await input.arrayBuffer());
    return {
      bytes: copyBytes(buf),
      text: null,
      sourceKind: 'file',
      filename: input.name,
      declaredMime: input.type || null,
    };
  }

  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const buf = new Uint8Array(await input.arrayBuffer());
    return { bytes: copyBytes(buf), text: null, sourceKind: 'blob', declaredMime: input.type || null };
  }

  if (input instanceof ArrayBuffer) {
    return { bytes: copyBytes(input), text: null, sourceKind: 'bytes' };
  }

  if (ArrayBuffer.isView(input)) {
    return { bytes: copyBytes(input), text: null, sourceKind: 'bytes' };
  }

  throw new Error('Unsupported input type for detection');
}

/**
 * @param {string|Uint8Array|ArrayBuffer|ArrayBufferView|File|Blob} input
 * @param {{
 *   typeHint?: string,
 *   limits?: object,
 *   maxDepth?: number,
 *   decodeNested?: boolean,
 * }} [options]
 */
export async function detectInput(input, options = {}) {
  const limits = resolveLimits(options.limits);
  const alerts = [];
  const budget = { units: 0, max: limits.maxWorkUnits };

  const normalized = await normalizeInput(input, options);
  let bytes = normalized.bytes;

  if (bytes.byteLength > limits.maxBytes) {
    alerts.push(
      createAlert('security', 'SIZE_LIMIT', `Input exceeds maxBytes (${limits.maxBytes}); truncated for scan`),
    );
    bytes = bytes.subarray(0, limits.maxBytes);
  }

  /** @type {object[]} */
  const findings = [];

  // Binary signatures — full scan with live budget
  for (const f of probeBinarySignatures(bytes, {
    maxFindings: limits.maxFindings,
    budget,
  })) {
    findings.push(f);
  }

  if (budget.units < budget.max) {
    for (const f of probeTextAndEncoding(bytes)) {
      findings.push(f);
      budget.units += 2;
    }
  }

  let text = normalized.text;
  if (text == null && budget.units < budget.max) {
    try {
      text = decodeUtf8(bytes);
      budget.units += 5;
    } catch {
      text = null;
    }
  }

  if (text != null && budget.units < budget.max) {
    for (const f of probeStructuredText(text, bytes.byteLength, {
      maxFindings: limits.maxFindings - findings.length,
    })) {
      findings.push(f);
      budget.units += 2;
      if (budget.units >= budget.max) break;
    }
    if (budget.units < budget.max) {
      for (const f of probeEncodedForms(text, bytes.byteLength, {
        maxFindings: limits.maxFindings - findings.length,
      })) {
        findings.push(f);
        budget.units += 2;
        if (budget.units >= budget.max) break;
      }
    }

    // Bounded nested Base64 — only for high-confidence whole or token findings
    if (options.decodeNested !== false && budget.units < budget.max) {
      const b64Candidates = findings.filter(
        (f) => f.subtype === 'base64' && f.confidence >= 0.5,
      );
      for (const b64Finding of b64Candidates.slice(0, 2)) {
        if (budget.units >= budget.max) break;
        if ((options.maxDepth ?? limits.maxScanDepth) <= 0) break;
        try {
          // Extract the token text from original when possible
          let token = text;
          if (b64Finding.offset > 0 || b64Finding.length < bytes.byteLength) {
            // Prefer evidence length from cleaned whole match
            const cleanedWhole = text.replace(/\s+/g, '');
            if (b64Finding.evidence.includes('whole-input')) token = cleanedWhole;
            else {
              // Approximate: take a slice of text by char if ASCII
              token = text.replace(/\s+/g, '');
            }
          } else {
            token = text.replace(/\s+/g, '');
          }
          if (token.length * 0.75 > limits.maxNestedDecodeBytes) continue;
          const decoded = decodeBase64(token);
          budget.units += 15;
          if (decoded.byteLength <= 0 || decoded.byteLength > limits.maxNestedDecodeBytes) continue;

          const nested = await detectInput(decoded, {
            ...options,
            maxDepth: (options.maxDepth ?? limits.maxScanDepth) - 1,
            decodeNested: false,
            limits: { ...limits, maxFindings: 8, maxWorkUnits: Math.max(100, budget.max - budget.units) },
          });
          budget.units += 10;

          for (const nf of nested.findings || []) {
            if (findings.length >= limits.maxFindings) break;
            // Nested findings live in decoded coordinate space — do not pretend offsets are parent bytes
            findings.push({
              ...nf,
              parent_finding_id: b64Finding.finding_id,
              relationships: [
                ...(nf.relationships || []),
                { kind: 'decoded-from', target: b64Finding.finding_id },
              ],
              evidence: [...(nf.evidence || []), 'decoded-coordinate-space'],
              // Keep nested offset as offset within decoded bytes; expose parent span separately
              parent_offset: b64Finding.offset,
              parent_length: b64Finding.length,
            });
          }
          if (nested.findings?.some((f) => f.type === 'image')) {
            b64Finding.evidence = [...b64Finding.evidence, 'nested-image-detected'];
            b64Finding.confidence = Math.min(0.95, b64Finding.confidence + 0.15);
          }
        } catch {
          b64Finding.alerts = [
            ...(b64Finding.alerts || []),
            createAlert('warning', 'BASE64_DECODE_FAILED', 'Base64 candidate failed to decode'),
          ];
          b64Finding.completeness = 'malformed';
        }
      }
    }
  }

  if (options.typeHint) {
    const hint = String(options.typeHint).toLowerCase();
    const matches = findings.some(
      (f) =>
        f.subtype === hint ||
        f.type === hint ||
        (hint.startsWith('image/') && f.type === 'image' && f.completeness === 'complete'),
    );
    if (!matches) {
      alerts.push(
        createAlert(
          'warning',
          'TYPE_HINT_CONFLICT',
          `Type hint "${options.typeHint}" conflicts with detection evidence`,
          { typeHint: options.typeHint },
        ),
      );
    }
  }

  const fullSpan = findings.some(
    (f) =>
      f.offset === 0 &&
      f.length >= bytes.byteLength * 0.9 &&
      f.confidence >= 0.7 &&
      f.type !== 'unclassified',
  );
  if (!fullSpan && bytes.byteLength > 0) {
    findings.push(
      createFinding({
        type: 'unclassified',
        subtype: 'region',
        confidence: 0.3,
        evidence: ['no-dominant-classification'],
        offset: 0,
        length: bytes.byteLength,
        completeness: 'unknown',
        supported: true,
        decoder_available: false,
        alerts: [
          createAlert(
            'warning',
            'UNCLASSIFIED',
            'Some or all bytes lack a high-confidence classification; original remains accessible',
          ),
        ],
      }),
    );
  }

  if (budget.units >= budget.max) {
    alerts.push(
      createAlert('security', 'WORK_LIMIT', 'Detection work limit reached during scan; results may be partial'),
    );
  }

  const capped = findings.slice(0, limits.maxFindings);
  if (findings.length > limits.maxFindings) {
    alerts.push(createAlert('warning', 'FINDING_CAP', `Findings capped at ${limits.maxFindings}`));
  }

  return {
    schema: SCHEMA,
    byteLength: bytes.byteLength,
    sourceKind: normalized.sourceKind,
    filename: normalized.filename ?? null,
    declaredMime: normalized.declaredMime ?? null,
    typeHint: options.typeHint ?? null,
    findings: capped,
    alerts,
    limits: {
      maxBytes: limits.maxBytes,
      maxFindings: limits.maxFindings,
      maxScanDepth: limits.maxScanDepth,
      maxWorkUnits: limits.maxWorkUnits,
    },
    workUnitsUsed: budget.units,
    originalPreserved: true,
  };
}

export { SCHEMA as DETECTION_SCHEMA };
