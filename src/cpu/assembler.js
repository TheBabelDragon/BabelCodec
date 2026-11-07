/**
 * Two-pass assembler for BabelCodec educational CPU.
 */

import { OP, OP_FMT, encodeR, encodeI, encodeJ, encodeN } from './opcodes.js';

export function assemble(source) {
  const errors = [];
  const lines = source.split(/\r?\n/);
  const parsed = [];
  const labels = Object.create(null);

  let addr = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let raw = lines[i];
    const comment = raw.indexOf(';');
    if (comment >= 0) raw = raw.slice(0, comment);
    raw = raw.trim();
    if (!raw) continue;

    let label = null;
    let rest = raw;
    const colon = raw.indexOf(':');
    if (colon >= 0) {
      label = raw.slice(0, colon).trim();
      rest = raw.slice(colon + 1).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(label)) {
        errors.push({ line: lineNo, message: 'Invalid label', token: label });
      } else if (labels[label] != null) {
        errors.push({ line: lineNo, message: 'Duplicate label', token: label });
      } else {
        labels[label] = addr;
      }
    }
    if (!rest) {
      parsed.push({ line: lineNo, label, mnemonic: null, args: [], raw: lines[i] });
      continue;
    }
    const parts = rest.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
    const mnemonic = parts[0].toUpperCase();
    const args = parts.slice(1);
    parsed.push({ line: lineNo, label, mnemonic, args, raw: lines[i] });
    addr += 1;
  }

  const words = [];
  const listing = [];
  addr = 0;

  for (const p of parsed) {
    if (!p.mnemonic) continue;
    const op = OP[p.mnemonic];
    if (op == null) {
      errors.push({ line: p.line, message: `Unknown mnemonic ${p.mnemonic}`, token: p.mnemonic });
      words.push(0);
      addr += 1;
      continue;
    }
    const fmt = OP_FMT[op];
    let word = 0;
    try {
      if (fmt === 'N') {
        word = encodeN(op);
      } else if (fmt === 'R') {
        if (p.mnemonic === 'CMP') {
          const rs = parseReg(p.args[0], p.line, errors);
          const rt = parseReg(p.args[1], p.line, errors);
          word = encodeR(op, 0, rs, rt);
        } else if (p.mnemonic === 'MOV') {
          const rd = parseReg(p.args[0], p.line, errors);
          const rs = parseReg(p.args[1], p.line, errors);
          word = encodeR(op, rd, rs, 0);
        } else {
          const rd = parseReg(p.args[0], p.line, errors);
          const rs = parseReg(p.args[1], p.line, errors);
          const rt = parseReg(p.args[2], p.line, errors);
          word = encodeR(op, rd, rs, rt);
        }
      } else if (fmt === 'I') {
        if (p.mnemonic === 'MOVI') {
          const rd = parseReg(p.args[0], p.line, errors);
          const imm = parseImm(p.args[1], p.line, errors, labels, addr);
          word = encodeI(op, rd, 0, imm);
        } else if (p.mnemonic === 'LOAD' || p.mnemonic === 'STORE') {
          const rd = parseReg(p.args[0], p.line, errors);
          let rs = 0;
          let imm = 0;
          if (p.args[1] && p.args[1].includes('(')) {
            const m = p.args[1].match(/^(-?(?:0x[0-9a-fA-F]+|\d+))\(([Rr]\d+)\)$/);
            if (!m) {
              errors.push({ line: p.line, message: 'Expected offset(Rs)', token: p.args[1] });
            } else {
              imm = parseImm(m[1], p.line, errors, labels, addr);
              rs = parseReg(m[2], p.line, errors);
            }
          } else {
            rs = parseReg(p.args[1], p.line, errors);
            imm = parseImm(p.args[2] || '0', p.line, errors, labels, addr);
          }
          word = encodeI(op, rd, rs, imm);
        } else {
          errors.push({ line: p.line, message: `Unhandled I-format ${p.mnemonic}` });
        }
      } else if (fmt === 'J') {
        const target = p.args[0];
        let offset = 0;
        if (target != null && labels[target] != null) {
          offset = labels[target] - addr;
        } else {
          offset = parseImm(target, p.line, errors, labels, addr);
        }
        if (offset < -0x800000 || offset > 0x7fffff) {
          errors.push({ line: p.line, message: 'Branch offset out of 24-bit range', token: String(target) });
        }
        word = encodeJ(op, offset);
      }
    } catch (e) {
      errors.push({ line: p.line, message: e.message || String(e) });
    }
    words.push(word >>> 0);
    listing.push({
      address: addr,
      line: p.line,
      source: p.raw.trim(),
      word: word >>> 0,
      text: `${addr.toString(16).padStart(4, '0')}: ${(word >>> 0).toString(16).padStart(8, '0')}  ${p.mnemonic}`,
    });
    addr += 1;
  }

  return { ok: errors.length === 0, words, listing, labels, errors };
}

function parseReg(tok, line, errors) {
  if (tok == null) {
    errors.push({ line, message: 'Missing register' });
    return 0;
  }
  const m = String(tok).match(/^[Rr](\d+)$/);
  if (!m) {
    errors.push({ line, message: 'Invalid register', token: tok });
    return 0;
  }
  const n = Number(m[1]);
  if (n < 0 || n > 15) {
    errors.push({ line, message: 'Register out of range R0–R15', token: tok });
    return 0;
  }
  return n;
}

function parseImm(tok, line, errors, labels, addr) {
  if (tok == null) {
    errors.push({ line, message: 'Missing immediate' });
    return 0;
  }
  const s = String(tok);
  if (labels[s] != null) return labels[s] - addr;
  if (/^-?0x[0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  errors.push({ line, message: 'Invalid immediate or label', token: tok });
  return 0;
}

export const EXAMPLES = {
  arithmetic: `; Arithmetic: R1 = 10 + 32\n      MOVI R1, 10\n      MOVI R2, 32\n      ADD  R3, R1, R2\n      HALT\n`,
  loop: `; Loop: sum 1..5 into R3\n      MOVI R1, 1\n      MOVI R2, 5\n      MOVI R3, 0\nloop: ADD  R3, R3, R1\n      CMP  R1, R2\n      JZ   done\n      MOVI R4, 1\n      ADD  R1, R1, R4\n      JMP  loop\ndone: HALT\n`,
  memory: `; Memory: store 0x123 at address 16, load back\n      MOVI R1, 16\n      MOVI R2, 0x123\n      STORE R2, 0(R1)\n      LOAD  R3, 0(R1)\n      HALT\n`,
};
