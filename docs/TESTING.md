# Testing

Node.js ≥ 18 built-in test runner. No test framework dependency.

```bash
node --test tests/**/*.test.js
# or
npm test
```

## Coverage areas

- **Binary:** all 256 values, leading zeros, empty, invalid bits, incomplete groups, whitespace
- **ASCII / UTF-8:** printable, controls, non-ASCII rejection, multibyte, invalid UTF-8, Unicode round-trips
- **Hex / decimal / octal / Base64 / Morse:** encode/decode and rejection paths
- **Cross-conversion:** binary↔hex, binary↔Base64, UTF-8↔binary, file-like buffers
- **Inspector:** offsets, control names, UTF-8 grouping
- **Large input:** 64 KiB hex round-trip

## Acceptance criterion

Byte-for-byte equality on reversible binary transforms (`bytesEqual`).

## CI

`.github/workflows/pages.yml` runs the full suite on push/PR before Pages deploy from `main`.
