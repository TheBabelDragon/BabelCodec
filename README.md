# BabelCodec

**Offline-first encoding, decoding, Unicode text lab, Morse blocks, Boolean logic, and inspectable SHA-256 computer** for the [TheBabelDragon](https://github.com/TheBabelDragon) ecosystem.

**Live:** https://thebabeldragon.github.io/BabelCodec/

**Version:** 0.9.0

## Features

- **Converters** — Binary, Hex, Base64, Decimal, Octal, ASCII (strict), UTF-8, Morse
- **Hex Inspector** — virtualized hex grid, selection, search, jump-to-offset, export
- **Structure Analyzer** — signed/unsigned integers, IEEE-754 floats, endianness, BigInt 64-bit
- **Packet Layouts** — field maps with overlap detection and JSON import/export
- **Logic Engine** — Boolean gates, width-aware bitwise ops (1–64 bits), masks/shifts, circuits
- **Logic Lab** — gate simulator, byte workbench, XOR difference inspector
- **SHA-256 Lab** — functional FIPS 180-4 engine with padding/schedule/round inspection
- **Computer Lab** — clocked gate-level SHA-256 machine (full adders, registers, stepable rounds)
- **CPU Lab** — educational 32-bit Harvard CPU with assembler
- **Text Lab** — Unicode canonical form, Hebrew inspection, Morse blocks
- **Hardware observability** — live schematic, bit-level adder inspect, memory/bus explorers, rewind/replay
- **Media Decoder** — HEIC/HEIF structural inspection, optional pixel decode, PNG/JPEG/WebP export
- **Zero runtime dependencies** — browser-native APIs only (optional WASM HEIF backend is pluggable)
- **Public JS API** — `babelcodec`, `babelcodec/logic`, `babelcodec/sha256`, `babelcodec/computer`, `babelcodec/text`, `babelcodec/morse`, `babelcodec/scripts`

## Quick start

```bash
npx serve .
```

Open **Text Lab** for Unicode/Hebrew/Morse, **Computer Lab** for SHA-256 hardware, or **CPU Lab** for assembly.

## Consumer imports

```js
import { sha256Hex, createSha256Machine } from 'babelcodec';
import { toCanonical } from 'babelcodec/text';
import { encodeMorseDetailed, textToMorseBlock } from 'babelcodec/morse';
import { hebrewAdapter } from 'babelcodec/scripts';
```

## Development

```bash
npm test
npm run test:text
npm run build
npm run validate
```

## Documentation

- [Unicode Foundation](docs/UNICODE_FOUNDATION.md)
- [Canonical Representation](docs/CANONICAL_REPRESENTATION.md)
- [Morse Blocks](docs/MORSE_BLOCKS.md)
- [Hebrew Processing](docs/HEBREW_PROCESSING.md)
- [Script Adapters](docs/SCRIPT_ADAPTERS.md)
- [API](docs/API.md)
- [SHA-256 Engine](docs/SHA256_ENGINE.md)
- [Computer Architecture](docs/COMPUTER_ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [HEIF / HEIC Decoder](docs/HEIF_DECODER.md)

## Security

All computation is local. No network, no telemetry, no upload of messages. See [docs/SECURITY.md](docs/SECURITY.md).

## License

MIT
