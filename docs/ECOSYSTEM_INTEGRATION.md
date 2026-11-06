# Ecosystem Integration — BabelCodec Logic

**BabelCodec is the source of truth** for encoding, byte inspection, and reusable Boolean logic across TheBabelDragon ecosystem.

Consumer repositories **import** these capabilities. They must not maintain competing implementations.

No consumer repository was modified as part of the 0.3.0 work.

## CANtheon

```js
import { testBit, applyMask, xorBytes, diffBytes } from 'babelcodec/logic';
const faultActive = testBit(statusByte, 2, { width: 8 });
const maskedStatus = applyMask(statusByte, 0x0f, { width: 8, asNumber: true });
const difference = xorBytes(previousFrame, currentFrame);
```

## ECUgate

Analytical and **read-only**. Must not trigger ECU programming or actuator changes.

```js
import { testBit, diffBytes } from 'babelcodec/logic';
const dtcPresent = testBit(statusWord, 5, { width: 16 });
const imageDiff = diffBytes(snapshotA, snapshotB);
```

## REA / TensorGate / signal-processor / neuro-swarm

Use `applyMask`, `testBit`, `setBit`, `diffBytes`, `evaluateCircuit`, and width-aware bitwise ops for field extraction, circuit experiments, flag packing, and node-state masks.

## Import patterns

```js
import { xor, diffBytes, evaluateCircuit } from 'babelcodec/logic';
import BabelCodec from 'babelcodec';
BabelCodec.xor(0xff, 0x0f, { width: 8, asNumber: true });
```

Errors throw `ValidationError` with codes such as `INVALID_WIDTH`, `LENGTH_MISMATCH`, `CIRCUIT_CYCLE`, `MISSING_INPUT`.
