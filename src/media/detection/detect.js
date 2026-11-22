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
import {
  createDetectionBudget,
  charge,
  remainingUnits,
  canDecodeNested,
  markStopped,
} from './budget.js';

const SCHEMA = 'babelcodec.detection.v1';

/**
 * Encode UTF-8 incrementally until maxBytes (or end), preserving code-point boundaries.
 * @param {string} str
 * @param {number|null} maxBytes
 */
function encodeUtf8Bounded(str, maxBytes) {
  if (maxBytes == null) {
    const bytes = encodeUtf8(str);
    return { bytes, originalByteLength: bytes.byteLength, truncated: false };
  }
  // Two-pass length estimate without full allocation when truncated:
  // walk code units, accumulate UTF-8 sizes, stop when budget would be exceeded.
  const out = [];
  let total = 0;
  let i = 0;
  while (i < str.length) {
    const code = str.charCodeAt(i);
    let need;
    let advance = 1;
    if (code < 0x80) need = 1;
    else if (code < 0x800) need = 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const low = str.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        need = 4;
        advance = 2;
      } else {
        need = 3; // unpaired surrogate → replacement-style 3-byte path via encoder
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      need = 3;
    } else {
      need = 3;
    }
    if (total + need > maxBytes) break;
    // Encode this code point / pair
    const slice = str.slice(i, i + advance);
    const part = encodeUtf8(slice);
    for (let j = 0; j < part.length; j++) out.push(part[j]);
    total += part.length;
    i += advance;
  }
  const truncated = i < str.length;
  // Full original length: if truncated, finish counting without allocating
  let originalByteLength = total;
  if (truncated) {
    let j = i;
    while (j < str.length) {
      const code = str.charCodeAt(j);
      if (code < 0x80) originalByteLength += 1;
      else if (code < 0x800) originalByteLength += 2;
      else if (code >= 0xd800 && code <= 0xdbff && j + 1 < str.length) {
        const low = str.charCodeAt(j + 1);
        if (low >= 0xdc00 && low <= 0xdfff) {
          originalByteLength += 4;
          j += 2;
          continue;
        }
        originalByteLength += 3;
      } else originalByteLength += 3;
      j += 1;
    }
  }
  return { bytes: new Uint8Array(out), originalByteLength, truncated };
}

export async function normalizeInput(input, opts = {}) {
  const maxBytes =
    opts.maxBytes != null && Number.isFinite(opts.maxBytes) && opts.maxBytes >= 0
      ? Math.floor(opts.maxBytes)
      : null;

  if (input == null) {
    return { bytes: new Uint8Array(0), text: '', sourceKind: 'empty', originalByteLength: 0 };
  }

  if (typeof input === 'string') {
    const { bytes, originalByteLength, truncated } = encodeUtf8Bounded(input, maxBytes);
    return {
      bytes,
      text: truncated ? null : input,
      sourceKind: 'text',
      originalByteLength,
      truncatedAtAcquisition: truncated,
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

/**
 * @param {*} input
 * @param {object} [options]
 * @param {ReturnType<typeof createDetectionBudget>} [options._budget] internal shared budget
 */
export async function detectInput(input, options = {}) {
  const limits = resolveLimits(options.limits);
  const alerts = [];
  const isRoot = !options._budget;
  const budget = options._budget || createDetectionBudget(limits);
  const depth = options._depth ?? 0;

  if (isRoot) {
    budget.depth = 0;
    budget.maxDepth = limits.maxScanDepth;
    budget.maxFindings = limits.maxFindings;
    budget.maxUnits = limits.maxWorkUnits;
    budget.maxNestedDecodedBytes = limits.maxNestedDecodeBytes;
  }

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

  if (!budget.stopped) {
    for (const f of probeBinarySignatures(bytes, {
      maxFindings: limits.maxFindings - budget.findingsCount,
      budget,
    })) {
      findings.push(f);
      budget.findingsCount += 1;
      if (budget.stopped) break;
    }
  }

  if (!budget.stopped) {
    for (const f of probeTextAndEncoding(bytes, { budget })) {
      findings.push(f);
      budget.findingsCount += 1;
      charge(budget, 2);
      if (budget.stopped) break;
    }
  }

  let text = normalized.text;
  if (text == null && !budget.stopped) {
    try {
      text = decodeUtf8(bytes);
      charge(budget, 5);
    } catch {
      text = null;
    }
  }

  if (text != null && !budget.stopped) {
    for (const f of probeStructuredText(text, bytes.byteLength, {
      maxFindings: limits.maxFindings - budget.findingsCount,
      budget,
    })) {
      findings.push(f);
      budget.findingsCount += 1;
      if (budget.stopped) break;
    }
    if (!budget.stopped) {
      for (const f of probeEncodedForms(text, bytes.byteLength, {
        maxFindings: limits.maxFindings - budget.findingsCount,
        budget,
      })) {
        findings.push(f);
        budget.findingsCount += 1;
        if (budget.stopped) break;
      }
    }

    const depthLeft = (options.maxDepth ?? limits.maxScanDepth) - depth;
    if (options.decodeNested !== false && depthLeft > 0 && !budget.stopped) {
      const b64Candidates = findings
        .filter(
          (f) =>
            f.subtype === 'base64' &&
            (f.confidence >= 0.4 || (f.source_token && f.source_token.length >= 12)),
        )
        .slice()
        .sort((a, b) => candidateScore(b) - candidateScore(a));

      for (const b64Finding of b64Candidates.slice(0, 3)) {
        if (budget.stopped) break;
        if (remainingUnits(budget) <= 0) {
          markStopped(budget, 'WORK_LIMIT');
          break;
        }

        const token = extractToken(b64Finding, text);
        if (!token) {
          b64Finding.alerts = [
            ...(b64Finding.alerts || []),
            createAlert('warning', 'BASE64_SPAN_MISSING', 'Could not extract exact Base64 source span'),
          ];
          continue;
        }

        const estimated = Math.floor(token.length * 0.75);
        if (!canDecodeNested(budget, estimated)) {
          const code = budget.stoppedReason || 'NESTED_BYTE_LIMIT';
          alerts.push(
            createAlert('security', code, `Nested decoding stopped (${code})`),
          );
          analysisComplete = false;
          break;
        }

        try {
          if (!charge(budget, 15)) {
            analysisComplete = false;
            break;
          }
          const decoded = decodeBase64(token);
          if (decoded.byteLength <= 0) continue;
          if (decoded.byteLength > limits.maxNestedDecodeBytes) continue;
          if (budget.nestedDecodedBytes + decoded.byteLength > budget.maxNestedDecodedBytes) {
            markStopped(budget, 'NESTED_BYTE_LIMIT');
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

          budget.nestedDecodedBytes += decoded.byteLength;
          budget.candidateCount += 1;
          budget.depth = depth + 1;

          const nested = await detectInput(decoded, {
            typeHint: options.typeHint,
            maxDepth: options.maxDepth ?? limits.maxScanDepth,
            decodeNested: depthLeft - 1 > 0,
            limits,
            _budget: budget,
            _depth: depth + 1,
          });

          if (nested.analysisComplete === false) analysisComplete = false;

          for (const nf of nested.findings || []) {
            if (budget.findingsCount >= limits.maxFindings) {
              markStopped(budget, 'FINDING_CAP');
              break;
            }
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
            budget.findingsCount += 1;
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

  if (budget.stopped) {
    analysisComplete = false;
    const code = budget.stoppedReason || 'WORK_LIMIT';
    if (!alerts.some((a) => a.code === code)) {
      alerts.push(
        createAlert('security', code, `Detection stopped early (${code}); results may be partial`),
      );
    }
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
    workUnitsLimit: budget.maxUnits,
    nestedDecodedBytes: budget.nestedDecodedBytes,
    nestedDecodedBytesLimit: budget.maxNestedDecodedBytes,
    candidateCount: budget.candidateCount,
    stoppedReason: budget.stoppedReason,
    inputUnmodified: true,
    originalAvailableToCaller: true,
    originalPreserved: true,
    originalRetrievableVia: null,
    ledgerCommitted: false,
    storageStatus: null,
  };
}

export { SCHEMA as DETECTION_SCHEMA };
