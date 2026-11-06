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

## Errors

`ConversionError`, `ValidationError`, `MalformedInputError`.

Offsets use inclusive start / exclusive end for ranges. Endianness is always explicit.
