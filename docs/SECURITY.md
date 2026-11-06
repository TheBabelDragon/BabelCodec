# Security

## Threat model

BabelCodec is a **client-side** conversion tool.

- No server processes user data.
- No network requests are required for conversion.
- Files selected via the file picker never leave the browser (no upload).

## Limits

- UI soft-limits file reads to **8 MiB** to protect the tab from memory pressure.
- Malformed input produces errors; it is not executed.
- No `eval`, no dynamic code from user input.

## Dependencies

Runtime: **zero** npm production dependencies. Uses browser/Node platform APIs only (`TextEncoder`, `TextDecoder`, `Uint8Array`, `File`, `Blob`).

## Supply chain

Static GitHub Pages deployment from this repository. Review Actions workflows before merging third-party PRs.
