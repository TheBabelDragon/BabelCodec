# Image Gen Audit (live main)

**Audit date:** 2026-11-10  
**Repository SHA audited:** `ec505f76a4c01da6fd7aac4ff039e570a6b53594` (main)  
**Deployed site:** https://thebabeldragon.github.io/BabelCodec/

## Executive summary

Image generation is **not missing**. It is implemented as a first-class **Generate** mode inside **Image Studio** (`data-tab="media"`). Offline providers (`mock`, `procedural`) work in the repository and are present in the deployed static assets.

What was incomplete relative to a “full product” integration:

1. No separately deployable **provider gateway** (credentials still only documented, not shipped).
2. No first-class **gateway client adapter** with explicit unconfigured messaging.
3. UI gaps: no full-size inspection lightbox, weak regeneration-from-history affordance, limited config surface.
4. Static asset cache-bust query still advertised `v=0.10.0` while `package.json` is `0.11.0`.
5. Documentation split across IMAGE_GENERATION / PROVIDERS / SECURITY without a single audit + setup path for operators.

This repair branch addresses those gaps without replacing the existing modular pipeline under `src/media/generation/`.

## Live deployment probe

| Asset | HTTP | Notes |
|-------|------|-------|
| `/BabelCodec/` | 200 | App shell loads |
| `src/ui/app.js` | 200 | Wires `createMediaLab` on `#media-root` |
| `src/ui/generation-ui.js` | 200 | Generate panel |
| `src/media/generation/index.js` | 200 | Public generation API |
| `src/media/generation/providers/procedural.js` | 200 | Offline deterministic provider |
| `src/ui/studio.css` | 200 | Includes `.gen-*` layout rules |

Conclusion: failure mode is **not** “tab absent from Pages.” Generate is nested under Image Studio.

## Navigation & mounting

| Layer | Location | Status |
|-------|----------|--------|
| Desktop tab | `index.html` → `data-tab="media"` → “Image Studio” | Present |
| Panel root | `#view-media` / `#media-root` | Present |
| App mount | `src/ui/app.js` → `createMediaLab` | Present |
| Mode chips | Create / Convert / Inspect / Batch / **Generate** | Present in `studio-ui.js` |
| Generate builder | `buildGeneratePanel` in `generation-ui.js` | Present |

**Root cause of “Image Gen feels broken” reports (when observed):**

- Users look for a top-level “Image Gen” tab; the feature is labeled **Image Studio → Generate**.
- Remote generation is intentionally unavailable without a self-hosted gateway; the UI could under-explain that.
- Cache-bust lag (`?v=0.10.0`) can leave older `app.js` in aggressive browser caches after merges.

Image Gen is **not** dependent on another lab tab initializing first. Media lab mounts independently when `#media-root` exists.

## Generation stack (already on main)

```
src/media/generation/
  capabilities.js      TPU capability registry (honest “none”)
  orchestrator.js      Job lifecycle + cancel
  job-store.js         In-memory jobs
  schemas.js           Request validation
  providers/
    registry.js
    mock.js            CI / solid PNG
    procedural.js      Offline seed-driven images
src/ui/generation-ui.js
src/ui/studio-ui.js    Mode shell
```

Automated media tests on main (executed during audit): **26/26 pass** including procedural determinism and SSTV manifest handoff.

## Security posture (pre-repair)

- No API keys in client bundles (verified by design + docs).
- Gateway pattern documented in `GENERATION_SECURITY.md` but **no server implementation in-repo**.
- Orchestrator enforces dimension / size limits.

## Repair plan

1. Document architecture/setup/API clearly (this audit + companion docs).
2. Ship `services/generation-gateway/` — Node HTTP gateway, env-based secrets, CORS allowlist, rate limit, validation; optional upstream provider URL.
3. Ship client `gateway` provider adapter (URL from runtime config only).
4. UI: config banner, regenerate, lightbox, clearer empty/error states.
5. Tests for navigation registration, gateway client validation, no-secret invariant.
6. Align cache-bust version strings with `0.11.0`.
7. Keep mock + procedural as default offline path; never require network for CI.

## Non-goals

- Do not invent paid cloud credentials.
- Do not merge Image Gen into encoding / Unicode / SHA-256 labs.
- Do not claim remote generation works on GitHub Pages alone.
