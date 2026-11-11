/**
 * Suite-wide asset registry — identity, metadata, blob lifecycle.
 * Memory-first; optional IndexedDB persistence with explicit restore.
 */

import { sha256 } from '../../sha256/index.js';

let seq = 0;
function nextId(prefix = 'asset') {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

const SOURCES = new Set(['imported', 'created', 'transformed', 'generated', 'remote', 'mutated', 'prompt']);

/** Sniff common image MIME from magic bytes. */
export function sniffMimeType(bytes) {
  if (!bytes || bytes.length < 4) return 'application/octet-stream';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  // SVG / XML text
  const head = String.fromCharCode(...bytes.subarray(0, Math.min(64, bytes.length)));
  if (/^\s*<\?xml/i.test(head) || /^\s*<svg/i.test(head)) return 'image/svg+xml';
  return 'application/octet-stream';
}

/**
 * @typedef {object} AssetMeta
 * @property {string} id
 * @property {string} filename
 * @property {string} mimeType
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} byteLength
 * @property {string} source
 * @property {number} createdAt
 * @property {number} modifiedAt
 * @property {string} [parentId]
 * @property {Array<{op:string,at:number,detail?:object}>} history
 * @property {object} [provenance]
 * @property {string} [contentHash]
 * @property {string} [seed]
 * @property {string} [label]
 */

export function createAssetRegistry(opts = {}) {
  /** @type {Map<string, AssetMeta>} */
  const meta = new Map();
  /** @type {Map<string, Uint8Array>} */
  const payloads = new Map();
  /** @type {Map<string, string>} */
  const objectUrls = new Map();
  const maxBytes = opts.maxBytes ?? 24 * 1024 * 1024;
  const idbName = opts.idbName || 'babelcodec-assets-v1';
  let idb = null;
  let idbDisabled = Boolean(opts.disableIdb);
  let restored = false;

  function revokeUrl(id) {
    const u = objectUrls.get(id);
    if (u) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        /* */
      }
      objectUrls.delete(id);
    }
  }

  function list() {
    return [...meta.values()].map((m) => ({ ...m, history: [...(m.history || [])] }));
  }

  function get(id) {
    const m = meta.get(id);
    return m ? { ...m, history: [...(m.history || [])] } : null;
  }

  function getBytes(id) {
    const b = payloads.get(id);
    return b ? new Uint8Array(b) : null;
  }

  function getObjectUrl(id) {
    if (!meta.has(id)) return null;
    if (objectUrls.has(id)) return objectUrls.get(id);
    const bytes = payloads.get(id);
    if (!bytes) return null;
    const m = meta.get(id);
    const blob = new Blob([bytes], { type: m.mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    objectUrls.set(id, url);
    return url;
  }

  /** Parent chain root → … → id */
  function lineage(id) {
    const chain = [];
    let cur = id;
    const seen = new Set();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const m = meta.get(cur);
      if (!m) break;
      chain.unshift({ ...m, history: [...(m.history || [])] });
      cur = m.parentId;
    }
    return chain;
  }

  /** Direct children of id */
  function children(id) {
    return list().filter((m) => m.parentId === id);
  }

  async function createFromBytes(bytes, info = {}) {
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (buf.byteLength > maxBytes) {
      throw Object.assign(new Error(`asset exceeds maxBytes (${maxBytes})`), { code: 'ASSET_TOO_LARGE' });
    }
    const source = SOURCES.has(info.source) ? info.source : 'imported';
    const id = info.id || nextId();
    const now = Date.now();
    let contentHash;
    try {
      contentHash = sha256(buf).hex;
    } catch {
      contentHash = undefined;
    }
    const sniffed = sniffMimeType(buf);
    const mimeType =
      info.mimeType && info.mimeType !== 'application/octet-stream'
        ? String(info.mimeType)
        : sniffed !== 'application/octet-stream'
          ? sniffed
          : String(info.mimeType || 'application/octet-stream');
    /** @type {AssetMeta} */
    const record = {
      id,
      filename: String(info.filename || 'asset.bin'),
      mimeType,
      width: info.width != null ? Number(info.width) : undefined,
      height: info.height != null ? Number(info.height) : undefined,
      byteLength: buf.byteLength,
      source,
      createdAt: info.createdAt != null ? Number(info.createdAt) : now,
      modifiedAt: now,
      parentId: info.parentId,
      history: Array.isArray(info.history) ? [...info.history] : [],
      provenance: info.provenance ? { ...info.provenance } : undefined,
      contentHash,
      seed: info.seed != null ? String(info.seed) : undefined,
      label: info.label != null ? String(info.label) : undefined,
    };
    meta.set(id, record);
    payloads.set(id, buf);
    await persistOne(id);
    return get(id);
  }

  async function derive(parentId, bytes, info = {}) {
    const parent = meta.get(parentId);
    if (!parent) throw Object.assign(new Error('unknown parent asset'), { code: 'ASSET_PARENT' });
    const history = [...(parent.history || [])];
    if (info.historyEntry) {
      history.push({
        op: String(info.historyEntry.op || 'transform'),
        at: Date.now(),
        detail: info.historyEntry.detail,
      });
    }
    return createFromBytes(bytes, {
      filename: info.filename || parent.filename,
      mimeType: info.mimeType || parent.mimeType,
      width: info.width ?? parent.width,
      height: info.height ?? parent.height,
      source: info.source || 'transformed',
      parentId,
      history,
      provenance: info.provenance || parent.provenance,
      seed: info.seed,
      label: info.label,
    });
  }

  function remove(id) {
    // Do not cascade-delete parents or siblings
    revokeUrl(id);
    meta.delete(id);
    payloads.delete(id);
    deletePersisted(id).catch(() => {});
  }

  function clear() {
    for (const id of [...meta.keys()]) remove(id);
  }

  async function openIdb() {
    if (idbDisabled || typeof indexedDB === 'undefined') return null;
    if (idb) return idb;
    try {
      idb = await new Promise((resolve, reject) => {
        const req = indexedDB.open(idbName, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('assets')) {
            db.createObjectStore('assets', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return idb;
    } catch {
      idbDisabled = true;
      idb = null;
      return null;
    }
  }

  /**
   * Persist one asset. Resolves only after transaction completes.
   * Returns { ok: true } or { ok: false, reason }.
   */
  async function persistOne(id) {
    const db = await openIdb();
    if (!db) return { ok: false, reason: 'idb_unavailable' };
    const m = meta.get(id);
    const bytes = payloads.get(id);
    if (!m || !bytes) return { ok: false, reason: 'missing' };
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('assets', 'readwrite');
        tx.objectStore('assets').put({ ...m, bytes });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('aborted'));
      });
      return { ok: true };
    } catch (e) {
      idbDisabled = true;
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  }

  async function deletePersisted(id) {
    const db = await openIdb();
    if (!db) return;
    await new Promise((resolve) => {
      try {
        const tx = db.transaction('assets', 'readwrite');
        tx.objectStore('assets').delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Restore all persisted assets into memory. Idempotent.
   * Does not wipe existing in-memory assets with the same id (memory wins).
   */
  async function restoreAll() {
    const db = await openIdb();
    if (!db) {
      restored = true;
      return { restored: 0, available: false };
    }
    const rows = await new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('assets', 'readonly');
        const req = tx.objectStore('assets').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      } catch (e) {
        reject(e);
      }
    }).catch(() => []);

    let n = 0;
    for (const row of rows) {
      if (!row || !row.id || !row.bytes) continue;
      if (meta.has(row.id)) continue; // keep live session state
      const bytes =
        row.bytes instanceof Uint8Array
          ? row.bytes
          : row.bytes instanceof ArrayBuffer
            ? new Uint8Array(row.bytes)
            : new Uint8Array(row.bytes);
      const record = {
        id: row.id,
        filename: row.filename || 'asset.bin',
        mimeType: row.mimeType || sniffMimeType(bytes),
        width: row.width,
        height: row.height,
        byteLength: bytes.byteLength,
        source: row.source || 'imported',
        createdAt: row.createdAt || Date.now(),
        modifiedAt: row.modifiedAt || row.createdAt || Date.now(),
        parentId: row.parentId,
        history: Array.isArray(row.history) ? [...row.history] : [],
        provenance: row.provenance ? { ...row.provenance } : undefined,
        contentHash: row.contentHash,
        seed: row.seed,
        label: row.label,
      };
      if (!record.contentHash) {
        try {
          record.contentHash = sha256(bytes).hex;
        } catch {
          /* */
        }
      }
      meta.set(record.id, record);
      payloads.set(record.id, bytes);
      n += 1;
    }
    restored = true;
    return { restored: n, available: true };
  }

  function isRestored() {
    return restored;
  }

  return {
    createFromBytes,
    derive,
    get,
    getBytes,
    getObjectUrl,
    list,
    remove,
    clear,
    lineage,
    children,
    restoreAll,
    isRestored,
    persistOne,
    sniffMimeType,
    maxBytes,
  };
}

let defaultRegistry = null;

export function getDefaultRegistry() {
  if (!defaultRegistry) defaultRegistry = createAssetRegistry();
  return defaultRegistry;
}

export function resetDefaultRegistry() {
  if (defaultRegistry) defaultRegistry.clear();
  defaultRegistry = null;
}
