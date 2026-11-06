/**
 * Word memory for schedule and constants.
 */

export class WordMemory {
  /**
   * @param {string} name
   * @param {number} size
   */
  constructor(name, size) {
    this.name = name;
    this.size = size;
    /** @type {bigint[]} */
    this.words = new Array(size).fill(0n);
  }

  /**
   * @param {number} index
   * @returns {bigint}
   */
  read(index) {
    if (index < 0 || index >= this.size) {
      throw new RangeError(`${this.name}: index ${index} out of range`);
    }
    return this.words[index];
  }

  /**
   * @param {number} index
   * @param {bigint|number} value
   */
  write(index, value) {
    if (index < 0 || index >= this.size) {
      throw new RangeError(`${this.name}: index ${index} out of range`);
    }
    this.words[index] = BigInt(value) & 0xffffffffn;
  }

  /**
   * @param {bigint[]} values
   */
  load(values) {
    for (let i = 0; i < values.length && i < this.size; i++) {
      this.words[i] = BigInt(values[i]) & 0xffffffffn;
    }
  }

  clear() {
    this.words.fill(0n);
  }
}
