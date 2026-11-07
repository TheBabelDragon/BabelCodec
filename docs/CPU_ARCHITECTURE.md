# CPU Architecture (BabelCodec 0.6.0)

Educational **32-bit Harvard** CPU under `src/cpu/`.

## Resources

| Resource | Description |
|----------|-------------|
| R0–R15 | 32-bit GPRs; **R0 hardwired to 0** |
| PC | Program counter (instruction word index) |
| IR | Instruction register |
| Flags | Z (zero), N (negative), C (carry/borrow) |
| Program memory | 4096 × 32-bit instruction words |
| Data RAM | 64 KiB byte-addressed, little-endian, **word-aligned** load/store |

## Execution model

Clocked micro-states: `FETCH` → `DECODE` → `EXECUTE` → `FETCH` …

`stepInstruction()` runs one full instruction. `runUntilHalt()` clocks until `HALT` or error.

Separate from the SHA-256 gate machine; shares inspection concepts only.
