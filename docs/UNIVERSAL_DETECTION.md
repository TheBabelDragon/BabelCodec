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

Each **finding** includes: `finding_id`, `type`, `subtype`, `confidence`, `evidence`, `offset`, `length`, `completeness`, `parent_finding_id`, `alerts`, `decoder_available`.

Completeness: `complete` | `partial` | `truncated` | `malformed` | `ambiguous` | `unknown`.

## Safety

- Original bytes always preserved (`originalPreserved: true`).
- No execution, no archive extraction, no network fetch.
- Bounded size, depth, finding count, and work units (`src/media/detection/limits.js`).
- Type hints that conflict with evidence raise a `TYPE_HINT_CONFLICT` warning.

## Multi-type payloads

A single input may yield multiple findings (text + JSON + nested Base64 image + unclassified region). Unclassified regions remain accessible.
