/**
 * Character / byte inspector.
 */

import { analyzeUtf8 } from './utf8.js';
import {
  byteToBinary,
  byteToHex,
  controlCharName,
  displayByte,
  isPrintableAscii,
  toUint8Array,
} from './utils.js';

export function inspectBytes(bytes, opts = {}) {
  const data = toUint8Array(bytes);
  const mode = opts.mode || 'byte';
  const rows = [];

  let utf8Valid = null;
  let seqMap = null;

  if (mode === 'utf8') {
    const analysis = analyzeUtf8(data);
    utf8Valid = analysis.valid;
    seqMap = new Map();
    for (let gi = 0; gi < analysis.sequences.length; gi++) {
      const seq = analysis.sequences[gi];
      for (let j = 0; j < seq.length; j++) {
        seqMap.set(seq.offset + j, {
          group: gi,
          char: seq.char,
          error: seq.error,
          isLead: j === 0,
          seqLength: seq.length,
        });
      }
    }
  }

  for (let i = 0; i < data.length; i++) {
    const b = data[i];
    const row = {
      offset: i,
      decimal: b,
      hex: byteToHex(b),
      binary: byteToBinary(b),
      display: displayByte(b),
      printable: isPrintableAscii(b),
      control: controlCharName(b),
    };

    if (seqMap) {
      const info = seqMap.get(i);
      if (info) {
        row.utf8Group = info.group;
        row.utf8Char = info.isLead ? info.char : null;
        row.utf8Error = info.error;
        row.isLead = info.isLead;
        row.seqLength = info.seqLength;
      }
    }

    rows.push(row);
  }

  return {
    rows,
    utf8Valid,
    byteLength: data.length,
  };
}

export function formatInspectionTable(inspection) {
  const header = 'Offset\tDec\tHex\tBinary\tChar';
  const lines = [header];
  for (const r of inspection.rows) {
    lines.push(`${r.offset}\t${r.decimal}\t${r.hex}\t${r.binary}\t${r.display}`);
  }
  return lines.join('\n');
}
