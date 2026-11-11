# Image Studio Binary Lab

Technical laboratory remains first-class.

- **Inspect** — format, metadata, HEIF structure when applicable.
- **Open in Hex / Structure / Converter / Logic** — exact byte handoff from Convert and Playground asset actions.
- **compareBytes(a,b)** — length, first difference, approximate changed count; does **not** claim pixel edit ↔ source offset after re-encode.
- Registry assets carry `contentHash` (SHA-256) and parent linkage for lineage inspection.
- Inspection never mutates stored source bytes; edits produce derivatives.
