# Unicode Foundation (0.10.0)

## Architecture

**Rust owns Unicode semantics.**  
**JavaScript owns browser integration, presentation, and I/O.**

There is exactly one implementation of:

- extended grapheme cluster segmentation (UAX #29)
- NFC / NFD / NFKC / NFKD
- XID_Start / XID_Continue
- Unicode Script property
- mixed-script detection
- combining-mark inspection

That implementation lives in `rust/unicode-core/` and is compiled to
`wasm32-unknown-unknown`. The previous JavaScript tables, `Intl.Segmenter`
path, and `String.normalize` path are no longer the canonical authority.

## Initialization

```js
import { initializeUnicodeCore, toCanonical } from 'babelcodec/text';

await initializeUnicodeCore();
const c = await toCanonical('בְּרֵאשִׁית');
```

A missing WASM engine produces a clear diagnostic. There is **no silent
fallback** to a second JavaScript Unicode implementation.

## UTF-16 boundary

JavaScript strings are sequences of UTF-16 code units and may contain
unpaired surrogates. Rust `String` cannot represent them.

The WASM interface therefore accepts a `Uint16Array` (or equivalent) of
UTF-16 code units. The lossless schema is:

```
babelcodec.utf16.v1
```

- Unpaired surrogates are **never** silently replaced.
- Invalid sequences produce explicit diagnostics.
- Original code units are preserved for reversible transport.

## Source vs analysis

Normalization never overwrites the original source string. The canonical
object always carries:

- `source` — original identity (text + code points + optional utf16 units)
- `analysis` — view after the requested normalization profile

Default normalization profile is `NONE`.

## Unicode data versions

Dependencies (crate versions at lock time):

- `unicode-ident` — XID tables
- `unicode-normalization` — NFC/NFD/NFKC/NFKD
- `unicode-segmentation` — UAX #29 extended grapheme clusters
- `unicode-script` — Script property

These crates ship their own data tables. Do not assume a single Unicode
standard revision across all of them without verifying the lockfile and
crate documentation.

## Building the WASM package

```bash
cd rust
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown -p unicode-core
wasm-bindgen --target web --out-dir ../pkg \
  target/wasm32-unknown-unknown/release/unicode_core.wasm
```

The `pkg/` directory is served as a static asset by GitHub Pages.

## Identifier semantics

XID classification follows the `unicode-ident` crate (XID_Start for the
first character, XID_Continue for the remainder).
