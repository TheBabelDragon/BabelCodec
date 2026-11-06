# SHA-256 Functional Engine

FIPS 180-4 reference implementation under `src/sha256/`.

## Import

```js
import { sha256Hex, sha256, padMessage, compressBlock } from 'babelcodec/sha256';
// or from the unified API
import { sha256Hex } from 'babelcodec';
```

## API

| Export | Role |
|--------|------|
| `sha256(input, { trace? })` | Full result: digest, hex, blocks, optional round traces |
| `sha256Bytes(input)` | 32-byte `Uint8Array` |
| `sha256Hex(input)` | Lowercase hex string |
| `padMessage` | Append 0x80, zeros, 64-bit BE bit length |
| `blockCount` | Padded length / 64 |
| `createMessageSchedule` | Expand 16 words → 64 |
| `compressBlock` | One 512-bit block into H[0..7] |
| `serializeRound` / `serializeTrace` | JSON-friendly traces |

All 32-bit arithmetic uses explicit BigInt mod 2³² (`add32`, rotates, shifts).

## UI

**SHA-256 Lab** tab inspects padding, schedule, per-round A–H, and the final digest using this engine only (not the gate-level machine).
