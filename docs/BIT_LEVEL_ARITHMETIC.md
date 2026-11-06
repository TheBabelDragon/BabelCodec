# Bit-Level Arithmetic

## Gate-expanded

**32-bit modular addition** (`add32Ripple` / `dpAdd`) is built from 1-bit full adders. `inspectAdd32(a, b)` returns per-bit stages including generate/propagate.

## Behavioral / direct

Ch, Maj, Σ/σ, ROTR, SHR use JS bitwise / BigInt and are labeled in `OPERATION_FIDELITY` as `behavioral` or `direct` — not claimed as physical gate networks.
