# Image Studio User Guide

## Workflow

**Describe → Create → Mutate → Compare → Select → Inspect → Export**

1. **Playground** (default)
   - Starters / Surprise Me → loads editable Create scene.
   - **Build artifact** from a natural-language prompt (local procedural scene, labeled `local_procedural`).
   - **Refine derivative** applies another instruction without claiming remote LLM generation.
   - **Mutation Lab** renders real pixel variations; select one and save as a registry asset.
   - **Asset history** lists registry entries; **Restore from IndexedDB** after reload.
   - **Send selected asset → Hex** transfers exact bytes to Hex Inspector.

2. **Create** — vector-style scene graph, export SVG/PNG/JPEG/WebP.
3. **Convert** — import, local edit (grayscale/flip/rotate/undo), export, suite handoffs.
4. **Inspect** — format/metadata/HEIF structure.
5. **Batch** — multi-file convert.
6. **Generate** — mock/procedural offline; optional gateway when configured.

## Offline guarantee

No API key is required. Models and remote providers are optional and disclosed when unavailable.
