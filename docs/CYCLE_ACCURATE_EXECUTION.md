# Cycle-Accurate Execution

`ExecutionScheduler` advances the **real** SHA-256 machine in bounded batches, recording **one history frame per `clock()`**.

- `stepCycle()` — one cycle + record
- `stepRoundWithHistory()` — all cycles through one compression round
- `run()` — async batches with pause/stop/breakpoint/watchpoint
- History truncation reported via `status().truncated`

Trace events remain descriptive; history frames are restorable state blobs.
