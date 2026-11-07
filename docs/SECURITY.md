# Security

## Threat model

BabelCodec is a **client-side** conversion and inspection tool.

- No server processes user data.
- No network requests are required for conversion or inspection.
- Files selected via the file picker never leave the browser (no upload).

## XSS and untrusted content

- All diagnostics, file names, search results, and inspector displays use `textContent` or explicit HTML escaping.
- The `esc()` helper encodes `& < > " '`.
- User-controlled strings are never passed to `innerHTML` as executable markup.
- Malformed or adversarial input is treated as data, not code. There is no `eval` and no dynamic code generation from input.

## Byte integrity

- Raw buffers are held as `Uint8Array`.
- The legacy "raw bytes via charCodeAt & 0xff" path was removed from the UI; raw input is accepted as **hex** only.
- Conversions must not silently truncate, reorder, or normalize arbitrary binary.
- Invalid UTF-8 remains inspectable as raw bytes.

## Limits

- UI soft-limits file reads to **8 MiB** to protect the tab from memory pressure.
- Malformed input produces errors; it is not executed.
- Object URLs created for downloads are revoked after use.

## Dependencies

Runtime: **zero** npm production dependencies. Uses browser/Node platform APIs only (`TextEncoder`, `TextDecoder`, `Uint8Array`, `DataView`, `File`, `Blob`).

## Supply chain

Static GitHub Pages deployment from this repository. Review Actions workflows before merging third-party PRs.

## Media Decoder (HEIC / HEIF)

- Structural inspection and optional pixel decode run entirely in the browser/worker.
- Original file bytes are never uploaded; they may be shared in-memory with the Hex Inspector.
- Box sizes and offsets are bounds-checked; extended (64-bit) sizes that exceed safe integer range are rejected.
- Embedded content (e.g. EXIF, item data) is treated as data only — never executed.
- Optional WASM pixel backends must be same-origin (or `blob:`) and are not loaded unless explicitly registered via `setHeifDecoderBackend`.
- Default file size limit matches the UI soft-limit (**8 MiB**), configurable via `options.maxBytes`.
