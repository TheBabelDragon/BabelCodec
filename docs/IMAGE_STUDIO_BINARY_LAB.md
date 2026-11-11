# Image Studio Binary Lab

Technical laboratory remains first-class:

- **Inspect** mode — format, metadata, HEIF structure when applicable.
- **Open in Hex** / Structure / Converter / Logic — shared handoff.
- Original bytes are not rewritten during inspection.
- `compareBytes(a,b)` reports length and first difference; it does **not** claim a visual edit maps to a specific source byte range after re-encode.

Round-trip: export from Convert produces new encoded bytes; keep the original import for comparison.
