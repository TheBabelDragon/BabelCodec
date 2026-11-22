/**
 * Shared resource-budget context for one root detectInput() operation.
 * Passed by reference into recursive children — never reset.
 */

/**
 * @param {import('./limits.js').DEFAULT_LIMITS} limits
 */
export function createDetectionBudget(limits) {
  return {
    units: 0,
    maxUnits: limits.maxWorkUnits,
    nestedDecodedBytes: 0,
    maxNestedDecodedBytes: limits.maxNestedDecodeBytes,
    depth: 0,
    maxDepth: limits.maxScanDepth,
    candidateCount: 0,
    maxCandidates: limits.maxSegmentScan ?? 32,
    findingsCount: 0,
    maxFindings: limits.maxFindings,
    stopped: false,
    stoppedReason: null,
  };
}

export function remainingUnits(budget) {
  return Math.max(0, budget.maxUnits - budget.units);
}

/**
 * @param {ReturnType<typeof createDetectionBudget>} budget
 * @param {number} cost
 * @param {string} [reason]
 * @returns {boolean} true if the charge was accepted
 */
export function charge(budget, cost, reason = 'WORK_LIMIT') {
  if (budget.stopped) return false;
  const c = Math.max(0, cost | 0);
  if (budget.units + c > budget.maxUnits) {
    budget.units = budget.maxUnits;
    budget.stopped = true;
    budget.stoppedReason = reason;
    return false;
  }
  budget.units += c;
  if (budget.units >= budget.maxUnits) {
    budget.stopped = true;
    budget.stoppedReason = reason;
  }
  return true;
}

export function markStopped(budget, reason) {
  budget.stopped = true;
  if (!budget.stoppedReason) budget.stoppedReason = reason;
}

export function canDecodeNested(budget, estimatedBytes) {
  if (budget.stopped) return false;
  if (budget.depth >= budget.maxDepth) {
    markStopped(budget, 'DEPTH_LIMIT');
    return false;
  }
  if (budget.candidateCount >= budget.maxCandidates) {
    markStopped(budget, 'CANDIDATE_LIMIT');
    return false;
  }
  if (budget.nestedDecodedBytes + estimatedBytes > budget.maxNestedDecodedBytes) {
    markStopped(budget, 'NESTED_BYTE_LIMIT');
    return false;
  }
  if (remainingUnits(budget) <= 0) {
    markStopped(budget, 'WORK_LIMIT');
    return false;
  }
  return true;
}
