/**
 * Deterministic Signal Processor ↔ BabelCodec integration fixture.
 * Synthetic acoustic observations only — no claim of neural intelligence.
 */

import { feature } from './features.js';
import {
  createObservation,
  createInference,
  createDecision,
  validateObservation,
  validateInference,
  validateDecision,
} from './events.js';
import { canonicalize, decodeCanonical, canonicalEqual } from './canonical.js';
import { contentHash } from './hash.js';
import { reconstructChain, validateReferences } from './chain.js';

/**
 * Synthetic observation: tone at known frequency.
 */
export function syntheticAcousticObservation(opts = {}) {
  const freq = opts.frequency_hz != null ? opts.frequency_hz : 440;
  const amp = opts.amplitude != null ? opts.amplitude : 0.5;
  const sr = opts.sample_rate_hz != null ? opts.sample_rate_hz : 48000;
  const seq = opts.source_sequence != null ? opts.source_sequence : 1;
  const node = opts.source_node_id || 'sp-node-1';

  return createObservation({
    event_id: opts.event_id || `obs-sp-${seq}`,
    source_system: 'signal-processor',
    source_node_id: node,
    source_sequence: seq,
    source_timestamp: opts.source_timestamp || '2026-01-01T00:00:00.000Z',
    ingestion_timestamp: opts.ingestion_timestamp || '2026-01-01T00:00:00.050Z',
    clock_domain: 'wall_utc',
    observation_type: 'acoustic.tone',
    features: [
      feature({
        feature_id: 'acoustic.frequency_hz',
        name: 'frequency',
        type: 'float64',
        unit: 'Hz',
        value: freq,
        extraction_method: 'synthetic_fixture',
      }),
      feature({
        feature_id: 'acoustic.amplitude',
        name: 'amplitude',
        type: 'float64',
        unit: '1',
        value: amp,
        extraction_method: 'synthetic_fixture',
      }),
      feature({
        feature_id: 'acoustic.sample_rate_hz',
        name: 'sample_rate',
        type: 'float64',
        unit: 'Hz',
        value: sr,
        extraction_method: 'synthetic_fixture',
      }),
      feature({
        feature_id: 'acoustic.phase_rad',
        name: 'phase',
        type: 'float64',
        unit: 'rad',
        value: opts.phase_rad != null ? opts.phase_rad : 0,
        extraction_method: 'synthetic_fixture',
      }),
    ],
    provenance: {
      fixture: 'babelcodec.neural.fixture.v1',
      note: 'synthetic acoustic observation for contract tests',
    },
    correlation_id: opts.correlation_id || 'corr-fixture-1',
  });
}

/**
 * Reference "inference": reports detected frequency (identity model).
 */
export function referenceFrequencyInference(observation, opts = {}) {
  const freqFeature = (observation.features || []).find(
    (f) => f.feature_id === 'acoustic.frequency_hz',
  );
  const detected = freqFeature ? freqFeature.value : null;
  return createInference({
    event_id: opts.event_id || `inf-ref-${observation.event_id}`,
    model_id: 'reference.frequency_identity',
    model_version: '1.0.0',
    model_artifact_id: 'fixture-no-weights',
    inference_timestamp: opts.inference_timestamp || '2026-01-01T00:00:00.100Z',
    input_observation_ids: [observation.event_id],
    prediction: { frequency_hz: detected },
    confidence: 1.0,
    confidence_semantics: 'fixture_certainty_not_calibrated_probability',
    causation_ids: [observation.event_id],
    correlation_id: observation.correlation_id,
    provenance: { fixture: 'babelcodec.neural.fixture.v1' },
  });
}

/**
 * Evaluate inference against ground-truth frequency; propose adjustment only.
 */
export function evaluateFrequencyDecision(inference, groundTruthHz, opts = {}) {
  const predicted = inference.prediction?.frequency_hz;
  const delta = predicted != null && groundTruthHz != null ? predicted - groundTruthHz : null;
  const match =
    predicted != null && groundTruthHz != null && Math.abs(predicted - groundTruthHz) < 0.5;

  return createDecision({
    event_id: opts.event_id || `dec-${inference.event_id}`,
    decision_id: opts.decision_id || `decision-${inference.event_id}`,
    causation_ids: [inference.event_id, ...(inference.input_observation_ids || [])],
    evaluation_method: 'absolute_frequency_delta',
    ground_truth_ref: { frequency_hz: groundTruthHz },
    evaluation_result: { match, delta_hz: delta, predicted_hz: predicted },
    proposed_adjustment: match
      ? null
      : {
          type: 'retune_reference',
          target_frequency_hz: groundTruthHz,
          note: 'proposal only — not executable by BabelCodec',
        },
    authorization_state: 'proposed',
    execution_state: 'not_applicable',
    correlation_id: inference.correlation_id,
    diagnostics: {
      safety: 'BabelCodec does not execute control actions',
    },
    provenance: { fixture: 'babelcodec.neural.fixture.v1' },
  });
}

/**
 * Full pipeline: baseline 440 Hz, shifted 880 Hz, detect difference.
 */
export function runFrequencyShiftFixture() {
  const baseline = syntheticAcousticObservation({
    event_id: 'obs-baseline',
    source_sequence: 1,
    frequency_hz: 440,
  });
  const shifted = syntheticAcousticObservation({
    event_id: 'obs-shifted',
    source_sequence: 2,
    frequency_hz: 880,
    correlation_id: 'corr-fixture-1',
  });

  const v1 = validateObservation(baseline);
  const v2 = validateObservation(shifted);
  if (!v1.ok || !v2.ok) {
    return { ok: false, errors: [...(v1.errors || []), ...(v2.errors || [])] };
  }

  const canon1 = canonicalize(baseline);
  const round1 = decodeCanonical(canon1);
  const hash1 = contentHash(baseline.schema, baseline);

  const inf = referenceFrequencyInference(shifted, { event_id: 'inf-shifted' });
  const vi = validateInference(inf);
  if (!vi.ok) return { ok: false, errors: vi.errors };

  // Ground truth for shifted observation is 880
  const dec = evaluateFrequencyDecision(inf, 880, { event_id: 'dec-shifted' });
  const vd = validateDecision(dec);
  if (!vd.ok) return { ok: false, errors: vd.errors };

  // Controlled change: inference on shifted should not match baseline ground truth 440
  const decMismatch = evaluateFrequencyDecision(inf, 440, { event_id: 'dec-mismatch' });
  const detectedShift = decMismatch.evaluation_result && !decMismatch.evaluation_result.match;

  const events = [baseline, shifted, inf, dec, decMismatch];
  const refs = validateReferences(events);
  const chain = reconstructChain(events, dec.event_id);

  return {
    ok: refs.ok && chain.ok && detectedShift && canonicalEqual(round1, JSON.parse(canon1)),
    baseline,
    shifted,
    inference: inf,
    decision_match: dec,
    decision_mismatch: decMismatch,
    detected_frequency_shift: detectedShift,
    content_hash_baseline: hash1.hex,
    canonical_roundtrip: canonicalEqual(baseline, decodeCanonical(canonicalize(baseline))),
    chain: chain.chain?.map((e) => e.event_id),
    references_ok: refs.ok,
    unauthorized_execution_blocked:
      dec.authorization_state === 'proposed' && dec.execution_state === 'not_applicable',
  };
}
