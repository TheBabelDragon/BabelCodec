/**
 * Text / encoding / structured-text probes.
 *
 * Base64 policy (standard alphabet only; Base64url deferred):
 * - Whole-input: require padding, or length >= 8, or +/ present — never claim
 *   short unpadded letter-only words (HEAD, TAIL, TEST, DATA) as Base64.
 * - Embedded: padded short tokens OK; unpadded alphabet-only require length >= 8.
 * - Canonical pad bits validated per RFC 4648 (unused bits must be zero).
 */

import { createFinding, createAlert } from './finding.js';

export function charRangeToUtf8Bytes(text, charStart, charEnd) {
  let byteStart = 0;
  for (let i = 0; i < charStart && i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c <= 0x7f) byteStart += 1;
    else if (c <= 0x7ff) byteStart += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      byteStart += 4;
      i += 1;
    } else byteStart += 3;
  }
  let byteEnd = byteStart;
  for (let i = charStart; i < charEnd && i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c <= 0x7f) byteEnd += 1;
    else if (c <= 0x7ff) byteEnd += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      byteEnd += 4;
      i += 1;
    } else byteEnd += 3;
  }
  return { offset: byteStart, length: Math.max(0, byteEnd - byteStart) };
}

const B64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function b64Index(c) {
  const i = B64_ALPHABET.indexOf(c);
  return i;
}

/**
 * Canonical pad-bit check for a padded standard Base64 token.
 * For '=', the last 2 bits of the quantum must be 0.
 * For '==', the last 4 bits of the quantum must be 0.
 * @param {string} token
 * @returns {boolean}
 */
export function hasCanonicalPadBits(token) {
  if (!token || !/=/.test(token)) return true;
  const padMatch = token.match(/=+$/);
  const pad = padMatch ? padMatch[0].length : 0;
  if (pad === 0) return true;
  if (pad > 2) return false;
  const body = token.slice(0, -pad);
  if (body.length < 2) return false;
  // Last quantum is 4 chars including padding; last body char encodes trailing bits
  const last = body[body.length - 1];
  const idx = b64Index(last);
  if (idx < 0) return false;
  if (pad === 1) {
    // one padding char: 18 bits of data in 3 sextets; last 2 bits unused
    return (idx & 0x03) === 0;
  }
  if (pad === 2) {
    // two padding chars: 12 bits in 2 sextets; last 4 bits unused
    return (idx & 0x0f) === 0;
  }
  return false;
}

/**
 * Standard Base64 syntax + canonical pad-bit validation.
 * @param {string} token
 * @param {{ requireCanonical?: boolean }} [opts]
 * @returns {boolean}
 */
export function isValidBase64Token(token, opts = {}) {
  const requireCanonical = opts.requireCanonical !== false;
  if (!token || typeof token !== 'string') return false;
  if (token.length < 2) return false;
  if (/\s/.test(token)) return false;
  // Standard alphabet only — reject Base64url chars
  if (/[-_]/.test(token)) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(token)) return false;

  const padMatch = token.match(/=+$/);
  const pad = padMatch ? padMatch[0].length : 0;
  if (pad > 2) return false;
  if (pad && token.indexOf('=') !== token.length - pad) return false;

  const body = pad ? token.slice(0, -pad) : token;
  if (body.length < 2) return false;
  if (!/^[A-Za-z0-9+/]+$/.test(body)) return false;

  if (pad) {
    if (token.length % 4 !== 0) return false;
  } else if (token.length % 4 === 1) {
    return false;
  }

  if (requireCanonical && pad && !hasCanonicalPadBits(token)) return false;
  return true;
}

/**
 * Embedded candidate strength (not whole-input).
 * @param {string} token
 */
export function isStrongEmbeddedBase64Candidate(token) {
  if (!isValidBase64Token(token)) return false;
  if (/=/.test(token)) return token.length >= 4;
  return token.length >= 8;
}

/**
 * Whole-input Base64 claim strength.
 * Short unpadded letter-only strings are ambiguous text, not Base64.
 * @param {string} token cleaned whole input
 */
export function isStrongWholeInputBase64(token) {
  if (!isValidBase64Token(token)) return false;
  if (/=/.test(token)) return token.length >= 4;
  if (/[+\/]/.test(token)) return token.length >= 4;
  // Unpadded pure alphanumeric: need length >= 8
  return token.length >= 8;
}

export function scanBase64Tokens(text) {
  const out = [];
  const re = /(?:^|[^A-Za-z0-9+/])([A-Za-z0-9+/]{2,}={0,2})(?![A-Za-z0-9+/=])/g;
  let m;
  while ((m = re.exec(text))) {
    const token = m[1];
    if (!isStrongEmbeddedBase64Candidate(token)) continue;
    if (/^[0-9a-fA-F]+$/.test(token) && token.length % 2 === 0) continue;
    const start = m.index + (m[0].length - token.length);
    const end = start + token.length;
    out.push({ start, end, token });
    re.lastIndex = end;
  }
  return out;
}

export function probeTextAndEncoding(bytes, opts = {}) {
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

  let bomReturn = false;
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
      bomReturn = true;
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
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
      bomReturn = true;
    }
  }

  if (bomReturn && opts.earlyBomReturn) return findings;

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

  if (bomReturn) return findings;

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

function extractJsonAt(text, i) {
  const open = text[i];
  if (open !== '{' && open !== '[') return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (inStr) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) {
        const value = text.slice(i, j + 1);
        try {
          JSON.parse(value);
          return { end: j + 1, value };
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function probeStructuredText(text, byteLength, opts = {}) {
  const findings = [];
  if (text == null || text.length === 0) return findings;
  const max = opts.maxFindings ?? 16;
  const budget = opts.budget;
  const trimmed = text.trim();
  const len = byteLength != null ? byteLength : text.length;

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
          evidence: ['json-parse-ok', 'whole-input'],
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

  if (!findings.some((f) => f.subtype === 'json' && f.completeness === 'complete')) {
    for (let i = 0; i < text.length && findings.length < max; i++) {
      if (budget && budget.units >= budget.max) break;
      if (budget) budget.units += 1;
      if (text[i] !== '{' && text[i] !== '[') continue;
      const extracted = extractJsonAt(text, i);
      if (!extracted) continue;
      if (extracted.value === trimmed) continue;
      const range = charRangeToUtf8Bytes(text, i, extracted.end);
      findings.push(
        createFinding({
          type: 'structured',
          subtype: 'json',
          confidence: 0.88,
          evidence: ['json-parse-ok', 'embedded', `char:${i}-${extracted.end}`],
          offset: range.offset,
          length: range.length,
          completeness: 'complete',
          decoder_available: true,
          char_start: i,
          char_end: extracted.end,
          source_token: extracted.value,
        }),
      );
      i = extracted.end - 1;
    }
  }

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

export function probeEncodedForms(text, byteLength, opts = {}) {
  const findings = [];
  if (!text || text.length < 4) return findings;
  const max = opts.maxFindings ?? 16;
  const budget = opts.budget;
  const cleaned = text.replace(/\s+/g, '');
  const len = byteLength != null ? byteLength : text.length;

  if (/^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length % 2 === 0 && cleaned.length >= 8) {
    findings.push(
      createFinding({
        type: 'encoded',
        subtype: 'hex',
        confidence: cleaned.length >= 32 ? 0.85 : 0.6,
        evidence: ['hex-charset', 'whole-input', `len:${cleaned.length}`],
        offset: 0,
        length: len,
        completeness: 'complete',
        decoder_available: true,
        source_token: cleaned,
        char_start: 0,
        char_end: text.length,
      }),
    );
  }

  // Whole-input Base64 — evidence-based; reject ambiguous short words
  if (isStrongWholeInputBase64(cleaned)) {
    const conf =
      cleaned.length >= 16 ? 0.75 : cleaned.length >= 8 ? 0.55 : 0.4;
    findings.push(
      createFinding({
        type: 'encoded',
        subtype: 'base64',
        confidence: conf,
        evidence: ['base64-charset', 'whole-input', `len:${cleaned.length}`, 'canonical'],
        offset: 0,
        length: len,
        completeness: 'complete',
        decoder_available: true,
        source_token: cleaned,
        char_start: 0,
        char_end: text.length,
        alerts: [
          createAlert(
            'info',
            'BASE64_CANDIDATE',
            'Base64-like content; not confirmed until decode validates',
          ),
        ],
      }),
    );
  } else if (
    isValidBase64Token(cleaned, { requireCanonical: false }) &&
    !isStrongWholeInputBase64(cleaned)
  ) {
    // Syntactically alphabet-like but ambiguous / noncanonical — do not claim Base64
    // (e.g. HEAD). Leave to text classification.
  } else if (isValidBase64Token(cleaned, { requireCanonical: false }) && !hasCanonicalPadBits(cleaned)) {
    findings.push(
      createFinding({
        type: 'encoded',
        subtype: 'base64',
        confidence: 0.25,
        evidence: ['base64-noncanonical-pad', 'whole-input'],
        offset: 0,
        length: len,
        completeness: 'malformed',
        decoder_available: false,
        source_token: cleaned,
        char_start: 0,
        char_end: text.length,
        alerts: [
          createAlert('warning', 'NONCANONICAL_BASE64', 'Base64 padding bits are non-zero (noncanonical)'),
        ],
      }),
    );
  }

  const hexRe = /\b[0-9a-fA-F]{16,}\b/g;
  let m;
  while ((m = hexRe.exec(text)) && findings.length < max) {
    if (budget && budget.units >= budget.max) break;
    if (budget) budget.units += 1;
    if (m[0].length % 2 !== 0) continue;
    if (findings.some((f) => f.subtype === 'hex' && f.evidence.includes('whole-input'))) break;
    const range = charRangeToUtf8Bytes(text, m.index, m.index + m[0].length);
    findings.push(
      createFinding({
        type: 'encoded',
        subtype: 'hex',
        confidence: 0.55,
        evidence: ['hex-token', `len:${m[0].length}`],
        offset: range.offset,
        length: range.length,
        completeness: 'complete',
        decoder_available: true,
        source_token: m[0],
        char_start: m.index,
        char_end: m.index + m[0].length,
      }),
    );
  }

  if (!findings.some((f) => f.subtype === 'base64' && f.evidence.includes('whole-input'))) {
    for (const hit of scanBase64Tokens(text)) {
      if (findings.length >= max) break;
      if (budget && budget.units >= budget.max) break;
      if (budget) budget.units += 1;
      const range = charRangeToUtf8Bytes(text, hit.start, hit.end);
      const conf =
        hit.token.length >= 16 ? 0.55 : hit.token.length >= 8 ? 0.4 : 0.35;
      findings.push(
        createFinding({
          type: 'encoded',
          subtype: 'base64',
          confidence: conf,
          evidence: ['base64-token', `len:${hit.token.length}`, 'canonical'],
          offset: range.offset,
          length: range.length,
          completeness: 'complete',
          decoder_available: true,
          source_token: hit.token,
          char_start: hit.start,
          char_end: hit.end,
          alerts: [
            createAlert(
              'info',
              'BASE64_CANDIDATE',
              'Embedded Base64-like token; not confirmed until decode',
            ),
          ],
        }),
      );
    }
  }

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
