/**
 * Neural Signal Contract v1 — event constructors and validators.
 *
 * Schemas:
 *   signal.observation.v1
 *   neural.inference.v1
 *   feedback.decision.v1
 */

import { validateFeatureVector } from './features.js';
import { withContentIdentity } from './hash.js';

export const SCHEMA_OBSERVATION = 'signal.observation.v1';
export const SCHEMA_INFERENCE = 'neural.inference.v1';
export const SCHEMA_DECISION = 'feedback.decision.v1';

export const AUTHORIZATION_STATES = Object.freeze([
  'none',
  'proposed',
  'approved',
  'rejected',
  'executed',
  'failed',
  'cancelled',
]);

export const EXECUTION_STATES = Object.freeze([
  'not_applicable',
  'pending',
  'executed',
  'failed',
  'cancelled',
]);

function req(obj, key, errors, msg) {
  if (obj[key] == null || obj[key] === '') errors.push(msg || `${key} required`);
}

/**
 * Create a signal.observation.v1 event.
 * Timestamps may be ISO-8601 strings or {$i:"ns"} for nanosecond instants.
 */
export function createObservation(opts = {}) {
  const event = {
    schema: SCHEMA_OBSERVATION,
    event_id: String(opts.event_id || `obs-${Date.now()}`),
    source_system: String(opts.source_system || 'unknown'),
    source_node_id: String(opts.source_node_id || 'unknown'),
    source_sequence: opts.source_sequence != null ? opts.source_sequence : 0,
    source_timestamp: opts.source_timestamp ?? null,
    ingestion_timestamp: opts.ingestion_timestamp ?? new Date().toISOString(),
    clock_domain: opts.clock_domain || 'wall_utc',
    observation_type: String(opts.observation_type || 'generic'),
    features: Array.isArray(opts.features) ? opts.features : [],
    provenance: opts.provenance && typeof opts.provenance === 'object' ? opts.provenance : {},
  };
  if (opts.raw_ref != null) event.raw_ref = opts.raw_ref;
  if (opts.correlation_id != null) event.correlation_id = opts.correlation_id;
  if (opts.units_note != null) event.units_note = opts.units_note;
  return withContentIdentity(SCHEMA_OBSERVATION, event);
}

export function validateObservation(event) {
  const errors = [];
  if (!event || typeof event !== 'object') return { ok: false, errors: ['event must be object'] };
  if (event.schema !== SCHEMA_OBSERVATION) errors.push(`schema must be ${SCHEMA_OBSERVATION}`);
  req(event, 'event_id', errors);
  req(event, 'source_system', errors);
  req(event, 'source_node_id', errors);
  if (typeof event.source_sequence !== 'number' || !Number.isFinite(event.source_sequence)) {
    errors.push('source_sequence must be finite number');
  }
  req(event, 'observation_type', errors);
  const fv = validateFeatureVector(event.features || []);
  if (!fv.ok) errors.push(...fv.errors);
  return errors.length ? { ok: false, errors } : { ok: true, event };
}

/**
 * Create neural.inference.v1 referencing observation event_ids.
 * confidence semantics: documented by model; not assumed calibrated.
 */
export function createInference(opts = {}) {
  const event = {
    schema: SCHEMA_INFERENCE,
    event_id: String(opts.event_id || `inf-${Date.now()}`),
    model_id: String(opts.model_id || 'unknown'),
    model_version: String(opts.model_version || '0'),
    inference_timestamp: opts.inference_timestamp ?? new Date().toISOString(),
    input_observation_ids: Array.isArray(opts.input_observation_ids)
      ? opts.input_observation_ids.map(String)
      : [],
    prediction: opts.prediction != null ? opts.prediction : null,
    confidence: opts.confidence != null ? opts.confidence : null,
    confidence_semantics: opts.confidence_semantics || 'unspecified',
    provenance: opts.provenance && typeof opts.provenance === 'object' ? opts.provenance : {},
  };
  if (opts.model_artifact_id != null) event.model_artifact_id = opts.model_artifact_id;
  if (opts.scores != null) event.scores = opts.scores;
  if (opts.attribution != null) event.attribution = opts.attribution;
  if (opts.correlation_id != null) event.correlation_id = opts.correlation_id;
  if (opts.causation_ids != null) event.causation_ids = opts.causation_ids;
  return withContentIdentity(SCHEMA_INFERENCE, event);
}

export function validateInference(event) {
  const errors = [];
  if (!event || typeof event !== 'object') return { ok: false, errors: ['event must be object'] };
  if (event.schema !== SCHEMA_INFERENCE) errors.push(`schema must be ${SCHEMA_INFERENCE}`);
  req(event, 'event_id', errors);
  req(event, 'model_id', errors);
  req(event, 'model_version', errors);
  if (!Array.isArray(event.input_observation_ids) || event.input_observation_ids.length === 0) {
    errors.push('input_observation_ids must be non-empty array');
  }
  if (event.confidence != null) {
    if (typeof event.confidence !== 'number' || !Number.isFinite(event.confidence)) {
      errors.push('confidence must be finite number when present');
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, event };
}

/**
 * Create feedback.decision.v1.
 * A proposal is never an executed action.
 */
export function createDecision(opts = {}) {
  const auth = AUTHORIZATION_STATES.includes(opts.authorization_state)
    ? opts.authorization_state
    : 'proposed';
  const exec = EXECUTION_STATES.includes(opts.execution_state)
    ? opts.execution_state
    : auth === 'executed'
      ? 'executed'
      : 'not_applicable';

  // Safety: proposed/rejected/cancelled cannot claim executed
  let authorization_state = auth;
  let execution_state = exec;
  if (['proposed', 'rejected', 'cancelled', 'none'].includes(auth) && exec === 'executed') {
    execution_state = 'not_applicable';
  }

  const event = {
    schema: SCHEMA_DECISION,
    event_id: String(opts.event_id || `dec-${Date.now()}`),
    decision_id: String(opts.decision_id || opts.event_id || `dec-${Date.now()}`),
    causation_ids: Array.isArray(opts.causation_ids) ? opts.causation_ids.map(String) : [],
    evaluation_method: String(opts.evaluation_method || 'unspecified'),
    evaluation_result: opts.evaluation_result != null ? opts.evaluation_result : null,
    authorization_state,
    execution_state,
    provenance: opts.provenance && typeof opts.provenance === 'object' ? opts.provenance : {},
  };
  if (opts.ground_truth_ref != null) event.ground_truth_ref = opts.ground_truth_ref;
  if (opts.proposed_adjustment != null) event.proposed_adjustment = opts.proposed_adjustment;
  if (opts.outcome != null) event.outcome = opts.outcome;
  if (opts.diagnostics != null) event.diagnostics = opts.diagnostics;
  if (opts.correlation_id != null) event.correlation_id = opts.correlation_id;
  if (opts.authorization_meta != null) event.authorization_meta = opts.authorization_meta;
  return withContentIdentity(SCHEMA_DECISION, event);
}

export function validateDecision(event) {
  const errors = [];
  if (!event || typeof event !== 'object') return { ok: false, errors: ['event must be object'] };
  if (event.schema !== SCHEMA_DECISION) errors.push(`schema must be ${SCHEMA_DECISION}`);
  req(event, 'event_id', errors);
  req(event, 'decision_id', errors);
  if (!Array.isArray(event.causation_ids)) errors.push('causation_ids must be array');
  if (!AUTHORIZATION_STATES.includes(event.authorization_state)) {
    errors.push(`invalid authorization_state: ${event.authorization_state}`);
  }
  if (!EXECUTION_STATES.includes(event.execution_state)) {
    errors.push(`invalid execution_state: ${event.execution_state}`);
  }
  // Hard safety boundary
  if (
    event.authorization_state !== 'executed' &&
    event.authorization_state !== 'approved' &&
    event.execution_state === 'executed'
  ) {
    errors.push('execution_state=executed requires authorization_state approved or executed');
  }
  if (
    ['proposed', 'rejected', 'cancelled', 'none'].includes(event.authorization_state) &&
    event.execution_state === 'executed'
  ) {
    errors.push('proposal/rejection cannot be represented as executed');
  }
  return errors.length ? { ok: false, errors } : { ok: true, event };
}

export function validateEvent(event) {
  if (!event || typeof event !== 'object') return { ok: false, errors: ['event must be object'] };
  switch (event.schema) {
    case SCHEMA_OBSERVATION:
      return validateObservation(event);
    case SCHEMA_INFERENCE:
      return validateInference(event);
    case SCHEMA_DECISION:
      return validateDecision(event);
    default:
      return { ok: false, errors: [`unknown schema: ${event?.schema}`] };
  }
}
