# Image Studio Creative Engine

## Local-first

All Playground starters, intent interpretation, and mutation **plans** run offline with zero network.

## Intent

`interpretCreativeIntent(prompt)` returns a `DesignSpec` with `interpretationSource: 'local_heuristic'`.
This is **not** remote LLM output. Summary strings always say so.

## Starters

Each starter builds a real `scene` via `createScene` / `addObject` and loads into **Create** for editing and export (SVG/PNG/…).

## Mutation Lab

`planMutations(seed, count)` is deterministic for a given seed.  
`applyMutationOps(imageData, ops)` applies brightness/contrast/grayscale/flip/rotate via existing edit ops.

## Generate tab

Existing mock + procedural + optional gateway unchanged.
