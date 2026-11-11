# Image Studio Architecture (Hybrid Creative + Technical Lab)

**Base (live main HEAD):** `3e427947e41c08202c1f0aa3a0b075a32af23060`  
**Branch:** `feat/image-studio-creative-lab`

## Audit summary (main after PR #28)

| Capability | Module | Status |
|------------|--------|--------|
| Panel visibility | `studio-ui.js` setMode + `.active` | Fixed on main |
| Create / Convert / Inspect / Batch / Generate | `studio-ui.js` | Present |
| Procedural generation | `generation/providers/procedural.js` | Present |
| Shared assets | `media/assets` | Present |
| Local edit ops | `media/edit` | Present |
| Suite handoff | `media/handoff.js` | Present |
| TPU | capability registry only | No models shipped |
| LLM | — | **Not a remote LLM** — local heuristic intent only |

## Architecture tiers

1. **Local tools** — Create, Playground starters, edit, convert, inspect, batch, procedural generate.
2. **Local intelligence** — Heuristic `interpretCreativeIntent` → design spec; Mutation Lab seeds.
3. **Remote / TPU** — Optional gateway + TPU registry; disabled until configured; never claimed as active when unavailable.

## New modules

```
src/media/creative/
  intent.js      # prompt → DesignSpec (local_heuristic)
  starters.js    # Logo/Texture/Game/Diagram/Poster/Product/Pattern labs
  mutation.js    # seeded variation plans + applyMutationOps
  byte-diff.js   # source vs output byte comparison (honest limits)
  index.js
src/ui/playground-panel.js
```

## UI

- New mode **Playground** (default landing): starters, Surprise Me, intent, mutation planner, routes into Create / Inspect / Generate.
- Technical modes unchanged.

## Non-claims

- Does not embed or call a paid LLM.
- Does not load model weights on open.
- Does not invent pixel→byte offset maps for re-encoded images.
