/**
 * 32-bit bus — named wire bundle holding an unsigned word.
 */

export class Bus32 {
  /**
   * @param {string} name
   * @param {bigint} [initial]
   */
  constructor(name, initial = 0n) {
    this.name = name;
    this._value = BigInt(initial) & 0xffffffffn;
  }

  get value() {
    return this._value;
  }

  set value(v) {
    this._value = BigInt(v) & 0xffffffffn;
  }

  /**
   * Bit i (0 = LSB).
   * @param {number} i
   * @returns {number}
   */
  bit(i) {
    return Number((this._value >> BigInt(i)) & 1n);
  }
}
