# HEIF / HEIC Media Decoder

**Status:** Structural inspection and conversion pipeline implemented on branch `feat/heic-heif-media-decoder`.
**Pixel decode:** Optional pluggable WASM backend (not bundled by default — register via `setHeifDecoderBackend`).

## Architecture

```
Original HEIC/HEIF bytes
        │
        ├─► Media Decoder (src/media/heif/)
        │      ├─ detect.js      brand / ftyp classification
        │      ├─ boxes.js       ISOBMFF box walk (ftyp, meta, iprp, …)
        │      ├─ decoder.js     decodeHEIF() adapter + structural metadata
        │      └─ convert.js     RGBA → PNG / JPEG / WebP (Canvas)
        │
        └─► Existing Binary Engine
               ├─ Hex Inspector
               └─ Structure Analyzer
```

The original `Uint8Array` is shared with the Hex Inspector via the Media Lab `onBytes` callback. No duplicate full-file copies are required for inspection.

## Public surface

```js
import {
  decodeHEIF,
  inspectHEIFSync,
  inspectContainer,
  classifyHeif,
  hasFtypSignature,
  setHeifDecoderBackend,
  convertDecodedImage,
} from './src/media/heif/index.js';
```

### `decodeHEIF(fileBytes, options)`

Returns a structured result:

| Field | Meaning |
|-------|---------|
| `ok` | Structural validation passed (or pixel decode succeeded) |
| `status` | `decoded` \| `structural_only` \| `unsupported` \| `error` |
| `images[]` | `{ width, height, rgba, isPrimary, index }` |
| `container` | Brand classification + top-level box types |
| `metadata` | Dimensions (from `ispe` when present), brands, handler |
| `warnings` / `errors` | Non-fatal / fatal messages |
| `sourceBytes` | Same buffer reference passed in |

## Supported capabilities

| Capability | Status |
|------------|--------|
| Recognize `.heic` / `.heif` extensions | Yes (hint only) |
| Validate ftyp + brands | Yes |
| Identify HEVC vs AVIF vs generic HEIF | Yes |
| ISOBMFF box tree (ftyp, meta, hdlr, pitm, iloc, iinf, iprp, ipco, ipma, mdat, …) | Yes |
| Extended-size and size-to-end boxes | Yes |
| Malformed / truncated handling without crash | Yes |
| Pixel decode (HEVC) | Via optional backend only |
| Multi-image files | Backend-dependent |
| PNG export | Yes (when pixels available) |
| JPEG export + quality | Yes (when pixels available) |
| WebP export | When browser Canvas supports it |
| EXIF / full metadata | Structural flags only unless backend provides more |
| Offline operation | Yes — no network, no remote decode service |

## Decoder backend

Register a backend that implements:

```js
{
  async decode(bytes: Uint8Array, options): Promise<{
    images: Array<{ width, height, rgba: Uint8ClampedArray, isPrimary?: boolean }>,
    warnings?: string[],
    codec?: string,
  }>
}
```

Example (conceptual — vendor WASM under `vendor/` and load offline):

```js
import { setHeifDecoderBackend } from './src/media/heif/index.js';
setHeifDecoderBackend(myLibheifAdapter);
```

**License note:** Popular libheif WASM builds are often LGPL-3.0. Document the chosen binary’s license in this file when vendoring. BabelCodec itself remains MIT.

## File-size limit

Default `DEFAULT_MAX_BYTES` = 8 MiB (aligned with the main app load limit). Configurable via `options.maxBytes`.

## Security

- All processing is local.
- No execution of embedded content.
- No telemetry.
- Offsets and box sizes are bounds-checked; integer overflow on 64-bit sizes is rejected when not safely representable.
- Workers (when used) can be aborted via `AbortController` in the UI layer.

## Offline / CSP

Structural code is pure ES modules. A WASM backend must be served from the same origin (or `blob:`) and listed in `script-src` / `wasm-src` CSP directives as needed. No CDN is required after assets are cached.

## UI

**Media Decoder** tab:

- Drag-and-drop + file picker
- Preview (when pixels available)
- File / image info
- Export PNG / JPEG / WebP
- Metadata JSON download
- ISOBMFF box table
- **→ Hex Inspector** sends original bytes into the existing inspector

## Testing

```bash
node --test tests/media/heif.test.js
```

Covers empty input, invalid signature, minimal HEIC ftyp, AVIF classification, truncated boxes, size limits, and source-byte identity for binary integration.

## Known limitations

1. **No default WASM pixel decoder** — structural inspection works out of the box; full image preview requires registering a backend.
2. **Metadata** beyond brands / `ispe` dimensions is limited without a decoder that surfaces EXIF.
3. **Sequences / burst** — multi-image enumeration depends on the backend.
4. **HDR / 10-bit** — conversion path targets 8-bit RGBA Canvas export.
5. **HEVC patents** — decoding HEVC bitstreams may be subject to patent licensing in some jurisdictions; BabelCodec only provides the integration surface.

## Browser compatibility

- Structural path: any modern ES-module browser / Node 18+.
- Export: requires Canvas or OffscreenCanvas.
- WebP encode: environment-dependent (`canEncode('image/webp')`).
