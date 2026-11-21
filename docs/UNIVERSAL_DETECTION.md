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

Each **finding** includes: `finding_id`, `type`, `subtype`, `confidence`, `evidence`, `offset`, `length`, `completeness`, `parent_finding_id`, `alerts`, `decoder_available`, and optionally `source_token`, `char_start`, `char_end`, parent coordinate fields, and `relationships`.

Completeness: `complete` | `partial` | `truncated` | `malformed` | `ambiguous` | `unknown`.

## Whole-input vs embedded Base64

Detection uses **standard Base64** only (`A–Z`, `a–z`, `0–9`, `+`, `/`, padding `=`).

**Whole-input** claims require stronger evidence than alphabet membership:

- Explicit padding (`SGk=`, `SA==`), or
- Length ≥ 8 for unpadded tokens, or
- Presence of `+` / `/`

Short unpadded letter-only strings such as `HEAD`, `TAIL`, `TEST`, and `DATA` are **not** classified as Base64. They remain ordinary text.

**Embedded** tokens follow the same idea: padded short tokens are allowed; unpadded alphabet-only tokens need length ≥ 8.

### Canonical pad bits

Padding is validated per RFC 4648: unused trailing bits in the final quantum must be zero. Noncanonical padding is reported as malformed rather than silently accepted as a strong Base64 finding.

### Nested decode

When nested decode is enabled, candidates are ranked by token length, confidence, and span availability. Only the exact `source_token` / character span is decoded. Nested findings use **decoded coordinate space** and link to the parent via `parent_finding_id` and a `decoded-from` relationship.

## Safety

- Original bytes always preserved (`originalPreserved: true`). Retrieval of full bytes is via the artifact ledger when truncated for scanning.
- No execution, no archive extraction, no network fetch.
- Bounded size, depth, finding count, and work units (`src/media/detection/limits.js`).
- Type hints that conflict with evidence raise a `TYPE_HINT_CONFLICT` warning.

## Multi-type payloads

A single input may yield multiple findings (text + JSON + nested Base64 image + unclassified region). Unclassified regions remain accessible.

## Future work: Base64url

Base64url is intentionally deferred. It needs a distinct alphabet (`-`, `_`), explicit padded/unpadded policy, variant-specific validation and decoding, and tests that prove it is not silently conflated with standard Base64.
