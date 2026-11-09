# Canonical Representation

Schema: `babelcodec.canonical.v1`

Immutable object produced by `await toCanonical(text, opts?)`.

## Fields

| Field | Meaning |
|-------|--------|
| `schema` | Always `babelcodec.canonical.v1` |
| `engine` | `rust-wasm` when the Unicode Core is active |
| `engineVersion` | Engine version string (e.g. `0.10.0`) |
| `source` | Original identity: `text`, `codepoints`, optional `utf16Units` |
| `analysis` | View after the requested normalization profile |
| `graphemes` | Extended grapheme clusters (UAX #29 via Rust) |
| `graphemeMethod` | Provenance of segmentation |
| `script` / `scripts` / `mixedScripts` | Script property classification |
| `normalization` | Profile applied (`NONE` by default) |
| `interpretations` | Caller-supplied annotations (never overwrite source) |
| `diagnostics` | Structured messages |

Interpretations never overwrite source identity. Default normalization is `NONE`.

Normalization changes appear only under `analysis`; `source.text` remains the original input.
