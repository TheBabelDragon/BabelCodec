/**
 * Hard bounds for safe detection — prevent unbounded work.
 */

export const DEFAULT_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  maxFindings: 64,
  maxScanDepth: 3,
  maxNestedDecodeBytes: 2 * 1024 * 1024,
  maxSegmentScan: 32,
  maxWorkUnits: 50_000,
};

/**
 * @param {Partial<typeof DEFAULT_LIMITS>} [override]
 */
export function resolveLimits(override = {}) {
  return { ...DEFAULT_LIMITS, ...override };
}
