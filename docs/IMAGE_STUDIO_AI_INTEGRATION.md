# Image Studio AI Integration

## What exists

| Layer | Behavior |
|-------|----------|
| TPU registry | `discoverTpuCapabilities` — may return empty / unavailable |
| Gateway provider | Only when URL configured; secrets never in Pages bundle |
| Creative intent | **Local heuristic** only in this milestone |

## What does not exist yet

- Bundled LLM weights
- Automatic remote chat completion for design
- Claiming “AI generated” for heuristic or procedural results

## Policy

Operations must be labeled local procedural / heuristic, local model inference, or remote (gateway). If unavailable, Create, Playground, Convert, Inspect, Batch, and offline Generate continue to work.
