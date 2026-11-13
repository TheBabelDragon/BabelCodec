# Byte Inspector

The Hex Inspector presents a conventional hex-editor layout over a `Uint8Array` source of truth.

## Layout

- **Offset column** — hexadecimal address of the row start
- **Hex cells** — one cell per byte, grouped (8-byte visual groups)
- **ASCII strip** — printable ASCII or `.` for non-printable

Bytes per row is configurable: **8 / 16 / 32**.

Large buffers use a **virtualized** viewport: only a window of rows is mounted in the DOM.

## Buffer status

A status strip shows:

| Field | Meaning |
|-------|---------|
| Total | Full buffer length in bytes |
| Sel | Selection start–last inclusive, length, and exclusive end |
| Offset | Current caret / last-clicked byte (zero-based) |
| Width | Bytes per row |
| Matches | Current search match count |

Offsets are **zero-based**. Selection `end` is **exclusive**.

## Selection

- Click a byte to select it
- Shift-click to extend a range
- Arrow keys move the caret; Shift+arrows extend
- Selection never mutates the buffer

## Copy and download (scope is explicit)

| Action | Behaviour |
|--------|-----------|
| **Copy All Hex / Base64 / Binary** | Always encodes the **entire** buffer, even if a selection exists |
| **Copy Sel Hex / Base64 / Binary** | Encodes **only** the selected range; disabled when there is no selection |
| **Download All** | Raw `.bin` of the entire buffer |
| **Download Sel** | Raw `.bin` of the selected range only |

Filenames distinguish scope, e.g. `babelcodec-all-12b.bin` vs `babelcodec-sel-4-8-4b.bin`.

Clipboard writes use `navigator.clipboard` when available and fall back to a temporary textarea. Failures are reported honestly; success is never claimed without a successful write.

Leading and trailing zero bytes are preserved in every representation. Output is never silently truncated or capped.

## Navigation

Jump-to-offset accepts decimal (`16`) or hex (`0x10`, `10h`). Out-of-range values are rejected with a clear diagnostic.

## Search

Search operates on **bytes**, not a lossy text rendering:

| Mode  | Pattern interpretation      |
|-------|-----------------------------|
| Hex   | Hexadecimal byte pattern    |
| ASCII | Strict ASCII string → bytes |
| UTF-8 | UTF-8 encoding of the text  |

Empty patterns are rejected. Matches may overlap. Next/previous walk the match list. Clear search resets highlights.
