# Public API

Import from `src/api/babelcodec.js` (also exposed as `window.BabelCodec` in the browser).

## Conversion

- `convert(input, from, to, options?)`
- `encode*` / `decode*` for binary, hex, base64, ascii, utf8, decimal, octal, morse
- `listCodecs()`, `validate(input, format)`

## Inspection

- `inspectBytes(bytes, { mode })` — row-oriented byte table
- `buildHexGrid(bytes, { bytesPerRow, startOffset, endOffset })`
- `searchBytes(bytes, pattern, { mode, overlap, maxResults })`
- `findNext` / `findPrevious`
- `parseOffset(string, byteLength)`
- `selectionFromClick(offset, anchor, byteLength, extend)`
- `sliceSelection(bytes, selection)` — returns a **copy**

## Structure

- `interpretBytes(bytes, { offset, length, endian, types })`
- `validateLayout(layout, byteLength)`
- `decodeLayout(bytes, layout)`

## Text / Unicode (0.10.0+)

Import from `babelcodec/text`:

```js
import {
  initializeUnicodeCore,
  toCanonical,
  segmentGraphemes,
  applyNormalization,
  detectScripts,
  NormalizationProfile,
} from 'babelcodec/text';

await initializeUnicodeCore(); // required before Text Lab / canonical ops
const c = await toCanonical('בְּרֵאשִׁית');
```

- `initializeUnicodeCore()` — load the Rust WASM engine (fails closed if missing)
- `toCanonical(text, opts?)` → Promise of `babelcodec.canonical.v1`
- `segmentGraphemes(text)` → Promise of UAX #29 clusters
- `applyNormalization(text, profile)` → Promise (`NONE` | `NFC` | `NFD` | `NFKC` | `NFKD`)
- `detectScripts(text)` → Promise of script summary

Rust owns Unicode semantics. There is no silent JavaScript fallback.

## Errors

`ConversionError`, `ValidationError`, `MalformedInputError`.

Offsets use inclusive start / exclusive end for ranges. Endianness is always explicit.
