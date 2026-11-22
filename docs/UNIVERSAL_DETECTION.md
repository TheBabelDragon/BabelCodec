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

- **Identifier:** `babelcodec.detection.v1`
- **Schema URL:** `https://thebabeldragon.github.io/BabelCodec/schemas/media/detection-result.v1.schema.json`
- **File:** `schemas/media/detection-result.v1.schema.json` (JSON Schema Draft 2020-12)

Consumers may validate results with any Draft 2020-12 validator (e.g. Ajv).

**Required top-level fields:** `schema`, `byteLength`, `findings`, `alerts`, `originalPreserved`.

**Optional / nullable:** `originalByteLength`, `scannedByteLength`, `truncated`, `sourceKind`, `filename`, `declaredMime`, `typeHint`, `limits`, `workUnitsUsed`, `originalRetrievableVia`.

Additional properties are permitted for forward compatibility.

### Findings

Required per finding: `finding_id`, `type`, `confidence` (0–1), `offset`, `length`, `completeness`.

Optional: `subtype`, `evidence`, `source_token`, `char_start` / `char_end` (UTF-16 code unit indices into the text form), `parent_finding_id`, `relationships`, `warnings` (string array), `alerts`, parent coordinate metadata, support flags.

### Relationships

Currently produced shape:

```json
{ "kind": "decoded-from", "target": "<parent finding_id>" }
```

Nested findings also carry `decoded-coordinate-space` in `evidence` and may include `parent_offset` / `parent_length` / parent char spans referring to the **encoded** parent span in the original input.

### Alerts

```json
{ "level": "info|warning|security|unsupported", "code": "STRING", "message": "...", "detail": optional }
```

A Base64 **candidate** (`BASE64_CANDIDATE`) is not confirmed content until decode and nested inspection succeed.

## Whole-input vs embedded Base64

Standard Base64 only. Whole-input requires padding, length ≥ 8, or `+/`. Ordinary words (`HEAD`, `TAIL`, …) are not Base64. Canonical RFC 4648 pad bits apply to padded and unpadded forms.

## Safety

Original preserved; bounded scan; no execution. Conflicting type hints raise `TYPE_HINT_CONFLICT`.

## Future work: Base64url

Deferred; must not be conflated with standard Base64.
