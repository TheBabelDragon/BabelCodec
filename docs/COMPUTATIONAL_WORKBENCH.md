# Computational Workbench

BabelCodec 0.4.0 adds interactive SHA-256 and gate-level computer labs beside the existing converter, hex inspector, structure analyzer, and Logic Lab.

## Tabs

| Tab | Engine |
|-----|--------|
| Converter | Codecs |
| Hex Inspector | Byte grid |
| Structure & Layout | Typed fields |
| Logic Lab | Boolean / bitwise |
| SHA-256 Lab | Functional FIPS 180-4 |
| Computer Lab | Gate-level machine |

## Data handoffs

- Hex selection → Logic Lab operand A
- Hex selection → SHA-256 Lab
- SHA-256 Lab → Computer Lab (same message bytes)

Handoffs are explicit button actions; views do not share hidden mutable state.

## Offline / security

All computation is local. No network, no telemetry, no upload of messages. DOM uses `textContent` / safe element construction only.
