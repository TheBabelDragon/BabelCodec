# BabelCodec

**Offline-first encoding, decoding, byte/packet inspection, and Boolean logic workbench** for the [TheBabelDragon](https://github.com/TheBabelDragon) ecosystem.

**Live:** https://thebabeldragon.github.io/BabelCodec/

**Version:** 0.3.0

## Features

- **Converters** — Binary, Hex, Base64, Decimal, Octal, ASCII (strict), UTF-8, Morse
- **Hex Inspector** — virtualized hex grid, selection, search, jump-to-offset, export
- **Structure Analyzer** — signed/unsigned integers, IEEE-754 floats, explicit endianness, BigInt 64-bit
- **Packet Layouts** — user-defined field maps with overlap detection and JSON import/export
- **Logic Engine** — Boolean gates, width-aware bitwise ops (1–64 bits), masks/shifts, byte ops, circuit evaluator
- **Logic Lab** — interactive gate simulator, byte workbench, XOR difference inspector
- **Zero runtime dependencies** — browser-native APIs only
- **Public JS API** — `src/api/babelcodec.js` and `babelcodec/logic` subpath

## Logic engine (consumer import)

```js
import {
  testBit, applyMask, xorBytes, diffBytes, evaluateCircuit,
} from 'babelcodec/logic';

const fault = testBit(statusByte, 2, { width: 8 });
const masked = applyMask(statusByte, 0x0f, { width: 8, asNumber: true });
const delta = diffBytes(previousFrame, currentFrame);
```

See [docs/LOGIC_ENGINE.md](docs/LOGIC_ENGINE.md) and [docs/ECOSYSTEM_INTEGRATION.md](docs/ECOSYSTEM_INTEGRATION.md).

## Development

```bash
npm test
npm run test:logic
npm run build
npm run validate
```

## Security

See [docs/SECURITY.md](docs/SECURITY.md). All inspection and logic runs client-side; files are never uploaded.

## Documentation

- [API](docs/API.md)
- [Logic Engine](docs/LOGIC_ENGINE.md)
- [Ecosystem Integration](docs/ECOSYSTEM_INTEGRATION.md)
- [Byte Inspector](docs/BYTE_INSPECTOR.md)
- [Structure Analyzer](docs/STRUCTURE_ANALYZER.md)
- [Packet Layouts](docs/PACKET_LAYOUTS.md)
- [Testing](docs/TESTING.md)

## License

MIT
