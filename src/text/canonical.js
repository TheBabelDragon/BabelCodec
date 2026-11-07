/**
 * Immutable canonical text representation — babelcodec.canonical.v1
 */

import { iterateCodePoints, codePointToUPlus } from './unicode.js';
import { segmentGraphemes } from './graphemes.js';
import { detectScripts } from './script-detection.js';
import { applyNormalization, NormalizationProfile } from './normalization.js';
import { makeDiagnostic } from './diagnostics.js';

export const CANONICAL_SCHEMA = 'babelcodec.canonical.v1';

export function toCanonical(text, opts = {}) {
  if (typeof text !== 'string') {
    return Object.freeze({
      schema: CANONICAL_SCHEMA,
      source: { text: '', codepoints: [] },
      graphemes: [],
      script: 'Unknown',
      scripts: {},
      normalization: NormalizationProfile.NONE,
      interpretations: Object.freeze({}),
      diagnostics: Object.freeze([
        makeDiagnostic('TYPE_ERROR', 'Canonical input must be a string'),
      ]),
    });
  }

  const normProfile = opts.normalization || NormalizationProfile.NONE;
  const norm = applyNormalization(text, normProfile);
  const analysisText = normProfile === NormalizationProfile.NONE ? text : norm.text;

  const cps = iterateCodePoints(analysisText);
  const { graphemes, method, diagnostic: graphemeDiag } = segmentGraphemes(analysisText);
  const scripts = detectScripts(analysisText);

  const diagnostics = [...(opts.diagnostics || [])];
  if (graphemeDiag) {
    diagnostics.push(makeDiagnostic('GRAPHEME_FALLBACK', graphemeDiag, { method }));
  }
  if (norm.changed) {
    diagnostics.push(
      makeDiagnostic('NORMALIZATION_APPLIED', `Applied ${norm.profile}`, {
        profile: norm.profile,
      }),
    );
  }

  return Object.freeze({
    schema: CANONICAL_SCHEMA,
    source: Object.freeze({
      text,
      codepoints: Object.freeze(iterateCodePoints(text).map((c) => codePointToUPlus(c.codePoint))),
    }),
    analysis: Object.freeze({
      text: analysisText,
      codepoints: Object.freeze(cps.map((c) => codePointToUPlus(c.codePoint))),
      scalars: Object.freeze(
        cps.map((c) =>
          Object.freeze({
            text: c.text,
            codePoint: c.codePoint,
            uPlus: codePointToUPlus(c.codePoint),
            utf16Start: c.utf16Start,
            utf16End: c.utf16End,
          }),
        ),
      ),
    }),
    graphemes: Object.freeze(graphemes.map((g) => Object.freeze({ ...g }))),
    graphemeMethod: method,
    script: scripts.primary,
    scripts: Object.freeze({ ...scripts.scripts }),
    mixedScripts: scripts.mixed,
    normalization: norm.profile,
    interpretations: Object.freeze({ ...(opts.interpretations || {}) }),
    diagnostics: Object.freeze(diagnostics.map((d) => Object.freeze({ ...d }))),
  });
}

export function serializeCanonical(canonical) {
  return JSON.stringify(canonical, (_k, v) => v, 0);
}
