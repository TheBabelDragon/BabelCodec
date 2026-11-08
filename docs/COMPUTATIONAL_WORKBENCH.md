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

## Layout & lifecycle (labs)

Computer Lab, CPU Lab, and Text Lab share the same presentation rules:

- Each lab root (`.computer-lab`, `.cpu-lab`, `.text-lab`) is a column flex container with `min-height: 0` and internal scroll.
- View roots (`.computer-root`, `.cpu-root`, `.text-root`) fill the active `.view-panel` so nested overflow works.
- Computer Lab uses `.workbench-grid` (2-column → 1-column under 800px) and `.reg-grid` for registers.
- Hardware schematic (`.hw-layout`) stacks under 800px; SVG scales with `max-width: 100%`.
- Tab activation calls `refresh()` on Computer / CPU / Text when available; modules initialize once in `app.js`.
- Hidden panels use `[hidden] { display: none !important }` so inactive labs cannot overlay the active view.

Regression tests: `tests/ui/lab-layout.test.js` (DOM-mocked construction + refresh).

## Offline / security

All computation is local. No network, no telemetry, no upload of messages. DOM uses `textContent` / safe element construction only.
