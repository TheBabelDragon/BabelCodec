# BabelCodec Logic Engine

Version **0.3.0**

BabelCodec is the canonical Boolean and byte-logic provider for TheBabelDragon ecosystem.

The logic engine is pure JavaScript (ES modules), zero runtime dependencies, and runs identically in Node.js and the browser.

## Modules

| Module | Path | Responsibility |
|--------|------|----------------|
| Gates | `src/logic/gates.js` | AND, OR, XOR, NOT, NAND, NOR, XNOR + truth tables |
| Bitwise | `src/logic/bitwise.js` | Width-aware integer ops (1–64 bits, BigInt) |
| Masks | `src/logic/masks.js` | applyMask, testBit, setBit, clearBit, toggleBit |
| Shifts | `src/logic/shifts.js` | leftShift, rightShift (logical / arithmetic) |
| Buffers | `src/logic/buffers.js` | Byte-wise ops + `diffBytes` |
| Circuits | `src/logic/circuits.js` | Serializable circuit evaluator |

Public entry: `src/logic/index.js`  
Package subpath: `babelcodec/logic`

## Quick examples

### Status bit check

```js
import { testBit, applyMask } from 'babelcodec/logic';

const statusByte = 0b00000100;
const faultActive = testBit(statusByte, 2, { width: 8 }); // true
const masked = applyMask(statusByte, 0x0f, { width: 8, asNumber: true }); // 4
```

### Compare two buffers

```js
import { xorBytes, diffBytes } from 'babelcodec/logic';

const prev = new Uint8Array([0x00, 0xaa]);
const curr = new Uint8Array([0x01, 0xaa]);
const xor = xorBytes(prev, curr);
const diff = diffBytes(prev, curr);
// prev XOR diff.difference === curr
```

### Circuit evaluation

```js
import { evaluateCircuit } from 'babelcodec/logic';

const halfAdder = {
  inputs: ['A', 'B'],
  nodes: [
    { id: 'xor1', gate: 'XOR', inputs: ['A', 'B'] },
    { id: 'and1', gate: 'AND', inputs: ['A', 'B'] },
  ],
  outputs: { sum: 'xor1', carry: 'and1' },
};

const { outputs } = evaluateCircuit(halfAdder, { A: true, B: true });
// outputs.sum === false, outputs.carry === true
```

## Width and signedness

- All integer ops take `{ width }` (default 32). Supported range: **1–64**.
- Results are **unsigned** and **masked** to the selected width.
- Negative inputs wrap via two’s complement into the width.
- Use `asSigned(value, width)` for signed interpretation.
- `{ asNumber: true }` returns a JS `number` only when `width ≤ 53`.

## Non-mutation

Buffer ops always return **new** `Uint8Array` instances. Caller-owned inputs are never modified.
