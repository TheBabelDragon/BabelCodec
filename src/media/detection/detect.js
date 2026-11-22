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
 * Normalize input; when maxBytes is set, copy only the permitted prefix.
 * @param {*} input
 * @param {{ maxBytes?: number }} [opts]
 */
export async function normalizeInput(input, opts = {}) {
  const maxBytes =
    opts.maxBytes != null && Number.isFinite(opts.maxBytes) && opts.maxBytes >= 0
      ? Math.floor(opts.maxBytes)
      : null;

  if (input == null) {
    return { bytes: new Uint8Array(0), text: '', sourceKind: 'empty', originalByteLength: 0 };
  }

  if (typeof input === 'string') {
    // Encode once; if over maxBytes, keep only the UTF-8 prefix (may split a multi-byte char)
    const full = encodeUtf8(input);
    const originalByteLength = full.byteLength;
    if (maxBytes != null && full.byteLength > maxBytes) {
      return {
        bytes: copyBytes(full.subarray(0, maxBytes)),
        text: null,
        sourceKind: 'text',
        originalByteLength,
        truncatedAtAcquisition: true,
      };
    }
    return {
      bytes: full,
      text: input,
      sourceKind: 'text',
      originalByteLength,
      truncatedAtAcquisition: false,
    };
  }

  if (typeof File !== 'undefined' && input instanceof File) {
    const size = typeof input.size === 'number' ? input.size : null;
    let blob = input;
    let truncatedAtAcquisition = false;
    if (maxBytes != null && size != null && size > maxBytes) {
      blob = input.slice(0, maxBytes);
      truncatedAtAcquisition = true;
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    return {
      bytes: copyBytes(buf),
      text: null,
      sourceKind: 'file',
      filename: input.name,
      declaredMime: input.type || null,
      originalByteLength: size != null ? size : buf.byteLength,
      truncatedAtAcquisition,
    };
  }

  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const size = typeof input.size === 'number' ? input.size : null;
    let blob = input;
    let truncatedAtAcquisition = false;
    if (maxBytes != null && size != null && size > maxBytes) {
      blob = input.slice(0, maxBytes);
      truncatedAtAcquisition = true;
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    return {
      bytes: copyBytes(buf),
      text: null,
      sourceKind: 'blob',
      declaredMime: input.type || null,
      originalByteLength: size != null ? size : buf.byteLength,
      truncatedAtAcquisition,
    };
  }

  if (input instanceof ArrayBuffer) {
    const originalByteLength = input.byteLength;
    const take =
      maxBytes != null && originalByteLength > maxBytes ? maxBytes : originalByteLength;
    const bytes = new Uint8Array(take);
    bytes.set(new Uint8Array(input, 0, take));
    return {
      bytes,
      text: null,
      sourceKind: 'bytes',
      originalByteLength,
      truncatedAtAcquisition: take < originalByteLength,
    };
  }

  if (ArrayBuffer.isView(input)) {
    const originalByteLength = input.byteLength;
    const take =
      maxBytes != null && originalByteLength > maxBytes ? maxBytes : originalByteLength;
    const bytes = new Uint8Array(take);
    bytes.set(new Uint8Array(input.buffer, input.byteOffset, take));
    return {
      bytes,
      text: null,
      sourceKind: 'bytes',
      originalByteLength,
      truncatedAtAcquisition: take < originalByteLength,
    };
  }

  throw new Error('Unsupported input type for detection');
}

function extractToken(finding, text) {
  if (finding.source_token) return String(finding.source_token).replace(/\s+/g, '');
  if (
    typeof finding.char_start === 'number' &&
    typeof finding.char_end === 'number' &&
    finding.char_end > finding.char_start
  ) {
    return text.slice(finding.char_start, finding.char_end).replace(/\s+/g, '');
  }
  if (finding.evidence?.includes('whole-input')) {
    return text.replace(/\s+/g, '');
  }
  return null;
}

function candidateScore(f) {
  const len = f.source_token ? String(f.source_token).length : f.length || 0;
  const hasSpan = f.source_token || (f.char_start != null && f.char_end != null) ? 1 : 0;
  return len * 10 + (f.confidence || 0) * 5 + hasSpan;
}

export async function detectInput(input, options = {}) {
  const limits = resolveLimits(options.limits);
  const alerts = [];
  const budget = { units: 0, max: limits.maxWorkUnits };
  let nestedDecodedBytes = 0;

  const normalized = await normalizeInput(input, { maxBytes: limits.maxBytes });
  const originalByteLength =
    normalized.originalByteLength != null
      ? normalized.originalByteLength
      : normalized.bytes.byteLength;
  let bytes = normalized.bytes;
  let truncated = Boolean(normalized.truncatedAtAcquisition);

  if (truncated) {
    alerts.push(
      createAlert(
        'security',
        'SIZE_LIMIT',
        `Input exceeds maxBytes (${limits.maxBytes}); acquisition truncated to ${bytes.byteLength} bytes`,
      ),
    );
  }

  const findings = [];
  let analysisComplete = true;

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
      if (budget.units >= budget.max) break;
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
      budget,
    })) {
      findings.push(f);
      if (budget.units >= budget.max) break;
    }
    if (budget.units < budget.max) {
      for (const f of probeEncodedForms(text, bytes.byteLength, {
        maxFindings: limits.maxFindings - findings.length,
        budget,
      })) {
        findings.push(f);
        if (budget.units >= budget.max) break;
      }
    }

    const depthLeft = options.maxDepth ?? limits.maxScanDepth;
    if (options.decodeNested !== false && depthLeft > 0 && budget.units < budget.max) {
      const b64Candidates = findings
        .filter(
          (f) =>
            f.subtype === 'base64' &&
            (f.confidence >= 0.4 || (f.source_token && f.source_token.length >= 12)),
        )
        .slice()
        .sort((a, b) => candidateScore(b) - candidateScore(a));

      for (const b64Finding of b64Candidates.slice(0, 3)) {
        if (budget.units >= budget.max) break;
        const remaining = budget.max - budget.units;
        if (remaining <= 0) break;

        const token = extractToken(b64Finding, text);
        if (!token) {
          b64Finding.alerts = [
            ...(b64Finding.alerts || []),
            createAlert('warning', 'BASE64_SPAN_MISSING', 'Could not extract exact Base64 source span'),
          ];
          continue;
        }
        try {
          const estimated = Math.floor(token.length * 0.75);
          if (estimated > limits.maxNestedDecodeBytes) continue;
          if (nestedDecodedBytes + estimated > limits.maxNestedDecodeBytes) {
            alerts.push(
              createAlert(
                'security',
                'NESTED_BYTE_LIMIT',
                'Aggregate nested decode byte limit reached; further nested decoding stopped',
              ),
            );
            analysisComplete = false;
            break;
          }

          const decoded = decodeBase64(token);
          budget.units += 15;
          if (decoded.byteLength <= 0 || decoded.byteLength > limits.maxNestedDecodeBytes) continue;
          nestedDecodedBytes += decoded.byteLength;

          const childMax = Math.max(0, budget.max - budget.units);
          if (childMax <= 0) {
            analysisComplete = false;
            break;
          }

          const nested = await detectInput(decoded, {
            typeHint: options.typeHint,
            maxDepth: depthLeft - 1,
            decodeNested: depthLeft - 1 > 0,
            limits: {
              ...limits,
              maxFindings: Math.min(8, limits.maxFindings),
              maxWorkUnits: childMax,
            },
          });
          budget.units += nested.workUnitsUsed || 0;

          for (const nf of nested.findings || []) {
            if (findings.length >= limits.maxFindings) break;
            findings.push({
              ...nf,
              parent_finding_id: b64Finding.finding_id,
              relationships: [
                ...(nf.relationships || []),
                { kind: 'decoded-from', target: b64Finding.finding_id },
              ],
              evidence: [...(nf.evidence || []), 'decoded-coordinate-space'],
              parent_offset: b64Finding.offset,
              parent_length: b64Finding.length,
              parent_char_start: b64Finding.char_start,
              parent_char_end: b64Finding.char_end,
            });
          }
          if (nested.findings?.some((f) => f.type === 'image')) {
            b64Finding.evidence = [...(b64Finding.evidence || []), 'nested-image-detected'];
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
    analysisComplete = false;
    alerts.push(
      createAlert('security', 'WORK_LIMIT', 'Detection work limit reached during scan; results may be partial'),
    );
  }

  const capped = findings.slice(0, limits.maxFindings);
  if (findings.length > limits.maxFindings) {
    analysisComplete = false;
    alerts.push(createAlert('warning', 'FINDING_CAP', `Findings capped at ${limits.maxFindings}`));
  }

  return {
    schema: SCHEMA,
    originalByteLength,
    acquiredByteLength: bytes.byteLength,
    scannedByteLength: bytes.byteLength,
    byteLength: bytes.byteLength,
    truncated,
    analysisComplete,
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
    inputUnmodified: true,
    originalAvailableToCaller: true,
    originalPreserved: true,
    originalRetrievableVia: null,
    ledgerCommitted: false,
    storageStatus: null,
  };
}

export { SCHEMA as DETECTION_SCHEMA };
