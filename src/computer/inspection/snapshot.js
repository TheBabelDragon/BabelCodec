/**
 * Immutable, serializable machine snapshots.
 * Architecture-neutral shape; adapters fill machine-specific fields.
 */

export function freezeSnapshot(obj) {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) {
        Object.freeze(v);
        for (const item of v) {
          if (item && typeof item === 'object') Object.freeze(item);
        }
      } else if (v && typeof v === 'object') {
        Object.freeze(v);
      }
    }
  }
  return obj;
}

export function serializeSnapshot(snap) {
  return JSON.stringify(snap, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

export function deserializeSnapshot(json) {
  return JSON.parse(json);
}

export function cloneSnapshot(snap) {
  return JSON.parse(serializeSnapshot(snap));
}

export function formatWordEntry(word, id, label) {
  const w = BigInt(word) & 0xffffffffn;
  return {
    id,
    label,
    hex: w.toString(16).padStart(8, '0'),
    bin: w.toString(2).padStart(32, '0'),
    dec: w.toString(10),
    width: 32,
  };
}
