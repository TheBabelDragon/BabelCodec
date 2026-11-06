import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Register32, RegisterBank } from '../../src/computer/index.js';

describe('registers', () => {
  it('write stages until commit', () => {
    const r = new Register32('T');
    r.load(0x11n);
    r.write(0x22n);
    assert.equal(r.value, 0x11n);
    r.commit();
    assert.equal(r.value, 0x22n);
  });

  it('bank commitAll is atomic', () => {
    const b = new RegisterBank();
    b.loadAll([1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n]);
    b.regs.A.write(9n);
    assert.equal(b.A, 1n);
    b.commitAll();
    assert.equal(b.A, 9n);
  });
});
