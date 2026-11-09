# BabelCodec

**Offline-first encoding, decoding, Unicode text lab, Morse blocks, Boolean logic, inspectable SHA-256 computer, and image generation workstation** for the [TheBabelDragon](https://github.com/TheBabelDragon) ecosystem.

**Live:** https://thebabeldragon.github.io/BabelCodec/

**Version:** 0.9.3

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
- **Image Studio** — Create graphics, convert PNG/JPEG/WebP/GIF/BMP/HEIF, inspect, batch; **Generate** images via provider-independent pipeline (offline mock by default)
- **Signal Processor handoff** — Export PNG + versioned media-job manifest for SSTV encode in [signal-processor](https://github.com/TheBabelDragon/signal-processor)
- **Zero runtime dependencies** — browser-native APIs only (optional WASM HEIF backend is pluggable)
- **Public JS API** — `babelcodec`, `babelcodec/logic`, `babelcodec/sha256`, `babelcodec/computer`, `babelcodec/text`, `babelcodec/morse`, `babelcodec/scripts`, `babelcodec/media/generation`

## Quick start

```bash
npx serve .
```

Open **Media** → **Generate** for the image generation workstation (mock provider works offline). After a successful generate, use **Export SSTV handoff** to download PNG + `.job.json` for Signal Processor. Open **Text Lab** for Unicode/Hebrew/Morse, **Computer Lab** for SHA-256 hardware, or **CPU Lab** for assembly.

## Consumer imports

```js
import { sha256Hex, createSha256Machine } from 'babelcodec';
import { toCanonical } from 'babelcodec/text';
import { encodeMorseDetailed, textToMorseBlock } from 'babelcodec/morse';
import { hebrewAdapter } from 'babelcodec/scripts';
import {
  ensureGenerationDefaults,
  submitGeneration,
  awaitJob,
  registerProvider,
} from 'babelcodec/media/generation';
import {
  createImageToSstvManifest,
  exportSstvHandoff,
  validateMediaJobManifest,
} from './src/media/integrations/index.js';
```

## Image generation

Provider-independent pipeline with optional TPU assist:

- Mock provider for offline / CI
- Explicit TPU backend registration (never inferred from browser APIs)
- Job lifecycle, provenance, Image Studio ingestion

See [docs/IMAGE_GENERATION.md](docs/IMAGE_GENERATION.md), [docs/GENERATION_SECURITY.md](docs/GENERATION_SECURITY.md).

## Signal Processor integration

File-based contract only (`contract_version: 1`). No shared origin or runtime module dependency.

1. Generate or import an image in BabelCodec
2. **Export SSTV handoff** → PNG + `.job.json`
3. In [Signal Processor](https://github.com/TheBabelDragon/signal-processor) SSTV panel: load image → encode Martin M1 or Robot 36 → WAV
4. Decode Martin M1 WAV → reconstructed PNG → re-import to BabelCodec Inspect if desired

Schema: [schemas/media/signal-processor-job.v1.schema.json](schemas/media/signal-processor-job.v1.schema.json)  
Docs: [docs/integrations/SIGNAL_PROCESSOR.md](docs/integrations/SIGNAL_PROCESSOR.md)

## Development

```bash
npm test
npm run test:text
npm run test:media
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
- [Image Studio](docs/IMAGE_STUDIO.md)
- [Image Generation](docs/IMAGE_GENERATION.md)
- [Generation Security](docs/GENERATION_SECURITY.md)
- [TPU Backends](docs/TPU_BACKENDS.md)
- [Generation Providers](docs/GENERATION_PROVIDERS.md)
- [Signal Processor integration](docs/integrations/SIGNAL_PROCESSOR.md)

## Security

All core computation is local. No network, no telemetry, no upload of messages by default. Remote image providers are opt-in via explicit registration and must use a gateway you control — never embed API keys in the client. See [docs/SECURITY.md](docs/SECURITY.md) and [docs/GENERATION_SECURITY.md](docs/GENERATION_SECURITY.md).

## License

MIT
