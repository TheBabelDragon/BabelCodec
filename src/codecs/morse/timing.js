import { DEFAULT_TIMING } from './profiles.js';
import { blockDuration, blockTimeline } from './blocks.js';

export { DEFAULT_TIMING, blockDuration, blockTimeline };

export function unitsToMs(units, unitMs = 50) {
  return units * unitMs;
}
