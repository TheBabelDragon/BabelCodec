# Image Studio Architecture

**Base (live main):** `8aac8b338bfc536130f75d6e8ab0ef1e52642f66`  
**Branch:** `feat/integrated-image-studio`

## Phase 0 audit

### What already exists on main

| Area | Location | Status |
|------|----------|--------|
| Navigation | `index.html` tab **Image Studio** (`data-tab="media"`) | Present |
| Shell | `src/ui/studio-ui.js` modes Create / Convert / Inspect / Batch / Generate | Present |
| Scene create | `src/media/studio/create.js` shapes + text → Canvas/SVG | Present |
| Convert/inspect | `src/media/image/*`, HEIF structural | Present |
| Generation | `src/media/generation/*` mock + procedural + optional gateway | Present |
| Bytes handoff | `onBytes` → Hex Inspector / structure | Partial |
| Shared asset registry | — | **Missing** |
| Non-destructive edit stack | — | **Missing** (convert is load→export) |
| Explicit suite handoff API | ad-hoc `onNavigate` / `onBytes` | **Needs formalization** |
| Local inference adapter | TPU capability registry only | **Honest stub needed** |

### Deployment

GitHub Pages static frontend. Secrets never in client. Optional `services/generation-gateway` for remote.

### Integration points (suite)

```
Image Studio ──onBytes──► Hex Inspector / Structure
            ──onNavigate► converter | inspector | structure | logic | text
            ──assets────► shared AssetRegistry (this branch)
Generate    ──results───► AssetRegistry + Convert pipeline
```

### Design principles

1. Local-first: create / import / edit / export without network.
2. Shared assets: one registry, multiple consumers.
3. Remote generation and local inference are optional tiers.
4. Do not duplicate BabelCodec labs or invent a second navigation system.

## Module map (this branch)

```
src/media/assets/          # suite-wide asset abstraction + optional IDB
src/media/edit/            # crop/resize/rotate/color/undo stack
src/media/inference/       # capability detection (no bundled weights)
src/media/studio/          # existing create/batch (unchanged contracts)
src/media/generation/      # existing providers
src/media/handoff.js       # explicit suite handoff helpers
```

## Execution tiers

1. **Local tools** — Canvas, Blob, ImageBitmap, procedural create, edit ops.
2. **Local intelligence** — WebGPU/WASM/CPU detection; no models shipped by default.
3. **Remote** — gateway provider when URL configured.
