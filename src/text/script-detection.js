/**
 * Descriptive script detection over code points.
 */

import { iterateCodePoints, scriptOfCodePoint } from './unicode.js';

export function detectScripts(text) {
  const counts = Object.create(null);
  for (const { codePoint } of iterateCodePoints(text)) {
    const s = scriptOfCodePoint(codePoint);
    counts[s] = (counts[s] || 0) + 1;
  }
  let primary = 'Unknown';
  let max = 0;
  for (const [name, n] of Object.entries(counts)) {
    if (name === 'Common' || name === 'Unknown') continue;
    if (n > max) {
      max = n;
      primary = name;
    }
  }
  if (max === 0 && counts.Common) primary = 'Common';
  const distinct = Object.keys(counts).filter((k) => k !== 'Common' && k !== 'Unknown');
  return {
    primary,
    scripts: counts,
    mixed: distinct.length > 1,
  };
}
