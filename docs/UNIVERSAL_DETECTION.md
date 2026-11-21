# Universal Detection

BabelCodec recognizes input without requiring the user to select a type first.

## API

```js
import { detectInput } from 'babelcodec/media/detection';

const result = await detectInput(payload, {
  typeHint: 'image/png', // optional; never overrides contradictory evidence
  decodeNested: true,
});
```

## Result schema

See `schemas/media/detection-result.v1.schema.json` (`babelcodec.detection.v1`).

Top-level fields include: `schema`, `originalByteLength`, `scannedByteLength`, `byteLength`, `truncated`, `sourceKind`, `filename`, `declaredMime`, `typeHint`, `findings`, `alerts`, `limits`, `workUnitsUsed`, `originalPreserved`, `originalRetrievableVia`.

Each **finding** may include: `finding_id`, `type`, `subtype`, `confidence`, `evidence`, `offset`, `length`, `completeness`, `parent_finding_id`, `alerts`, `decoder_available`, `source_token`, `char_start`, `char_end`, parent coordinate fields, and `relationships`.

Completeness: `complete` | `partial` | `truncated` | `malformed` | `ambiguous` | `unknown`.

Consumers can validate runtime results against the JSON Schema file. Structural integration tests exercise live `detectInput()` output against that contract.

## Whole-input vs embedded Base64

**Standard Base64 only** (`A–Z`, `a–z`, `0–9`, `+`, `/`, optional `=`).

**Whole-input** claims require:

- Explicit padding (`SGk=`, `SA==`), or
- Length ≥ 8 for unpadded alphanumeric tokens, or
- Presence of `+` / `/`

Short unpadded letter-only strings (`HEAD`, `TAIL`, `TEST`, `DATA`) are **not** Base64 findings.

**Embedded** tokens: padded short tokens allowed; unpadded alphabet-only require length ≥ 8.

### Canonical pad bits (RFC 4648)

Applied to **padded and unpadded** forms:

- Final quantum with 2 alphabet chars (one data byte / `==`): second sextet’s low 4 bits must be zero.
- Final quantum with 3 alphabet chars (two data bytes / `=`): third sextet’s low 2 bits must be zero.

Examples: `SGk=`, `SA==`, `SGk`, `SA` are valid; `AB==`, `AAB=`, `AB`, `AAB` are noncanonical and do not become complete Base64 findings or nested-decode parents.

### Nested decode

Candidates ranked by length, confidence, and span availability. Only the exact `source_token` is decoded. Nested findings use decoded coordinate space and link via `parent_finding_id` / `decoded-from`.

## Safety

- `originalPreserved: true`; full bytes via artifact ledger when scan is truncated.
- No execution, archive extraction, or network fetch.
- Bounded size, depth, findings, and work units.
- Conflicting type hints → `TYPE_HINT_CONFLICT`.

## Future work: Base64url

Deferred. Requires a distinct alphabet (`-`, `_`), explicit padded/unpadded policy, and tests that prove it is not conflated with standard Base64.
