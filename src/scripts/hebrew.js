/**
 * Hebrew script adapter.
 */

import { iterateCodePoints, codePointToUPlus } from '../text/unicode.js';
import { toCanonical } from '../text/canonical.js';
import { makeDiagnostic } from '../text/diagnostics.js';

export const ADAPTER_ID = 'hebrew';
export const ADAPTER_VERSION = '1.0.0';

export const GEMATRIA_STANDARD = Object.freeze({
  '\u05d0': 1, '\u05d1': 2, '\u05d2': 3, '\u05d3': 4, '\u05d4': 5, '\u05d5': 6, '\u05d6': 7, '\u05d7': 8, '\u05d8': 9,
  '\u05d9': 10, '\u05db': 20, '\u05da': 20, '\u05dc': 30, '\u05de': 40, '\u05dd': 40, '\u05e0': 50, '\u05df': 50,
  '\u05e1': 60, '\u05e2': 70, '\u05e4': 80, '\u05e3': 80, '\u05e6': 90, '\u05e5': 90, '\u05e7': 100, '\u05e8': 200,
  '\u05e9': 300, '\u05ea': 400,
});

const FINAL_FORMS = new Set(['\u05da', '\u05dd', '\u05df', '\u05e3', '\u05e5']);
const LETTER_RANGE = [0x05d0, 0x05ea];
const NIQQUD_RANGE = [0x05b0, 0x05bd];
const CANTILLATION_RANGE = [0x0591, 0x05af];

export function detects(text) {
  if (typeof text !== 'string') return false;
  for (const { codePoint } of iterateCodePoints(text)) {
    if (codePoint >= 0x0590 && codePoint <= 0x05ff) return true;
    if (codePoint >= 0xfb1d && codePoint <= 0xfb4f) return true;
  }
  return false;
}

export function parse(text) {
  const scalars = [];
  for (const c of iterateCodePoints(text || '')) {
    const cp = c.codePoint;
    let category = 'other';
    if (cp >= LETTER_RANGE[0] && cp <= LETTER_RANGE[1]) {
      category = FINAL_FORMS.has(c.text) ? 'final-letter' : 'letter';
    } else if (cp >= NIQQUD_RANGE[0] && cp <= NIQQUD_RANGE[1]) {
      category = 'niqqud';
    } else if (cp >= CANTILLATION_RANGE[0] && cp <= CANTILLATION_RANGE[1]) {
      category = 'cantillation';
    } else if (cp === 0x05be || cp === 0x05f3 || cp === 0x05f4) {
      category = 'punctuation';
    }
    scalars.push({
      text: c.text,
      uPlus: codePointToUPlus(cp),
      codePoint: cp,
      category,
      isFinal: FINAL_FORMS.has(c.text),
      utf16Start: c.utf16Start,
      utf16End: c.utf16End,
    });
  }
  return {
    adapter: ADAPTER_ID,
    version: ADAPTER_VERSION,
    scalars,
    letterCount: scalars.filter((s) => s.category === 'letter' || s.category === 'final-letter').length,
    niqqudCount: scalars.filter((s) => s.category === 'niqqud').length,
    cantillationCount: scalars.filter((s) => s.category === 'cantillation').length,
  };
}

export function gematriaStandard(text) {
  let sum = 0;
  const terms = [];
  for (const c of iterateCodePoints(text || '')) {
    const v = GEMATRIA_STANDARD[c.text];
    if (v != null) {
      sum += v;
      terms.push({ char: c.text, value: v });
    }
  }
  return {
    profile: 'gematria-standard',
    version: '1.0.0',
    sum,
    terms,
    note: 'Final forms use the same values as ordinary forms in this profile',
  };
}

export function toCanonicalHebrew(text, opts = {}) {
  const parsed = parse(text);
  const interpretations = {};
  if (opts.gematria) {
    interpretations.gematria = gematriaStandard(text);
  }
  const canonical = toCanonical(text, {
    interpretations,
    diagnostics: detects(text)
      ? []
      : [makeDiagnostic('NOT_HEBREW', 'No Hebrew-range code points detected')],
  });
  return { ...canonical, hebrew: parsed };
}

export const hebrewAdapter = {
  id: ADAPTER_ID,
  version: ADAPTER_VERSION,
  detects,
  parse,
  profiles: ['gematria-standard'],
  gematriaStandard,
  toCanonical: toCanonicalHebrew,
};
