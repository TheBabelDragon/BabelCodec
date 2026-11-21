/**
 * Detection finding factory and helpers.
 */

let findingSeq = 0;

/**
 * @typedef {'complete'|'partial'|'truncated'|'malformed'|'ambiguous'|'unknown'} Completeness
 * @typedef {'info'|'warning'|'security'|'unsupported'} AlertLevel
 */

/**
 * @param {object} partial
 */
export function createFinding(partial = {}) {
  findingSeq += 1;
  return {
    finding_id: partial.finding_id || `find-${Date.now().toString(36)}-${findingSeq}`,
    type: partial.type || 'unknown',
    subtype: partial.subtype ?? null,
    confidence: partial.confidence != null ? Number(partial.confidence) : 0,
    evidence: Array.isArray(partial.evidence) ? [...partial.evidence] : partial.evidence ? [partial.evidence] : [],
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
