# Gate-Level SHA-256 Computer

Clocked datapath under `src/computer/`. Modular addition uses **only** the ripple-carry full-adder chain.

## Hierarchy

1. Boolean gates (`AND`, `OR`, `XOR`, …)
2. 1-bit full adder
3. 32-bit ripple-carry adder (`add32Ripple`)
4. Registers (`Register32` / `RegisterBank`) with staged commit
5. Buses and word memory (W, K, H)
6. Datapath round (`datapathRound`)
7. Controller states and `Sha256Machine`

## Machine states

`IDLE` → `LOAD_BLOCK` → `PREPARE_SCHEDULE` → `INITIALIZE_REGISTERS` → `EXECUTE_ROUND` (×64) → `ACCUMULATE_STATE` → `NEXT_BLOCK` → `COMPLETE` | `ERROR`

## Control API

```js
import { createSha256Machine } from 'babelcodec/computer';

const m = createSha256Machine();
m.loadMessage('abc');
m.clock();          // one controller cycle
m.stepRound();      // advance one compression round
m.runUntilComplete();
console.log(m.getDigestHex());
```

## UI

**Computer Lab** drives the real machine: load, clock, step round, run, pause, auto-clock, register/bus/trace inspection.
