# BabelCodec

**Offline-first encoding, decoding, Unicode text lab (Rust WASM core), Morse blocks, Boolean logic, inspectable SHA-256 computer, and image generation workstation** for the [TheBabelDragon](https://github.com/TheBabelDragon) ecosystem.

**Live:** https://thebabeldragon.github.io/BabelCodec/

**Version:** 0.11.0

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
- **Text Lab** — Unicode canonical form via **Rust WASM Unicode Core**, Hebrew inspection, Morse blocks
- **Hardware observability** — live schematic, bit-level adder inspect, memory/bus explorers, rewind/replay
- **Image Studio** — Create graphics, convert PNG/JPEG/WebP/GIF/BMP/HEIF, inspect, batch; **Generate** images via provider-independent pipeline (offline **procedural** + mock by default)
- **Optional generation gateway** — separately deployable Node service for remote providers; **no API keys in the browser**
- **Signal Processor handoff** — Export PNG + versioned media-job manifest for SSTV encode in [signal-processor](https://github.com/TheBabelDragon/signal-processor)
- **Zero runtime dependencies** — browser-native APIs + static WASM assets (no remote runtime)
- **Public JS API** — `babelcodec`, `babelcodec/logic`, `babelcodec/sha256`, `babelcodec/computer`, `babelcodec/text`, `babelcodec/morse`, `babelcodec/scripts`, `babelcodec/media/generation`

## Unicode Core (0.10.0)

Rust owns Unicode semantics (graphemes UAX #29, NFC/NFD/NFKC/NFKD, XID, Script).  
JavaScript owns presentation and I/O. There is no competing JS Unicode implementation.

```js
import { initializeUnicodeCore, toCanonical } from 'babelcodec/text';

await initializeUnicodeCore();
const c = await toCanonical('בְּרֵאשִׁית');
```

See [docs/UNICODE_FOUNDATION.md](docs/UNICODE_FOUNDATION.md).

## Quick start

```bash
npx serve .
```

Open **Image Studio** → **Generate** for the image generation workstation (procedural + mock work fully offline). After a successful generate, use **Export SSTV handoff** to download PNG + `.job.json` for Signal Processor. Open **Text Lab** for Unicode/Hebrew/Morse, **Computer Lab** for SHA-256 hardware, or **CPU Lab** for assembly.

### Building the Unicode WASM package

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli
npm run build:wasm   # produces pkg/unicode_core.js + .wasm
```

CI builds and deploys these assets with GitHub Pages.

## Image generation

| Mode | Status |
|------|--------|
| Offline mock + procedural | **Working** on GitHub Pages |
| Image Studio → Generate UI | **Working** |
| SSTV handoff manifest | **Working** |
| Self-hosted gateway (synthetic or upstream) | **Working** when you deploy `services/generation-gateway` |
| Hosted multi-tenant cloud | Not provided |

Docs: [IMAGE_GEN_AUDIT.md](docs/IMAGE_GEN_AUDIT.md) · [IMAGE_GEN_ARCHITECTURE.md](docs/IMAGE_GEN_ARCHITECTURE.md) · [IMAGE_GEN_SETUP.md](docs/IMAGE_GEN_SETUP.md) · [IMAGE_GEN_API.md](docs/IMAGE_GEN_API.md) · [IMAGE_GENERATION.md](docs/IMAGE_GENERATION.md)

```bash
# Optional remote boundary (separate from Pages)
cd services/generation-gateway
export CORS_ORIGINS=https://thebabeldragon.github.io,http://127.0.0.1:5500
node server.js
# then in the browser: localStorage.setItem('babelcodec.gen.gatewayUrl', 'http://127.0.0.1:8787')
```

## Consumer imports

```js
import { sha256Hex, createSha256Machine } from 'babelcodec';
import { initializeUnicodeCore, toCanonical } from 'babelcodec/text';
import { encodeMorseDetailed, textToMorseBlock } from 'babelcodec/morse';
import { hebrewAdapter } from 'babelcodec/scripts';
import {
  ensureGenerationDefaults,
  submitGeneration,
  awaitJob,
  registerProvider,
  createProceduralProvider,
  getGatewayConfig,
} from 'babelcodec/media/generation';
```

## License

MIT
