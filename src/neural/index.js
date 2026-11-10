/**
 * BabelCodec Neural Signal Contract v1
 * Package subpath: babelcodec/neural (after export registration)
 */

export {
  canonicalize,
  canonicalizeBytes,
  decodeCanonical,
  canonicalEqual,
  serializationVersion,
  CanonicalError,
} from './canonical.js';

export { contentHash, withContentIdentity, HASH_ALGORITHM } from './hash.js';

export {
  FEATURE_TYPES,
  validateFeature,
  validateFeatureVector,
  feature,
} from './features.js';

export {
  SCHEMA_OBSERVATION,
  SCHEMA_INFERENCE,
  SCHEMA_DECISION,
  AUTHORIZATION_STATES,
  EXECUTION_STATES,
  createObservation,
  createInference,
  createDecision,
  validateObservation,
  validateInference,
  validateDecision,
  validateEvent,
} from './events.js';

export {
  indexEvents,
  validateReferences,
  reconstructChain,
  sequenceGaps,
} from './chain.js';

export {
  SERPENT_CUBE_SCHEMA,
  DINUKE_TO_HEBREW,
  GEMATRIA,
  TRANS,
  SERPENT_CUBE,
  CODON_TABLE,
  validateSerpentCube,
  dinucleotideToHebrew,
  gematriaValue,
  encodeDnaToHebrew,
  validateCubeWeights,
} from './serpent-cube.js';

export { translatePartial } from './dna.js';

export {
  syntheticAcousticObservation,
  referenceFrequencyInference,
  evaluateFrequencyDecision,
  runFrequencyShiftFixture,
} from './fixture.js';
