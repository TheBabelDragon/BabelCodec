/**
 * BabelCodec educational CPU — fixed 32-bit instruction encodings.
 *
 * Format:
 *   [31:24] opcode
 *   R-format: [23:20] rd, [19:16] rs, [15:12] rt, [11:0] reserved
 *   I-format: [23:20] rd, [19:16] rs, [15:0] imm12 (signed in low 12 bits)
 *   J-format: [23:0] signed 24-bit relative word offset
 */

export const OP = Object.freeze({
  NOP: 0x00,
  MOVI: 0x01,
  MOV: 0x02,
  ADD: 0x03,
  SUB: 0x04,
  AND: 0x05,
  OR: 0x06,
  XOR: 0x07,
  SHL: 0x08,
  SHR: 0x09,
  LOAD: 0x0a,
  STORE: 0x0b,
  CMP: 0x0c,
  JMP: 0x0d,
  JZ: 0x0e,
  JNZ: 0x0f,
  HALT: 0xff,
});

export const OP_NAME = Object.freeze(
  Object.fromEntries(Object.entries(OP).map(([k, v]) => [v, k])),
);

export const OP_FMT = Object.freeze({
  [OP.NOP]: 'N',
  [OP.MOVI]: 'I',
  [OP.MOV]: 'R',
  [OP.ADD]: 'R',
  [OP.SUB]: 'R',
  [OP.AND]: 'R',
  [OP.OR]: 'R',
  [OP.XOR]: 'R',
  [OP.SHL]: 'R',
  [OP.SHR]: 'R',
  [OP.LOAD]: 'I',
  [OP.STORE]: 'I',
  [OP.CMP]: 'R',
  [OP.JMP]: 'J',
  [OP.JZ]: 'J',
  [OP.JNZ]: 'J',
  [OP.HALT]: 'N',
});

const MASK32 = 0xffffffffn;

export function encodeR(opcode, rd, rs, rt) {
  return (
    ((opcode & 0xff) << 24) |
    ((rd & 0xf) << 20) |
    ((rs & 0xf) << 16) |
    ((rt & 0xf) << 12)
  ) >>> 0;
}

export function encodeI(opcode, rd, rs, imm12) {
  const imm = (imm12 << 20) >> 20;
  const u = imm & 0xfff;
  return (
    ((opcode & 0xff) << 24) |
    ((rd & 0xf) << 20) |
    ((rs & 0xf) << 16) |
    u
  ) >>> 0;
}

export function encodeJ(opcode, offset24) {
  const off = (offset24 << 8) >> 8;
  return (((opcode & 0xff) << 24) | (off & 0xffffff)) >>> 0;
}

export function encodeN(opcode) {
  return ((opcode & 0xff) << 24) >>> 0;
}

export function decode(word) {
  const w = word >>> 0;
  const opcode = (w >>> 24) & 0xff;
  const name = OP_NAME[opcode] || `UNK_${opcode.toString(16)}`;
  const fmt = OP_FMT[opcode] || 'N';
  const rd = (w >>> 20) & 0xf;
  const rs = (w >>> 16) & 0xf;
  const rt = (w >>> 12) & 0xf;
  let imm = w & 0xfff;
  if (imm & 0x800) imm |= ~0xfff;
  let offset = w & 0xffffff;
  if (offset & 0x800000) offset |= ~0xffffff;
  return { opcode, name, fmt, rd, rs, rt, imm, offset, word: w };
}

export { MASK32 };
