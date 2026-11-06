# BabelCodec

**Offline-first encoding, decoding, and byte/packet inspection workbench** for the [TheBabelDragon](https://github.com/TheBabelDragon) ecosystem.

**Live:** https://thebabeldragon.github.io/BabelCodec/

## Features

- **Converters** — Binary, Hex, Base64, Decimal, Octal, ASCII (strict), UTF-8, Morse
- **Hex Inspector** — virtualized hex grid, selection, search, jump-to-offset, export
- **Structure Analyzer** — signed/unsigned integers, IEEE-754 floats, explicit endianness, BigInt 64-bit
- **Packet Layouts** — user-defined field maps with overlap detection and JSON import/export
- **Zero runtime dependencies** — browser-native APIs only
- **Public JS API** — `src/api/babelcodec.js`

## Quick start

Open the GitHub Pages deployment, or serve the repo root as static files:

```bash
npx serve .
```

## Development

```bash
npm test
npm run build
npm run validate
```

## Security

See [docs/SECURITY.md](docs/SECURITY.md). All inspection is client-side; files are never uploaded.

## Documentation

- [API](docs/API.md)
- [Byte Inspector](docs/BYTE_INSPECTOR.md)
- [Structure Analyzer](docs/STRUCTURE_ANALYZER.md)
- [Packet Layouts](docs/PACKET_LAYOUTS.md)
- [Testing](docs/TESTING.md)

## License

MIT
