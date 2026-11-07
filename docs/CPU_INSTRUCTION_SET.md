# CPU Instruction Set

32-bit fixed encoding: `[31:24] opcode`.

| Mnemonic | Opcode | Format | Semantics |
|----------|--------|--------|-----------|
| NOP | 0x00 | N | No operation |
| MOVI | 0x01 | I | `rd ← imm12` (signed) |
| MOV | 0x02 | R | `rd ← rs` |
| ADD | 0x03 | R | `rd ← rs + rt` (mod 2³²), C/Z/N |
| SUB | 0x04 | R | `rd ← rs − rt`, C = no borrow |
| AND/OR/XOR | 0x05–07 | R | Bitwise |
| SHL/SHR | 0x08–09 | R | Logical shift by `rt & 31` |
| LOAD | 0x0a | I | `rd ← mem[rs+imm]` aligned word |
| STORE | 0x0b | I | `mem[rs+imm] ← rd` |
| CMP | 0x0c | R | Flags from `rs − rt` |
| JMP | 0x0d | J | `pc ← pc + offset24` |
| JZ/JNZ | 0x0e/0f | J | Conditional relative branch |
| HALT | 0xff | N | Stop |

See `src/cpu/opcodes.js` for encode/decode.
