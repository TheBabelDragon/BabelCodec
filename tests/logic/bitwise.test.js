import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  and, or, xor, not, nand, nor, xnor,
  toUnsigned, toBinaryString, asSigned, widthMask, validateWidth,
} from '../../src/logic/bitwise.js';

describe('bitwise', () => {
  it('validates width 1–64', () => {
    assert.throws(() => validateWidth(0), /width/i);
    assert.throws(() => validateWidth(65), /width/i);
    assert.throws(() => validateWidth(3.5), /width/i);
    validateWidth(1);
    validateWidth(64);
  });
  it('masks results to width', () => {
    assert.equal(and(0xff, 0x0f, { width: 8, asNumber: true }), 0x0f);
    assert.equal(or(0xf0, 0x0f, { width: 8, asNumber: true }), 0xff);
    assert.equal(xor(0xff, 0x0f, { width: 8, asNumber: true }), 0xf0);
  });
  it('NOT is width-limited ones complement', () => {
    assert.equal(not(0x00, { width: 8, asNumber: true }), 0xff);
    assert.equal(not(0x0f, { width: 8, asNumber: true }), 0xf0);
    assert.equal(not(0, { width: 4, asNumber: true }), 0b1111);
  });
  it('NAND / NOR / XNOR', () => {
    assert.equal(nand(0xff, 0x0f, { width: 8, asNumber: true }), 0xf0);
    assert.equal(nor(0x00, 0x00, { width: 8, asNumber: true }), 0xff);
    assert.equal(xnor(0xaa, 0xaa, { width: 8, asNumber: true }), 0xff);
    assert.equal(xnor(0xaa, 0x55, { width: 8, asNumber: true }), 0x00);
  });
  it('handles 32-bit without JS truncation surprises', () => {
    const a = 0xffffffff;
    const b = 0x80000000;
    assert.equal(and(a, b, { width: 32, asNumber: true }), 0x80000000);
    assert.equal(or(0, b, { width: 32, asNumber: true }), 0x80000000);
  });
  it('handles 64-bit with BigInt', () => {
    const a = 0xffffffffffffffffn;
    const b = 1n << 63n;
    const r = and(a, b, { width: 64 });
    assert.equal(typeof r, 'bigint');
    assert.equal(r, 1n << 63n);
    const n = not(0n, { width: 64 });
    assert.equal(n, (1n << 64n) - 1n);
  });
  it('rejects unsafe asNumber for width > 53', () => {
    assert.throws(() => and(1n, 1n, { width: 64, asNumber: true }), /safe integer|asNumber/i);
  });
  it('rejects non-integer inputs', () => {
    assert.throws(() => and(1.5, 2, { width: 8 }), /integer/i);
    assert.throws(() => and(NaN, 2, { width: 8 }), /integer/i);
  });
  it('zero and max unsigned', () => {
    assert.equal(or(0, 0, { width: 16, asNumber: true }), 0);
    assert.equal(and(0xffff, 0xffff, { width: 16, asNumber: true }), 0xffff);
  });
  it('toBinaryString pads to width', () => {
    assert.equal(toBinaryString(5, 8), '00000101');
    assert.equal(toBinaryString(0xff, 8), '11111111');
  });
  it('asSigned two\'s complement', () => {
    assert.equal(asSigned(0xff, 8), -1n);
    assert.equal(asSigned(0x7f, 8), 127n);
    assert.equal(asSigned(0x80, 8), -128n);
  });
  it('negative inputs wrap via two\'s complement', () => {
    assert.equal(toUnsigned(-1, 8), 0xffn);
    assert.equal(and(-1, 0x0f, { width: 8, asNumber: true }), 0x0f);
  });
  it('widthMask', () => {
    assert.equal(widthMask(8), 0xffn);
    assert.equal(widthMask(1), 1n);
    assert.equal(widthMask(64), (1n << 64n) - 1n);
  });
});
