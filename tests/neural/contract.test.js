import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createObservation,
  createInference,
  createDecision,
  validateObservation,
  validateInference,
  validateDecision,
  validateEvent,
  canonicalize,
  decodeCanonical,
  canonicalEqual,
  contentHash,
  feature,
  validateFeatureVector,
  validateReferences,
  reconstructChain,
  runFrequencyShiftFixture,
  validateSerpentCube,
  encodeDnaToHebrew,
  translatePartial,
  SCHEMA_OBSERVATION,
} from '../../src/neural/index.js';

describe('neural signal contract — events', () => {
  it('creates and validates observation', () => {
    const obs = createObservation({
      event_id: 'o1',
      source_system: 'signal-processor',
      source_node_id: 'n1',
      source_sequence: 1,
      observation_type: 'acoustic.tone',
      features: [
        feature({
          feature_id: 'f1',
          name: 'frequency',
          type: 'float64',
          unit: 'Hz',
          value: 440,
        }),
      ],
    });
    assert.equal(obs.schema, SCHEMA_OBSERVATION);
    assert.ok(obs.content_identity?.hex);
    assert.equal(obs.content_identity.algorithm, 'sha-256');
    const v = validateObservation(obs);
    assert.equal(v.ok, true);
  });

  it('rejects non-finite feature values', () => {
    const r = validateFeatureVector([
      feature({ feature_id: 'x', name: 'x', type: 'float64', value: NaN }),
    ]);
    assert.equal(r.ok, false);
  });

  it('inference requires observation refs', () => {
    const inf = createInference({
      event_id: 'i1',
      model_id: 'm',
      model_version: '1',
      input_observation_ids: [],
      prediction: {},
    });
    const v = validateInference(inf);
    assert.equal(v.ok, false);
  });

  it('decision cannot claim executed while proposed', () => {
    const d = createDecision({
      event_id: 'd1',
      causation_ids: ['i1'],
      authorization_state: 'proposed',
      execution_state: 'executed',
    });
    assert.equal(d.execution_state, 'not_applicable');
    const v = validateDecision(d);
    assert.equal(v.ok, true);
  });

  it('unknown schema rejected', () => {
    const v = validateEvent({ schema: 'nope.v1', event_id: 'x' });
    assert.equal(v.ok, false);
  });
});

describe('canonical serialization', () => {
  it('key order stable', () => {
    const a = canonicalize({ b: 1, a: 2 });
    const b = canonicalize({ a: 2, b: 1 });
    assert.equal(a, b);
    assert.equal(a, '{"a":2,"b":1}');
  });

  it('rejects NaN', () => {
    assert.throws(() => canonicalize({ x: NaN }));
  });

  it('round trip', () => {
    const o = { z: [1, 2], m: { a: true, b: null } };
    const t = canonicalize(o);
    assert.ok(canonicalEqual(o, decodeCanonical(t)));
  });

  it('content hash stable and domain-separated', () => {
    const obs = createObservation({
      event_id: 'h1',
      source_system: 't',
      source_node_id: 'n',
      source_sequence: 0,
      observation_type: 't',
      features: [],
      ingestion_timestamp: '2026-01-01T00:00:00.000Z',
    });
    const h1 = contentHash(obs.schema, obs);
    const h2 = contentHash(obs.schema, obs);
    assert.equal(h1.hex, h2.hex);
    assert.equal(h1.hex.length, 64);
  });
});

describe('fixture pipeline', () => {
  it('detects controlled frequency shift', () => {
    const r = runFrequencyShiftFixture();
    assert.equal(r.ok, true);
    assert.equal(r.detected_frequency_shift, true);
    assert.equal(r.unauthorized_execution_blocked, true);
    assert.ok(r.chain.includes('obs-shifted'));
    assert.ok(r.canonical_roundtrip);
  });

  it('validates causal references', () => {
    const r = runFrequencyShiftFixture();
    const events = [r.baseline, r.shifted, r.inference, r.decision_match];
    assert.equal(validateReferences(events).ok, true);
    const chain = reconstructChain(events, r.decision_match.event_id);
    assert.equal(chain.ok, true);
  });
});

describe('serpent cube + dna', () => {
  it('validates cube structure', () => {
    const v = validateSerpentCube();
    assert.equal(v.ok, true);
  });

  it('encodes DNA with trailing preserved', () => {
    const r = encodeDnaToHebrew('ATGC');
    assert.equal(r.ok, true);
    assert.equal(r.reversible, false);
  });

  it('partial codon translation keeps trailing', () => {
    const r = translatePartial('ATGA');
    assert.equal(r.ok, true);
    assert.equal(r.incomplete_trailing, 'A');
    assert.equal(r.incomplete_trailing_discarded, false);
    assert.equal(r.table_coverage, 'partial');
  });
});
