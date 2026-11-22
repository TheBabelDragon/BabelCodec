/**
 * Detection finding factory and helpers.
 */

let findingSeq = 0;

/**
 * @typedef {'complete'|'partial'|'truncated'|'malformed'|'ambiguous'|'unknown'} Completeness
 * @typedef {'info'|'warning'|'security'|'unsupported'} AlertLevel
 */

/**
 * @param {*} n
 * @returns {number|undefined}
 */
function nonnegativeInt(n) {
  if (n == null) return undefined;
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) return undefined;
  return v;
}

/**
 * @param {object} partial
 */
export function createFinding(partial = {}) {
  findingSeq += 1;

  const char_start = nonnegativeInt(partial.char_start);
  const char_end = nonnegativeInt(partial.char_end);

  /** @type {object} */
  const finding = {
    finding_id: partial.finding_id || `find-${Date.now().toString(36)}-${findingSeq}`,
    type: partial.type || 'unknown',
    subtype: partial.subtype ?? null,
    confidence: partial.confidence != null ? Number(partial.confidence) : 0,
    evidence: Array.isArray(partial.evidence)
      ? [...partial.evidence]
      : partial.evidence
        ? [partial.evidence]
        : [],
    offset: partial.offset != null ? Number(partial.offset) : 0,
    length: partial.length != null ? Number(partial.length) : 0,
    source_representation: partial.source_representation || 'bytes',
    completeness: partial.completeness || 'unknown',
    parent_finding_id: partial.parent_finding_id ?? null,
    relationships: Array.isArray(partial.relationships) ? [...partial.relationships] : [],
    warnings: Array.isArray(partial.warnings) ? [...partial.warnings] : [],
    supported: partial.supported !== false,
    decoder_available: Boolean(partial.decoder_available),
    alerts: Array.isArray(partial.alerts) ? [...partial.alerts] : [],
  };

  // Exact-span fields for embedded tokens (optional, preserved when valid)
  if (typeof partial.source_token === 'string') {
    finding.source_token = partial.source_token;
  }
  if (char_start !== undefined) finding.char_start = char_start;
  if (char_end !== undefined) finding.char_end = char_end;

  // Optional parent coordinate metadata from nested decode
  if (partial.parent_offset != null) finding.parent_offset = Number(partial.parent_offset);
  if (partial.parent_length != null) finding.parent_length = Number(partial.parent_length);
  if (partial.parent_char_start != null) {
    const v = nonnegativeInt(partial.parent_char_start);
    if (v !== undefined) finding.parent_char_start = v;
  }
  if (partial.parent_char_end != null) {
    const v = nonnegativeInt(partial.parent_char_end);
    if (v !== undefined) finding.parent_char_end = v;
  }

  return finding;
}

/**
 * @param {AlertLevel} level
 * @param {string} code
 * @param {string} message
 * @param {object} [detail]
 */
export function createAlert(level, code, message, detail) {
  return { level, code, message, detail };
}
