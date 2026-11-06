# BabelCodec

**Offline-first encoding, decoding, byte/packet inspection, Boolean logic, and inspectable SHA-256 computer** for the [TheBabelDragon](https://github.com/TheBabelDragon) ecosystem.

**Live:** https://thebabeldragon.github.io/BabelCodec/

**Version:** 0.4.0

## Features

- **Converters** — Binary, Hex, Base64, Decimal, Octal, ASCII (strict), UTF-8, Morse
- **Hex Inspector** — virtualized hex grid, selection, search, jump-to-offset, export
- **Structure Analyzer** — signed/unsigned integers, IEEE-754 floats, endianness, BigInt 64-bit
- **Packet Layouts** — field maps with overlap detection and JSON import/export
- **Logic Engine** — Boolean gates, width-aware bitwise ops (1–64 bits), masks/shifts, circuits
- **Logic Lab** — gate simulator, byte workbench, XOR difference inspector
- **SHA-256 Lab** — functional FIPS 180-4 engine with padding/schedule/round inspection
- **Computer Lab** — clocked gate-level SHA-256 machine (full adders, registers, stepable rounds)
- **Zero runtime dependencies** — browser-native APIs only
- **Public JS API** — `babelcodec`, `babelcodec/logic`, `babelcodec/sha256`, `babelcodec/computer`

## Quick start

```bash
npx serve .
```

Open the app, switch to **SHA-256 Lab** or **Computer Lab**, enter a message, and inspect digests, padding, schedule, and (in Computer Lab) register/datapath state under manual or automatic clocking.

## Consumer imports

```js
import { sha256Hex, createSha256Machine } from 'babelcodec';

console.log(sha256Hex('abc'));
// ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad

const m = createSha256Machine();
m.loadMessage('abc');
m.runUntilComplete();
console.log(m.getDigestHex()); // same digest via gate-level path
```

Subpath imports:

```js
import { sha256Hex, padMessage, compressBlock } from 'babelcodec/sha256';
import { createSha256Machine, fullAdder, add32Ripple } from 'babelcodec/computer';
```

## Development

```bash
npm test
npm run test:sha256
npm run test:computer
npm run build
npm run validate
```

## Documentation

- [API](docs/API.md)
- [SHA-256 Engine](docs/SHA256_ENGINE.md)
- [Computer Architecture](docs/COMPUTER_ARCHITECTURE.md)
- [Computational Workbench](docs/COMPUTATIONAL_WORKBENCH.md)
- [Logic Engine](docs/LOGIC_ENGINE.md)
- [Ecosystem Integration](docs/ECOSYSTEM_INTEGRATION.md)
- [Security](docs/SECURITY.md)

## Security

All computation is local. No network, no telemetry, no upload of messages. See [docs/SECURITY.md](docs/SECURITY.md).

## License

MIT
