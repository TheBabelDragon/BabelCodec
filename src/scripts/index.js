/**
 * Script adapters — package subpath: babelcodec/scripts
 */

import { hebrewAdapter } from './hebrew.js';
import { iterateCodePoints } from '../text/unicode.js';
import { toCanonical } from '../text/canonical.js';
import { makeDiagnostic } from '../text/diagnostics.js';

function makeStub(id, ranges, note) {
  return {
    id,
    version: '0.1.0-stub',
    detects(text) {
      if (typeof text !== 'string') return false;
      for (const { codePoint } of iterateCodePoints(text)) {
        for (const [lo, hi] of ranges) {
          if (codePoint >= lo && codePoint <= hi) return true;
        }
      }
      return false;
    },
    parse(text) {
      return {
        adapter: id,
        version: '0.1.0-stub',
        complete: false,
        note,
        scalars: iterateCodePoints(text || '').map((c) => ({
          text: c.text,
          codePoint: c.codePoint,
        })),
      };
    },
    profiles: [],
    toCanonical(text) {
      return toCanonical(text, {
        diagnostics: [
          makeDiagnostic('ADAPTER_STUB', note, { adapter: id }),
        ],
      });
    },
  };
}

export const arabicAdapter = makeStub('arabic', [[0x0600, 0x06ff]], 'Arabic detection only; full shaping not implemented');
export const geezAdapter = makeStub('geez', [[0x1200, 0x137f]], 'Ethiopic/Geez detection only');
export const japaneseAdapter = makeStub('japanese', [[0x3040, 0x30ff], [0x4e00, 0x9fff]], 'Japanese script detection only; no kana romanization');
export const tifinaghAdapter = makeStub('tifinagh', [[0x2d30, 0x2d7f]], 'Tifinagh detection only');
export const brailleAdapter = makeStub('braille', [[0x2800, 0x28ff]], 'Braille pattern detection only; no Grade-2 expansion');
export const runesAdapter = makeStub('runes', [[0x16a0, 0x16ff]], 'Runic detection only');
export const phoenicianAdapter = makeStub('phoenician', [[0x10900, 0x1091f]], 'Phoenician detection only');

export { hebrewAdapter } from './hebrew.js';

export const adapters = Object.freeze({
  hebrew: hebrewAdapter,
  arabic: arabicAdapter,
  geez: geezAdapter,
  japanese: japaneseAdapter,
  tifinagh: tifinaghAdapter,
  braille: brailleAdapter,
  runes: runesAdapter,
  phoenician: phoenicianAdapter,
});

export function detectAdapter(text) {
  for (const a of Object.values(adapters)) {
    if (a.detects(text)) return a;
  }
  return null;
}
