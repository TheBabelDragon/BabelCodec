/**
 * Suite-wide asset registry — identity, metadata, blob lifecycle.
 * Memory-first; optional IndexedDB persistence when available.
 */

import { sha256 } from '../../sha256/index.js';

let seq = 0;
function nextId(prefix = 'asset') {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

const SOURCES = new Set(['imported', 'created', 'transformed', 'generated', 'remote']);

/**
 * @typedef {object} AssetMeta
 * @property {string} id
 * @property {string} filename
 * @property {string} mimeType
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} byteLength
 * @property {'imported'|'created'|'transformed'|'generated'|'remote'} source
 * @property {number} createdAt
 * @property {number} modifiedAt
 * @property {string} [parentId]
 * @property {Array<{op:string,at:number,detail?:object}>} history
 * @property {object} [provenance]
 * @property {string} [contentHash]
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
  let idbDisabled = false;

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
    /** @type {AssetMeta} */
    const record = {
      id,
      filename: String(info.filename || 'asset.bin'),
      mimeType: String(info.mimeType || 'application/octet-stream'),
      width: info.width != null ? Number(info.width) : undefined,
      height: info.height != null ? Number(info.height) : undefined,
      byteLength: buf.byteLength,
      source,
      createdAt: now,
      modifiedAt: now,
      parentId: info.parentId,
      history: Array.isArray(info.history) ? [...info.history] : [],
      provenance: info.provenance ? { ...info.provenance } : undefined,
      contentHash,
    };
    meta.set(id, record);
    payloads.set(id, buf);
    await persistOne(id).catch(() => {});
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
    });
  }

  function remove(id) {
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

  async function persistOne(id) {
    const db = await openIdb();
    if (!db) return;
    const m = meta.get(id);
    const bytes = payloads.get(id);
    if (!m || !bytes) return;
    await new Promise((resolve, reject) => {
      try {
        const tx = db.transaction('assets', 'readwrite');
        tx.objectStore('assets').put({ ...m, bytes });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      } catch (e) {
        reject(e);
      }
    }).catch(() => {
      idbDisabled = true;
    });
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

  return {
    createFromBytes,
    derive,
    get,
    getBytes,
    getObjectUrl,
    list,
    remove,
    clear,
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
