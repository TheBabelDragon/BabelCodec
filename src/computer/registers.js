/**
 * 32-bit register — holds one unsigned word, updates atomically on write.
 */

export class Register32 {
  /**
   * @param {string} name
   * @param {bigint} [initial]
   */
  constructor(name, initial = 0n) {
    this.name = name;
    /** @type {bigint} */
    this._value = BigInt(initial) & 0xffffffffn;
    /** @type {bigint|null} next value latched at clock edge */
    this._next = null;
  }

  get value() {
    return this._value;
  }

  /**
   * Stage a value to be committed on commit().
   * @param {bigint|number} v
   */
  write(v) {
    this._next = BigInt(v) & 0xffffffffn;
  }

  /** Commit staged write (clock edge). */
  commit() {
    if (this._next !== null) {
      this._value = this._next;
      this._next = null;
    }
  }

  /** Immediate load (reset / init). */
  load(v) {
    this._value = BigInt(v) & 0xffffffffn;
    this._next = null;
  }

  clear() {
    this.load(0n);
  }
}

/**
 * Register bank for SHA-256 working variables A–H.
 */
export class RegisterBank {
  constructor() {
    this.regs = {
      A: new Register32('A'),
      B: new Register32('B'),
      C: new Register32('C'),
      D: new Register32('D'),
      E: new Register32('E'),
      F: new Register32('F'),
      G: new Register32('G'),
      H: new Register32('H'),
    };
  }

  /**
   * @param {bigint[]} values  length 8
   */
  loadAll(values) {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    for (let i = 0; i < 8; i++) {
      this.regs[names[i]].load(values[i]);
    }
  }

  /** Snapshot current values as BigInt[8]. */
  snapshot() {
    const n = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    return n.map((name) => this.regs[name].value);
  }

  /** Commit all staged writes atomically. */
  commitAll() {
    for (const r of Object.values(this.regs)) r.commit();
  }

  get A() { return this.regs.A.value; }
  get B() { return this.regs.B.value; }
  get C() { return this.regs.C.value; }
  get D() { return this.regs.D.value; }
  get E() { return this.regs.E.value; }
  get F() { return this.regs.F.value; }
  get G() { return this.regs.G.value; }
  get H() { return this.regs.H.value; }
}
