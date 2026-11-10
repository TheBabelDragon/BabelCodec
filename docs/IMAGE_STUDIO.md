# Image Studio

Offline-first image workspace inside BabelCodec (**Image Studio** tab).

## Modes

| Mode | Purpose |
|------|---------|
| **Create** | Canvas scene graph (rect, ellipse, text, line) → PNG / JPEG / WebP / SVG |
| **Convert** | Import raster or HEIF → preview → export PNG / JPEG / WebP |
| **Inspect** | Format, dimensions, SHA-256, HEIF box list; jump to Hex Inspector |
| **Batch** | Multi-file queue with isolated failures; per-file download |
| **Generate** | Provider-independent text-to-image (mock + procedural offline; optional gateway) |

## Local-first core

Works **without** API keys, subscriptions, or network:

- Blank canvas / scene create
- Procedural generation (`procedural` provider)
- Import PNG/JPEG/WebP/GIF/BMP (browser decode) + HEIF structural
- Shared **asset registry** (`src/media/assets`) for suite identity
- Local **edit ops** (`src/media/edit`): crop, resize, flip, rotate 90°, color adjust, blur, undo/redo stack
- Export PNG / JPEG / WebP / SVG (from Create)

## Suite integration

```js
import {
  handoffBytesToSuite,
  openInHexInspector,
  openInStructure,
  openInConverter,
  openInLogicLab,
  textOverlaySpec,
} from '../media/handoff.js';
```

- **Converter / Hex / Structure / Logic:** push bytes via `onBytes` + `onNavigate(tab)`.
- **Unicode text overlays:** `textOverlaySpec` for Create scene objects (does not require WASM).
- Architecture: [IMAGE_STUDIO_ARCHITECTURE.md](./IMAGE_STUDIO_ARCHITECTURE.md), [ASSET_SYSTEM.md](./ASSET_SYSTEM.md).

## Optional tiers

| Tier | Behavior |
|------|----------|
| Local inference | Capability detection only; **no models bundled** — does not advertise generation |
| Remote generation | `gateway` provider when URL configured; secrets on server only |

## Limits

- Default import max: 8 MiB (`DEFAULT_MAX_BYTES`).
- Asset registry soft ceiling configurable (`maxBytes`, default 24 MiB).
- Generation asset ceiling: 12 MiB per result.
- Object URLs revoked on replace/clear/remove.

## Mobile

Mode chips scroll horizontally. Create/Convert/Generate stack under 900px. Previews `object-fit: contain`.
