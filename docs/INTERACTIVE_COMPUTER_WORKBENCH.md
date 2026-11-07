# Interactive Computer Workbench (0.8.0)

Architecture-neutral contract (`src/computer/architecture/`), interaction layer with mutation audit (`src/computer/interaction/`), branching history (`src/computer/history/`), and UI controls in Computer Lab.

All mutations operate on the real SHA-256 machine or CPU. Protected regions (K constants, R0) reject writes without side effects.
