# Image Studio Functional Integration

**Base main SHA:** `a4b39b541dbfc2b5782fc5e50136a898161638fc`  
**Branch:** `feat/image-studio-functional-integration`

## Goal

Turn creative-lab scaffolding into real artifacts:

Describe → Create → Mutate → Compare → Select → Inspect → Export

without requiring TPU, LLM, or paid APIs.

## Implemented

### Shared assets (`src/media/assets/registry.js`)

- `restoreAll()` — load IndexedDB records into memory (memory wins on id collision).
- `persistOne` waits for transaction `oncomplete`.
- `lineage(id)` / `children(id)`.
- `sniffMimeType` — PNG/JPEG/WebP/GIF/SVG; avoids defaulting everything to octet-stream.
- Content hash via existing SHA-256 engine.
- Derivative deletion does **not** remove parent.

### Mutation Lab (`src/media/creative/mutation.js`)

- Expanded ops: brightness, contrast, saturation, hue, temperature, grayscale, flip, rotate90, blur, noise, scale.
- `renderMutationPlans(source, plans)` → real `ImageData` per plan.
- Source buffer is never mutated.
- Seeded plans remain reproducible.

### Prompt → Artifact

- `buildSceneFromSpec` / `promptToScene` / `refinePromptToScene`.
- Scenes are editable Create graphs labeled `local_procedural`.
- Interpretation remains `local_heuristic`.

### Intelligence adapter (`src/media/creative/intelligence.js`)

- Capability discovery; honest unavailable image-generation path.
- Optional `mockGenerate` for tests only.
- No secrets; no automatic remote calls.

### Playground UI

- Build artifact from prompt; refine derivatives.
- Mutation grid with real canvas thumbnails.
- Save mutation as registry asset; compare bytes; restore IDB; handoff to Hex.

## Tests

```bash
node --test tests/media/asset-registry.test.js tests/media/mutation-lab.test.js tests/media/prompt-to-artifact.test.js tests/media/creative-engine.test.js
npm test
```

## Limitations

- Hue/temperature use floating HSL paths (document as browser-float sensitive for cross-engine pixel identity).
- Mutation → Create does not replace the vector scene graph; applied mutations are raster assets in the registry (open Convert/Inspect).
- No bundled LLM/TPU weights; remote only via explicit generation gateway config.
- IndexedDB blocked environments run memory-only (restore returns `available: false`).

## Acceptance path (manual)

1. Playground → prompt → Build artifact → Create shows shapes.
2. Generate variations → select → Apply → asset appears in history.
3. Reload → Restore from IndexedDB → parent + derivative return.
4. Send asset → Hex with exact bytes.
5. All steps offline with models disabled.
