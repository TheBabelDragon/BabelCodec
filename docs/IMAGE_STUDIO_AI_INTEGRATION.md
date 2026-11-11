# Image Studio AI Integration

## Architecture

| Capability | Default source | Notes |
|------------|----------------|-------|
| Intent interpretation | `local_heuristic` | `interpretIntent` |
| Design spec → scene | `local_procedural` | `promptToScene` |
| Refinement | `local_heuristic` + procedural rebuild | `refinePromptToScene` |
| Image generation inference | **unavailable** unless models bundled or gateway configured | `runImageInference` |
| Mutation | `local_procedural` pixel ops | no AI |

## Honesty policy

- Never label heuristic/procedural output as model-generated.
- Never put API secrets in the GitHub Pages bundle.
- Never auto-call paid endpoints.
- Capability discovery via `discoverIntelligenceCapabilities()`.

## Tests

See `tests/media/prompt-to-artifact.test.js` for unavailable / mock / failure paths.
