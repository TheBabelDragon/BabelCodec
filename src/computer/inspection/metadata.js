/**
 * Architecture-neutral component metadata for hardware inspection.
 * Identifiers are stable strings; SHA-256-specific names live in adapters.
 */

/** @typedef {'register'|'memory'|'bus'|'datapath'|'controller'|'alu'|'signal'|'adder'} ComponentKind */

/** Known extension points for future general-purpose CPUs. */
export const EXTENSION_POINTS = Object.freeze([
  'register-file',
  'program-counter',
  'instruction-register',
  'alu',
  'control-unit',
  'ram',
  'rom',
  'address-bus',
  'data-bus',
  'control-signals',
  'clock-source',
  'execution-events',
  'breakpoints',
  'machine-snapshots',
]);

/**
 * @param {Partial<{id:string,kind:string,label:string,width?:number,region?:string,description?:string,implements?:string[]}>} partial
 */
export function defineComponent(partial) {
  if (!partial.id || !partial.kind || !partial.label) {
    throw new Error('Component meta requires id, kind, label');
  }
  return {
    id: partial.id,
    kind: partial.kind,
    label: partial.label,
    width: partial.width ?? null,
    region: partial.region ?? null,
    description: partial.description ?? '',
    implements: partial.implements ? [...partial.implements] : [],
  };
}

export function sha256ComponentCatalog() {
  const regs = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((n) =>
    defineComponent({
      id: `reg.working.${n}`,
      kind: 'register',
      label: n,
      width: 32,
      region: 'working',
      implements: ['register-file'],
      description: `Working register ${n}`,
    }),
  );
  const hash = Array.from({ length: 8 }, (_, i) =>
    defineComponent({
      id: `mem.hash.${i}`,
      kind: 'memory',
      label: `H[${i}]`,
      width: 32,
      region: 'hash',
      implements: ['register-file'],
      description: `Hash state word ${i}`,
    }),
  );
  const buses = ['T1', 'T2', 'W', 'K'].map((n) =>
    defineComponent({
      id: `bus.${n}`,
      kind: 'bus',
      label: n,
      width: 32,
      implements: ['data-bus'],
      description: `Bus ${n}`,
    }),
  );
  return [
    ...regs,
    ...hash,
    ...buses,
    defineComponent({
      id: 'mem.W',
      kind: 'memory',
      label: 'W schedule',
      width: 32,
      region: 'schedule',
      implements: ['ram'],
      description: 'Message schedule W[0..63]',
    }),
    defineComponent({
      id: 'mem.K',
      kind: 'memory',
      label: 'K constants',
      width: 32,
      region: 'constants',
      implements: ['rom'],
      description: 'Round constants K[0..63]',
    }),
    defineComponent({
      id: 'ctrl',
      kind: 'controller',
      label: 'Controller',
      implements: ['control-unit'],
      description: 'Finite-state controller',
    }),
    defineComponent({
      id: 'datapath.round',
      kind: 'datapath',
      label: 'Round datapath',
      implements: ['alu'],
      description: 'SHA-256 compression round datapath',
    }),
    defineComponent({
      id: 'adder.ripple32',
      kind: 'adder',
      label: '32-bit ripple-carry',
      width: 32,
      implements: ['alu'],
      description: 'Gate-expanded modular adder (full-adder chain)',
    }),
  ];
}
