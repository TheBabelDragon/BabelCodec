/**
 * Text / encoding / structured-text probes.
 */

import { createFinding, createAlert } from './finding.js';

/**
 * @param {Uint8Array} bytes
 */
export function probeTextAndEncoding(bytes) {
  const findings = [];
  if (!bytes || bytes.length === 0) {
    findings.push(
      createFinding({
        type: 'empty',
        subtype: 'empty',
        confidence: 1,
        evidence: ['empty-input'],
        offset: 0,
        length: 0,
        completeness: 'complete',
        decoder_available: true,
      }),
    );
    return findings;
  }

  // UTF-16 BOM
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      findings.push(
        createFinding({
          type: 'text',
          subtype: 'utf-16le',
          confidence: 0.95,
          evidence: ['bom:utf-16le'],
          offset: 0,
          length: bytes.length,
          completeness: 'complete',
          decoder_available: true,
        }),
      );
      return findings;
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      findings.push(
        createFinding({
          type: 'text',
          subtype: 'utf-16be',
          confidence: 0.95,
          evidence: ['bom:utf-16be'],
          offset: 0,
          length: bytes.length,
          completeness: 'complete',
          decoder_available: true,
        }),
      );
      return findings;
    }
  }

  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    findings.push(
      createFinding({
        type: 'text',
        subtype: 'utf-8',
        confidence: 0.98,
        evidence: ['bom:utf-8'],
        offset: 0,
        length: bytes.length,
        completeness: 'complete',
        decoder_available: true,
      }),
    );
  }

  let printable = 0;
  let nulls = 0;
  let high = 0;
  const n = Math.min(bytes.length, 4096);
  for (let i = 0; i < n; i++) {
    const b = bytes[i];
    if (b === 0) nulls += 1;
    else if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127)) printable += 1;
    else if (b >= 128) high += 1;
  }

  const ratio = printable / n;
  const isLikelyText = nulls === 0 && ratio > 0.85;
  const isAscii = isLikelyText && high === 0;

  if (isLikelyText) {
    findings.push(
      createFinding({
        type: 'text',
        subtype: isAscii ? 'ascii' : 'utf-8',
        confidence: isAscii ? 0.9 : 0.75,
        evidence: [`printable-ratio:${ratio.toFixed(2)}`, high ? 'high-bytes' : 'ascii-range'],
        offset: 0,
        length: bytes.length,
        completeness: 'complete',
        decoder_available: true,
      }),
    );
  } else if (nulls > 0 && nulls < n * 0.1) {
    findings.push(
      createFinding({
        type: 'text',
        subtype: 'binary-mixed',
        confidence: 0.4,
        evidence: ['null-bytes', `printable-ratio:${ratio.toFixed(2)}`],
        offset: 0,
        length: bytes.length,
        completeness: 'ambiguous',
        decoder_available: false,
        alerts: [createAlert('warning', 'MIXED_TEXT_BINARY', 'Payload mixes text-like and binary bytes')],
      }),
    );
  }

  return findings;
}

/**
 * Structured text probes on decoded UTF-8 string (when available).
 * @param {string} text
 * @param {number} [byteLength]
 */
export function probeStructuredText(text, byteLength) {
  const findings = [];
  if (text == null || text.length === 0) return findings;
  const trimmed = text.trim();
  const len = byteLength != null ? byteLength : text.length;

  // JSON
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      JSON.parse(trimmed);
      findings.push(
        createFinding({
          type: 'structured',
          subtype: 'json',
          confidence: 0.92,
          evidence: ['json-parse-ok'],
          offset: 0,
          length: len,
          completeness: 'complete',
          decoder_available: true,
        }),
      );
    } catch {
      findings.push(
        createFinding({
          type: 'structured',
          subtype: 'json',
          confidence: 0.45,
          evidence: ['json-like-brackets', 'json-parse-failed'],
          offset: 0,
          length: len,
          completeness: 'malformed',
          decoder_available: false,
          alerts: [createAlert('warning', 'MALFORMED_JSON', 'JSON-like structure failed to parse')],
        }),
      );
    }
  }

  // XML / HTML
  if (trimmed.startsWith('<')) {
    const lower = trimmed.slice(0, 200).toLowerCase();
    if (lower.includes('<html') || lower.startsWith('<!doctype html')) {
      findings.push(
        createFinding({
          type: 'structured',
          subtype: 'html',
          confidence: 0.85,
          evidence: ['html-tag'],
          offset: 0,
          length: len,
          completeness: 'complete',
          decoder_available: true,
        }),
      );
    } else if (/^<\?xml/i.test(trimmed) || /^<[a-zA-Z_][\w:.-]*[\s>]/.test(trimmed)) {
      findings.push(
        createFinding({
          type: 'structured',
          subtype: 'xml',
          confidence: 0.8,
          evidence: ['xml-like'],
          offset: 0,
          length: len,
          completeness: 'complete',
          decoder_available: true,
        }),
      );
    }
  }

  // CSV / TSV heuristic
  const lines = trimmed.split(/\r?\n/).filter((l) => l.length > 0).slice(0, 20);
  if (lines.length >= 2) {
    const commas = lines.map((l) => (l.match(/,/g) || []).length);
    const tabs = lines.map((l) => (l.match(/\t/g) || []).length);
    const avgC = commas.reduce((a, b) => a + b, 0) / lines.length;
    const avgT = tabs.reduce((a, b) => a + b, 0) / lines.length;
    if (avgC >= 1 && commas.every((c) => Math.abs(c - avgC) <= 1)) {
      findings.push(
        createFinding({
          type: 'structured',
          subtype: 'csv',
          confidence: 0.7,
          evidence: ['consistent-commas'],
          offset: 0,
          length: len,
          completeness: 'complete',
          decoder_available: true,
        }),
      );
    } else if (avgT >= 1 && tabs.every((t) => Math.abs(t - avgT) <= 1)) {
      findings.push(
        createFinding({
          type: 'structured',
          subtype: 'tsv',
          confidence: 0.7,
          evidence: ['consistent-tabs'],
          offset: 0,
          length: len,
          completeness: 'complete',
          decoder_available: true,
        }),
      );
    }
  }

  // YAML heuristic (very light)
  if (/^---\s*$/m.test(trimmed) || /^[\w-]+:\s/m.test(trimmed)) {
    if (!findings.some((f) => f.subtype === 'json')) {
      findings.push(
        createFinding({
          type: 'structured',
          subtype: 'yaml',
          confidence: 0.5,
          evidence: ['yaml-like-keys'],
          offset: 0,
          length: len,
          completeness: 'ambiguous',
          decoder_available: false,
          alerts: [createAlert('info', 'YAML_HEURISTIC', 'YAML-like structure; not fully validated')],
        }),
      );
    }
  }

  return findings;
}

/**
 * Encoded-form probes on text.
 * @param {string} text
 * @param {number} [byteLength]
 */
export function probeEncodedForms(text, byteLength) {
  const findings = [];
  if (!text || text.length < 4) return findings;
  const cleaned = text.replace(/\s+/g, '');
  const len = byteLength != null ? byteLength : text.length;

  // Hex
  if (/^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length % 2 === 0 && cleaned.length >= 8) {
    findings.push(
      createFinding({
        type: 'encoded',
        subtype: 'hex',
        confidence: cleaned.length >= 32 ? 0.85 : 0.6,
        evidence: ['hex-charset', `len:${cleaned.length}`],
        offset: 0,
        length: len,
        completeness: 'complete',
        decoder_available: true,
      }),
    );
  }

  // Base64
  if (/^[A-Za-z0-9+/]+=*$/.test(cleaned) && cleaned.length >= 8 && cleaned.length % 4 === 0) {
    findings.push(
      createFinding({
        type: 'encoded',
        subtype: 'base64',
        confidence: cleaned.length >= 16 ? 0.75 : 0.5,
        evidence: ['base64-charset', `len:${cleaned.length}`],
        offset: 0,
        length: len,
        completeness: 'complete',
        decoder_available: true,
        alerts: [
          createAlert(
            'info',
            'BASE64_CANDIDATE',
            'Base64-like content; not confirmed until decode validates',
          ),
        ],
      }),
    );
  }

  // URL encoding
  if (/%[0-9a-fA-F]{2}/.test(text) && (text.match(/%[0-9a-fA-F]{2}/g) || []).length >= 2) {
    findings.push(
      createFinding({
        type: 'encoded',
        subtype: 'url-encoding',
        confidence: 0.7,
        evidence: ['percent-encoding'],
        offset: 0,
        length: len,
        completeness: 'complete',
        decoder_available: true,
      }),
    );
  }

  return findings;
}
