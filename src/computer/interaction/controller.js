import { parseWord, formatWord } from '../architecture/machine-contract.js';
import { makeMutationEvent } from './mutations.js';

export class InteractionController {
  constructor(adapter, opts = {}) {
    this.adapter = adapter;
    this.origin = opts.origin || 'user';
    this.audit = [];
    this.maxAudit = opts.maxAudit ?? 2000;
    this.onMutation = opts.onMutation || (() => {});
  }

  get machineId() {
    return this.adapter.getMetadata?.()?.architectureId || 'machine';
  }

  getCycle() {
    return this.adapter.getState?.()?.cycle ?? 0;
  }

  writeRegister(regId, value) {
    const meta = this.adapter.getMetadata();
    const width = meta.registers?.find((r) => r.id === regId)?.widthBits ?? 32;
    let parsed;
    try {
      parsed = parseWord(value, width);
    } catch (e) {
      const ev = makeMutationEvent({
        machineId: this.machineId, componentId: regId, operation: 'register-write',
        previous: null, next: null, cycle: this.getCycle(), origin: this.origin,
        validation: { ok: false, code: 'PARSE', message: e.message },
      });
      this._record(ev);
      return { ok: false, event: ev };
    }
    if (!this.adapter.canWriteRegister(regId)) {
      const prev = this.adapter.readRegister(regId);
      const ev = makeMutationEvent({
        machineId: this.machineId, componentId: regId, operation: 'register-write',
        previous: prev.value, next: parsed, cycle: this.getCycle(), origin: this.origin,
        validation: { ok: false, code: 'PROTECTED', message: `Register ${regId} is not writable` },
      });
      this._record(ev);
      return { ok: false, event: ev };
    }
    const result = this.adapter.writeRegister(regId, parsed);
    const ev = makeMutationEvent({
      machineId: this.machineId, componentId: regId, operation: 'register-write',
      previous: result.previous, next: result.value, cycle: this.getCycle(), origin: this.origin,
      validation: result.ok ? { ok: true } : { ok: false, code: result.code, message: result.message },
    });
    this._record(ev);
    return { ok: result.ok, event: ev, hex: formatWord(result.value ?? parsed, width) };
  }

  writeMemory(memId, index, value) {
    const meta = this.adapter.getMetadata();
    const desc = meta.memories?.find((m) => m.id === memId);
    const width = desc?.wordBits ?? 32;
    if (index < 0 || (desc && index >= desc.size)) {
      const ev = makeMutationEvent({
        machineId: this.machineId, componentId: `${memId}[${index}]`, operation: 'memory-write',
        previous: null, next: null, cycle: this.getCycle(), origin: this.origin,
        validation: { ok: false, code: 'RANGE', message: `Index ${index} out of range` },
      });
      this._record(ev);
      return { ok: false, event: ev };
    }
    let parsed;
    try {
      parsed = parseWord(value, width);
    } catch (e) {
      const ev = makeMutationEvent({
        machineId: this.machineId, componentId: `${memId}[${index}]`, operation: 'memory-write',
        previous: null, next: null, cycle: this.getCycle(), origin: this.origin,
        validation: { ok: false, code: 'PARSE', message: e.message },
      });
      this._record(ev);
      return { ok: false, event: ev };
    }
    if (!this.adapter.canWriteMemory(memId, index)) {
      const ev = makeMutationEvent({
        machineId: this.machineId, componentId: `${memId}[${index}]`, operation: 'memory-write',
        previous: null, next: parsed, cycle: this.getCycle(), origin: this.origin,
        validation: { ok: false, code: 'PROTECTED', message: `Memory ${memId} is not writable` },
      });
      this._record(ev);
      return { ok: false, event: ev };
    }
    const result = this.adapter.writeMemory(memId, index, parsed);
    const ev = makeMutationEvent({
      machineId: this.machineId, componentId: `${memId}[${index}]`, operation: 'memory-write',
      previous: result.previous, next: result.value, cycle: this.getCycle(), origin: this.origin,
      validation: result.ok ? { ok: true } : { ok: false, code: result.code, message: result.message },
    });
    this._record(ev);
    return { ok: result.ok, event: ev };
  }

  readRegister(id) { return this.adapter.readRegister(id); }
  readMemory(id, index) { return this.adapter.readMemory(id, index); }
  getAudit() { return this.audit.slice(); }
  clearAudit() { this.audit = []; }

  _record(ev) {
    this.audit.push(ev);
    if (this.audit.length > this.maxAudit) this.audit.splice(0, this.audit.length - this.maxAudit);
    this.onMutation(ev);
  }
}
