/**
 * Built-in interactive workbench experiments (deterministic).
 */

export const EXPERIMENTS = Object.freeze({
  'sha256-register-write': {
    id: 'sha256-register-write',
    architecture: 'babelcodec.sha256-computer',
    title: 'Register write and observe',
    description: 'Load abc, write working register A, clock one cycle, inspect state.',
    steps: ['load:abc', 'write-register:A:0x1', 'clock', 'inspect'],
  },
  'sha256-memory-k-protect': {
    id: 'sha256-memory-k-protect',
    architecture: 'babelcodec.sha256-computer',
    title: 'Protected K constants',
    description: 'Attempt write to K[0] must fail without mutation.',
    steps: ['load:abc', 'write-memory:K:0:0xDEADBEEF', 'assert-protected'],
  },
  'sha256-abc-digest': {
    id: 'sha256-abc-digest',
    architecture: 'babelcodec.sha256-computer',
    title: 'Known-answer abc',
    description: 'Run to completion; digest must match FIPS vector.',
    steps: ['load:abc', 'run', 'assert-digest:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  },
  'cpu-step-arithmetic': {
    id: 'cpu-step-arithmetic',
    architecture: 'babelcodec.cpu32',
    title: 'CPU instruction step',
    description: 'Assemble arithmetic example, step instructions to halt.',
    steps: ['assemble:arithmetic', 'load-program', 'run-until-halt'],
  },
});

export function listExperiments() {
  return Object.values(EXPERIMENTS);
}

export function getExperiment(id) {
  return EXPERIMENTS[id] || null;
}
