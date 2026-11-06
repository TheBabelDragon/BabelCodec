# Hardware Inspection

BabelCodec 0.5.0 introduces an architecture-neutral inspection layer under `src/computer/inspection/`.

## Principles

- Snapshots are **read-only** views of real machine state.
- The UI is an **observer and controller**, not a second implementation.
- Identifiers are stable strings (`reg.working.A`, `bus.T1`, `mem.W`, `ctrl`).
- SHA-256-specific naming lives in the **adapter** (`adapter-sha256.js`).

## Modules

| Module | Role |
|--------|------|
| `metadata.js` | Component catalog + extension points |
| `snapshot.js` | Immutable serializable snapshots |
| `signals.js` | Bit-level adder inspection, fidelity labels |
| `trace.js` | Bounded event stream |
| `history.js` | Full-state frames for rewind/replay |
| `adapter-sha256.js` | SHA-256 → inspection contract |

## Extension points (future CPU)

`EXTENSION_POINTS` includes: register-file, program-counter, instruction-register, alu, control-unit, ram, rom, address-bus, data-bus, control-signals, clock-source, execution-events, breakpoints, machine-snapshots.
