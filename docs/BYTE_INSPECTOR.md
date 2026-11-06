# Byte Inspector

The Hex Inspector presents a conventional hex-editor layout over a `Uint8Array` source of truth.

## Layout

- **Offset column** — hexadecimal address of the row start
- **Hex cells** — one cell per byte, grouped (8-byte visual groups)
- **ASCII strip** — printable ASCII or `.` for non-printable

Bytes per row is configurable: **8 / 16 / 32**.

Large buffers use a **virtualized** viewport: only a window of rows is mounted in the DOM.

## Selection

- Click a byte to select it
- Shift-click to extend a range
- Arrow keys move the caret; Shift+arrows extend
- Selection never mutates the buffer
- Copy selection as hex, binary, Base64, or download raw bytes

## Navigation

Jump-to-offset accepts decimal (`16`) or hex (`0x10`, `10h`). Out-of-range values are rejected with a clear diagnostic.

## Search

Search operates on **bytes**, not a lossy text rendering:

| Mode  | Pattern interpretation      |
|-------|-----------------------------|
| Hex   | Hexadecimal byte pattern    |
| ASCII | Strict ASCII string → bytes |
| UTF-8 | UTF-8 encoding of the text  |

Empty patterns are rejected. Matches may overlap. Next/previous walk the match list.
