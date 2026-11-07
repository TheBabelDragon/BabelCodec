# CPU Assembler

Two-pass assembler (`assemble(source)`):

- Labels, `;` comments
- Mnemonics and `R0`–`R15`
- Decimal / `0x` hex immediates
- `LOAD/STORE rd, offset(rs)` syntax
- Line-mapped diagnostics

Example programs in `EXAMPLES`: arithmetic, loop, memory.
