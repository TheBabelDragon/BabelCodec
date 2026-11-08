# BabelCodec ↔ Signal Processor integration

File-based, versioned media handoff. No shared origin, no runtime module dependency between repositories.

## Contract

Schema: [`schemas/media/signal-processor-job.v1.schema.json`](../../schemas/media/signal-processor-job.v1.schema.json)

`contract_version: 1`

### Operations

| operation | Direction | Typical assets |
|-----------|-----------|----------------|
| `image_to_sstv` | BabelCodec → Signal Processor | PNG + manifest |
| `sstv_to_image` | Signal Processor internal | WAV decode request metadata |
| `audio_handoff` | Signal Processor → BabelCodec or archive | WAV + manifest |
| `reconstructed_image` | Signal Processor → BabelCodec | PNG + diagnostics |
| `image_handoff` | Generic image transfer | PNG/JPEG/WebP + manifest |

### Transfer workflow (required path)

1. **BabelCodec** exports image bytes (PNG) and a JSON manifest (`createImageToSstvManifest`).
2. User downloads both files.
3. **Signal Processor** imports image + manifest, validates `contract_version` and integrity.
4. Encodes SSTV → WAV (pcm_s16le mono 44.1/48 kHz).
5. Optionally decodes WAV → reconstructed PNG + diagnostics.
6. Exports updated manifest (`source_application: signal-processor`) and PNG.
7. **BabelCodec** imports reconstructed PNG for Inspect / comparison.

Do **not** rely on `BroadcastChannel`, shared `localStorage`, or cross-origin binary APIs for the core path.

### Integrity

When `asset.sha256` is present, consumers should verify the companion file matches before processing. Mismatch → hard fail with a clear error.

### SSTV modes (contract labels)

| Label | Mode |
|-------|------|
| `martin_m1` | Martin M1 (VIS 44), 320×256, G-B-R |
| `robot36` | Robot 36 (VIS 8), 320×240, Y/R-Y/B-Y |
| `unknown` | Unspecified / not yet identified |

Exact timing lives in Signal Processor (`SSTV_MODES.md`). BabelCodec does not re-implement SSTV.

### API (BabelCodec)

```js
import {
  validateMediaJobManifest,
  createImageToSstvManifest,
  parseMediaJobManifest,
  sha256HexBytes,
  CONTRACT_VERSION,
} from './src/media/integrations/index.js';
```

### Security

- No network required.
- Manifests are data, not code.
- Bound dimensions (≤ 8192) and reject unsupported audio encodings.
- Radio transmission of exported WAV is an operational/legal concern outside this contract.
