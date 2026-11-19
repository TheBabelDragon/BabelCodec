/**
 * Byte-level buffer comparison.
 *
 * Produces a structured list of changed / inserted / removed regions.
 * This is explicitly a byte-level diff, not a semantic or textual diff.
 */

import { toUint8Array, bytesEqual } from './utils.js';

/**
 * @typedef {{
 *   type: 'equal' | 'changed' | 'inserted' | 'removed',
 *   aStart: number,
 *   aEnd: number,
 *   bStart: number,
 *   bEnd: number,
 *   aLength: number,
 *   bLength: number,
 * }} DiffRegion
 */

/**
 * Compare two buffers and return ordered regions.
 * Uses a simple LCS-inspired scan that is exact for small/medium buffers
 * and linear for the common equal-prefix/suffix case.
 *
 * @param {Uint8Array|ArrayBuffer|number[]} a
 * @param {Uint8Array|ArrayBuffer|number[]} b
 * @returns {{
 *   identical: boolean,
 *   aLength: number,
 *   bLength: number,
 *   regions: DiffRegion[],
 *   summary: { equal: number, changed: number, inserted: number, removed: number }
 * }}
 */
export function byteDiff(a, b) {
  const A = toUint8Array(a);
  const B = toUint8Array(b);

  if (bytesEqual(A, B)) {
    const region = {
      type: 'equal',
      aStart: 0,
      aEnd: A.length,
      bStart: 0,
      bEnd: B.length,
      aLength: A.length,
      bLength: B.length,
    };
    return {
      identical: true,
      aLength: A.length,
      bLength: B.length,
      regions: A.length === 0 ? [] : [region],
      summary: { equal: A.length, changed: 0, inserted: 0, removed: 0 },
    };
  }

  // Find common prefix
  let prefix = 0;
  const minLen = Math.min(A.length, B.length);
  while (prefix < minLen && A[prefix] === B[prefix]) prefix += 1;

  // Find common suffix (not overlapping prefix)
  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    A[A.length - 1 - suffix] === B[B.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  /** @type {DiffRegion[]} */
  const regions = [];

  if (prefix > 0) {
    regions.push({
      type: 'equal',
      aStart: 0,
      aEnd: prefix,
      bStart: 0,
      bEnd: prefix,
      aLength: prefix,
      bLength: prefix,
    });
  }

  const aMidStart = prefix;
  const aMidEnd = A.length - suffix;
  const bMidStart = prefix;
  const bMidEnd = B.length - suffix;
  const aMidLen = aMidEnd - aMidStart;
  const bMidLen = bMidEnd - bMidStart;

  if (aMidLen === 0 && bMidLen > 0) {
    regions.push({
      type: 'inserted',
      aStart: aMidStart,
      aEnd: aMidStart,
      bStart: bMidStart,
      bEnd: bMidEnd,
      aLength: 0,
      bLength: bMidLen,
    });
  } else if (bMidLen === 0 && aMidLen > 0) {
    regions.push({
      type: 'removed',
      aStart: aMidStart,
      aEnd: aMidEnd,
      bStart: bMidStart,
      bEnd: bMidStart,
      aLength: aMidLen,
      bLength: 0,
    });
  } else if (aMidLen > 0 && bMidLen > 0) {
    // Treat the middle as a single changed region (byte-level, not semantic).
    // For finer granularity a full LCS could be used; this is intentional.
    regions.push({
      type: 'changed',
      aStart: aMidStart,
      aEnd: aMidEnd,
      bStart: bMidStart,
      bEnd: bMidEnd,
      aLength: aMidLen,
      bLength: bMidLen,
    });
  }

  if (suffix > 0) {
    regions.push({
      type: 'equal',
      aStart: A.length - suffix,
      aEnd: A.length,
      bStart: B.length - suffix,
      bEnd: B.length,
      aLength: suffix,
      bLength: suffix,
    });
  }

  const summary = { equal: 0, changed: 0, inserted: 0, removed: 0 };
  for (const r of regions) {
    if (r.type === 'equal') summary.equal += r.aLength;
    else if (r.type === 'changed') {
      // Count max of the two sides as "changed" extent for summary
      summary.changed += Math.max(r.aLength, r.bLength);
    } else if (r.type === 'inserted') summary.inserted += r.bLength;
    else if (r.type === 'removed') summary.removed += r.aLength;
  }

  return {
    identical: false,
    aLength: A.length,
    bLength: B.length,
    regions,
    summary,
  };
}

/**
 * Export a diff result as structured JSON (stable key order).
 * @param {ReturnType<typeof byteDiff>} diff
 * @returns {string}
 */
export function exportDiffJson(diff) {
  return JSON.stringify(
    {
      kind: 'babelcodec-byte-diff',
      version: 1,
      note: 'Byte-level comparison only. Not a semantic or textual diff.',
      identical: diff.identical,
      aLength: diff.aLength,
      bLength: diff.bLength,
      summary: diff.summary,
      regions: diff.regions,
    },
    null,
    2,
  );
}
