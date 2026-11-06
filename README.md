# BabelCodec

**Universal encoding & decoding workbench** for the BabelDragon ecosystem.

Offline-first. Browser-native. No backend. No silent truncation.

```
Text ⇄ Bytes ⇄ Binary / Hex / Base64 / Decimal / Octal
Text ⇄ Morse
Strict ASCII ≠ UTF-8
```

Live: [https://thebabeldragon.github.io/BabelCodec/](https://thebabeldragon.github.io/BabelCodec/)

## Features

- **Conversion engine** — binary, hex, Base64, decimal, octal, strict ASCII, UTF-8, Morse
- **Byte inspector** — offset, decimal, hex, binary, character, UTF-8 sequence analysis
- **File I/O** — local binary load/download via browser File APIs (never uploaded)
- **Strict validation** — incomplete bytes rejected; non-ASCII rejected in ASCII mode
- **Public JS API** — importable by other BabelDragon projects
- **Static GitHub Pages** — zero runtime dependencies

## Quick start

Open `index.html` locally or use the Pages deployment. All conversion runs in the browser.

```bash
# Tests (Node ≥ 18)
node --test tests/**/*.test.js

# Build verification
node scripts/build.js
```

## API (programmatic)

```js
import {
  convert,
  encodeHex,
  decodeBase64,
  encodeUtf8,
  inspectBytes,
  roundTrip,
} from './src/api/babelcodec.js';

const bytes = encodeUtf8('Hello');
const hex = encodeHex(bytes);           // "48656C6C6F"
const back = convert(hex, 'hex', 'bytes').output;
```

See [API.md](docs/API.md) and [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Formats

| Format     | Direction        | Notes                                      |
|------------|------------------|--------------------------------------------|
| Binary     | bytes ↔ string   | 8-bit groups; whitespace allowed           |
| Hex        | bytes ↔ string   | Leading zeros preserved; `0x` accepted     |
| Base64     | bytes ↔ string   | RFC 4648 with padding                      |
| Decimal    | bytes ↔ string   | Space-separated 0–255                      |
| Octal      | bytes ↔ string   | Space-separated                            |
| ASCII      | text ↔ bytes     | Strict 7-bit; rejects `> 0x7F`             |
| UTF-8      | text ↔ bytes     | Fatal decode by default                    |
| Morse      | text ↔ string    | ITU International                          |

Details: [CONVERSION_FORMATS.md](docs/CONVERSION_FORMATS.md)

## Ecosystem

Designed for future use by **ECUgate**, **CANtheon**, **REA**, and **Quack** — not a dependency of them.

## License

MIT · TheBabelDragon
