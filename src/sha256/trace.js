/**
 * Compact trace helpers for SHA-256 execution.
 */

import { wordToHex } from './arithmetic.js';

/**
 * Serialize a round snapshot for JSON export.
 * @param {object} round
 * @returns {object}
 */
export function serializeRound(round) {
  return {
    round: round.round,
    a: wordToHex(round.a),
    b: wordToHex(round.b),
    c: wordToHex(round.c),
    d: wordToHex(round.d),
    e: wordToHex(round.e),
    f: wordToHex(round.f),
    g: wordToHex(round.g),
    h: wordToHex(round.h),
    W: wordToHex(round.W),
    K: wordToHex(round.K),
    T1: wordToHex(round.T1),
    T2: wordToHex(round.T2),
  };
}

/**
 * Serialize full hash trace to JSON-friendly object.
 * @param {import('./hash.js').Sha256Result} result
 * @returns {object}
 */
export function serializeTrace(result) {
  return {
    hex: result.hex,
    messageLength: result.messageLength,
    paddedLength: result.paddedLength,
    blocks: result.blocks,
    H: result.H ? result.H.map(wordToHex) : undefined,
    blockTraces: result.blockTraces?.map((bt) => ({
      block: bt.block,
      words: bt.words.map(wordToHex),
      W: bt.W?.map(wordToHex),
      H: bt.H?.map(wordToHex),
      rounds: bt.rounds?.map(serializeRound),
    })),
  };
}
