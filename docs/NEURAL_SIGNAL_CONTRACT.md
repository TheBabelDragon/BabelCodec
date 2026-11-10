# Neural Signal Contract v1

**Target release:** 0.10.0  
**Module:** `src/neural/`

BabelCodec is the **canonical representation and interoperability layer** between Signal Processor (acquisition), neural adapters (inference), and feedback consumers (evaluation / authorized control).

This milestone defines contracts only. It is not a neural-network framework.

## Guarantees

| Guaranteed | Not guaranteed |
|------------|----------------|
| Versioned event schemas | Model quality or calibration |
| Deterministic canonical JSON bytes | Clock synchronization |
| SHA-256 content identity with domain separation | Authenticity / authorship |
| Explicit causation references | That timestamps imply causality |
| Observation ≠ inference ≠ decision ≠ execution | Biological meaning of Serpent Cube |
| Feedback proposals cannot execute controls | Complete genetic code translation |

## Event types

### `signal.observation.v1`
What was **measured**. Features are typed; derived features are not original measurements unless marked via `extraction_method` / provenance.

### `neural.inference.v1`
What was **inferred**. Must list `input_observation_ids`. `confidence_semantics` documents whether scores are calibrated probabilities (default: unspecified).

### `feedback.decision.v1`
What was **decided**. Authorization states: `none | proposed | approved | rejected | executed | failed | cancelled`. A proposal is never represented as an executed action.

## Canonical serialization

- Sorted object keys (lexicographic)
- Omit `undefined`; emit `null`
- Reject `NaN` / `±Infinity`
- Preserve array order
- Compact JSON → UTF-8 bytes
- Large integers as `{ "$i": "<decimal>" }` for cross-language safety

Serialization version string: `babelcodec.canonical-json.v1`

## Content hash

```
content_hash = SHA-256( domain_sep || canonical_utf8_bytes )
```

Domain separators (ASCII + NUL):

- `babelcodec:signal.observation.v1\0`
- `babelcodec:neural.inference.v1\0`
- `babelcodec:feedback.decision.v1\0`

Algorithm identifier: `sha-256` only in v1. Keccak-256 is not substituted.

## Causal chains

```
observation → inference → decision → (authorized execution outside BabelCodec)
```

Use `causation_ids` / `input_observation_ids`. Do not infer order from timestamps alone. Source time and ingestion time are separate fields.

## Feedback safety

BabelCodec **may** record a `proposed_adjustment`. It **must not** control microphones, transmitters, ESP32 hardware, actuators, model weights, or training state. Execution requires a separate authorized consumer and explicit authorization metadata.

## Serpent Cube (`serpent-cube.v1`)

Optional experimental extension. Supplied dinucleotide, Gematria, transliteration, 3×3×3 cube, and partial codon tables are preserved and validated. Not a core event dependency. Not biological or neural evidence.

## Signal Processor fixture

`runFrequencyShiftFixture()` walks synthetic 440 Hz → 880 Hz observations through inference and decision evaluation, verifies shift detection, canonical round-trip, hashing, and that unauthorized execution remains blocked.

## API

```js
import {
  createObservation,
  createInference,
  createDecision,
  canonicalize,
  contentHash,
  reconstructChain,
  runFrequencyShiftFixture,
  validateSerpentCube,
} from './src/neural/index.js';
```

## Future Rust/WASM Unicode engine

Canonical JSON is pure structural UTF-8 of sorted JSON text. The Unicode engine is not required for this contract; when integrated, it must not introduce a second canonical representation for these event bytes.
