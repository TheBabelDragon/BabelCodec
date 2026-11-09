/**
 * Immutable canonical text representation — babelcodec.canonical.v1
 *
 * Source identity is always preserved. Normalization never overwrites source.
 * Classification is performed by the Rust Unicode Core via WASM.
 */

import { iterateCodePoints, codePointToUPlus } from './unicode.js';
import { initializeUnicodeCore, inspectCanonical as rustInspect } from './unicode-core-loader.js';
import { NormalizationProfile } from './normalization.js';
import { makeDiagnostic } from './diagnostics.js';

export const CANONICAL_SCHEMA = 'babelcodec.canonical.v1';

export async function toCanonical(text, opts = {}) {
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
      engine: 'rust-wasm',
    });
  }

  await initializeUnicodeCore();
  const normProfile = opts.normalization || NormalizationProfile.NONE;
  const raw = await rustInspect(text, normProfile);

  const diagnostics = [...(opts.diagnostics || [])];
  if (raw.diagnostics && Array.isArray(raw.diagnostics)) {
    for (const d of raw.diagnostics) {
      diagnostics.push(makeDiagnostic(d.code || 'ENGINE', d.message || '', d.detail || null));
    }
  }

  const sourceCodepoints =
    raw.source?.codepoints ||
    iterateCodePoints(text).map((c) => codePointToUPlus(c.codePoint));

  const analysisScalars = (raw.analysis?.scalars || []).map((s) =>
    Object.freeze({
      text: s.text,
      codePoint: s.code_point ?? s.codePoint,
      uPlus: s.u_plus ?? s.uPlus ?? codePointToUPlus(s.code_point ?? s.codePoint),
      utf16Start: s.utf16_start ?? s.utf16Start,
      utf16End: s.utf16_end ?? s.utf16End,
      isXidStart: s.is_xid_start ?? s.isXidStart,
      isXidContinue: s.is_xid_continue ?? s.isXidContinue,
      script: s.script,
      isCombining: s.is_combining ?? s.isCombining,
    })
  );

  const graphemes = (raw.graphemes || []).map((g) =>
    Object.freeze({
      text: g.text,
      start: g.start,
      end: g.end,
      codePoints: g.code_points || g.codePoints || [],
    })
  );

  return Object.freeze({
    schema: CANONICAL_SCHEMA,
    engine: 'rust-wasm',
    engineVersion: raw.engine_version || '0.10.0',
    source: Object.freeze({
      text,
      codepoints: Object.freeze(sourceCodepoints),
      utf16Units: raw.source?.utf16_units || null,
    }),
    analysis: Object.freeze({
      text: raw.analysis?.text ?? text,
      codepoints: Object.freeze(raw.analysis?.codepoints || []),
      scalars: Object.freeze(analysisScalars),
    }),
    graphemes: Object.freeze(graphemes),
    graphemeMethod: raw.grapheme_method || 'unicode-segmentation (UAX #29 via Rust WASM)',
    script: raw.script?.primary || 'Unknown',
    scripts: Object.freeze({ ...(raw.script?.scripts || {}) }),
    mixedScripts: !!raw.script?.mixed,
    normalization: raw.normalization?.profile || NormalizationProfile.NONE,
    interpretations: Object.freeze({ ...(opts.interpretations || {}) }),
    diagnostics: Object.freeze(diagnostics.map((d) => Object.freeze({ ...d }))),
  });
}

export function serializeCanonical(canonical) {
  return JSON.stringify(canonical, (_k, v) => v, 0);
}
