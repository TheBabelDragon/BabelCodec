# Neural Signal Contract — golden vectors

Shared inputs for cross-language parity (JavaScript / Python).

## Files

| File | Purpose |
|------|--------|
| `observation.minimal.json` | Minimal valid `signal.observation.v1` (without content_identity) |

## How to verify (JS)

```js
import { readFileSync } from 'node:fs';
import { createObservation, canonicalize, contentHash, validateObservation } from '../../src/neural/index.js';

const raw = JSON.parse(readFileSync('golden/neural/observation.minimal.json', 'utf8'));
// Re-hash with current engine after stripping identity fields
const { content_identity, content_hash, ...body } = raw;
const hashed = contentHash(body.schema, body);
console.log(hashed.hex);
```

Expected properties:

- Canonical bytes are stable for the same logical event.
- Domain-separated SHA-256 hex is 64 lowercase hex chars.
- Validation succeeds for the minimal observation.

Python consumers should load the same JSON and apply the same canonicalization rules documented in `docs/NEURAL_SIGNAL_CONTRACT.md`.
