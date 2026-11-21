/**
 * Artifact History / Output Ledger
 *
 * Tracks every meaningful pipeline output with parent linkage, hashes,
 * and complete byte preservation. Offline-first; optional IndexedDB.
 */

import { sha256 } from '../../sha256/index.js';
import { copyBytes } from './representations.js';
import { snapshotArtifact } from './artifact.js';

/**
 * @typedef {object} LedgerRecord
 * @property {string} recordId
 * @property {string} artifactId
 * @property {number} revision
 * @property {string|null} parentArtifactId
 * @property {number|null} parentRevision
 * @property {string} operationId
 * @property {string} operationName
 * @property {object} [operationParams]
 * @property {string} sourceRepresentation
 * @property {string} destinationRepresentation
 * @property {number} byteLength
 * @property {string|null} sha256
 * @property {object|null} detectionRef
 * @property {number} timestamp
 * @property {boolean} exportAvailable
 * @property {string} storageStatus  // 'memory' | 'persisted' | 'evicted' | 'quota_exceeded'
 */

let recordSeq = 0;
function nextRecordId() {
  recordSeq += 1;
  return `led-${Date.now().toString(36)}-${recordSeq}`;
}

function nextOpId(name) {
  return `op-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * @param {{
 *   idbName?: string,
 *   disableIdb?: boolean,
 *   maxMemoryRecords?: number,
 * }} [opts]
 */
export function createArtifactLedger(opts = {}) {
  /** @type {Map<string, LedgerRecord>} */
  const records = new Map();
  /** @type {Map<string, Uint8Array>} key = artifactId@revision */
  const payloads = new Map();
  /** @type {Map<string, object>} artifact snapshots by artifactId@revision */
  const artifacts = new Map();

  const maxMemoryRecords = opts.maxMemoryRecords ?? 200;
  const idbName = opts.idbName || 'babelcodec-ledger-v1';
  let idbDisabled = Boolean(opts.disableIdb);
  let idb = null;

  function keyOf(artifactId, revision) {
    return `${artifactId}@${revision}`;
  }

  function listRecords(artifactId) {
    const all = [...records.values()];
    const filtered = artifactId ? all.filter((r) => r.artifactId === artifactId) : all;
    return filtered
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((r) => ({ ...r, operationParams: r.operationParams ? { ...r.operationParams } : undefined }));
  }

  function getRecord(artifactId, revision) {
    const k = keyOf(artifactId, revision);
    for (const r of records.values()) {
      if (r.artifactId === artifactId && r.revision === revision) {
        return { ...r };
      }
    }
    // also allow lookup by record id stored as key
    const byKey = records.get(k);
    return byKey ? { ...byKey } : null;
  }

  function getBytes(artifactId, revision) {
    const b = payloads.get(keyOf(artifactId, revision));
    return b ? copyBytes(b) : null;
  }

  function getArtifactSnapshot(artifactId, revision) {
    const a = artifacts.get(keyOf(artifactId, revision));
    return a ? snapshotArtifact(a) : null;
  }

  /**
   * Commit an artifact revision to the ledger.
   * @param {import('./artifact.js').Artifact} artifact
   * @param {{
 *     operationName?: string,
 *     operationParams?: object,
 *     sourceRepresentation?: string,
 *     destinationRepresentation?: string,
 *     detectionRef?: object|null,
 *     persist?: boolean,
 *   }} [info]
   */
  async function commit(artifact, info = {}) {
    const snap = snapshotArtifact(artifact);
    const k = keyOf(snap.id, snap.revision);
    const bytes = snap.representations.bytes ? copyBytes(snap.representations.bytes) : null;

    let digest = snap.hashes?.sha256 ?? null;
    if (!digest && bytes) {
      try {
        digest = sha256(bytes).hex;
      } catch {
        digest = null;
      }
    }

    /** @type {LedgerRecord} */
    const record = {
      recordId: nextRecordId(),
      artifactId: snap.id,
      revision: snap.revision,
      parentArtifactId: snap.provenance?.parentArtifactId ?? null,
      parentRevision: snap.provenance?.parentRevision ?? null,
      operationId: nextOpId(info.operationName || snap.provenance?.operation || 'commit'),
      operationName: info.operationName || snap.provenance?.operation || 'commit',
      operationParams: info.operationParams ? { ...info.operationParams } : undefined,
      sourceRepresentation: info.sourceRepresentation || 'bytes',
      destinationRepresentation: info.destinationRepresentation || 'bytes',
      byteLength: bytes ? bytes.byteLength : 0,
      sha256: digest,
      detectionRef: info.detectionRef ?? null,
      timestamp: Date.now(),
      exportAvailable: Boolean(bytes),
      storageStatus: 'memory',
    };

    // Evict oldest if over memory cap (keep payloads for recent)
    if (records.size >= maxMemoryRecords) {
      const oldest = [...records.values()].sort((a, b) => a.timestamp - b.timestamp)[0];
      if (oldest) {
        const ok = keyOf(oldest.artifactId, oldest.revision);
        payloads.delete(ok);
        artifacts.delete(ok);
        oldest.storageStatus = 'evicted';
        oldest.exportAvailable = false;
        records.set(oldest.recordId, oldest);
      }
    }

    records.set(record.recordId, record);
    if (bytes) payloads.set(k, bytes);
    artifacts.set(k, snap);

    if (info.persist !== false && !idbDisabled) {
      const persistResult = await persistRecord(record, bytes);
      if (persistResult.ok) {
        record.storageStatus = 'persisted';
      } else if (persistResult.reason === 'quota') {
        record.storageStatus = 'quota_exceeded';
        record.exportAvailable = Boolean(bytes); // still in memory
      }
    }

    return { ...record };
  }

  async function openIdb() {
    if (idbDisabled || typeof indexedDB === 'undefined') return null;
    if (idb) return idb;
    try {
      idb = await new Promise((resolve, reject) => {
        const req = indexedDB.open(idbName, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('ledger')) {
            db.createObjectStore('ledger', { keyPath: 'recordId' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return idb;
    } catch {
      idbDisabled = true;
      return null;
    }
  }

  async function persistRecord(record, bytes) {
    const db = await openIdb();
    if (!db) return { ok: false, reason: 'unavailable' };
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction('ledger', 'readwrite');
        tx.objectStore('ledger').put({ ...record, bytes: bytes || null });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('aborted'));
      });
      return { ok: true };
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (/quota/i.test(msg)) return { ok: false, reason: 'quota' };
      return { ok: false, reason: msg };
    }
  }

  /**
   * Verify stored bytes against recorded hash.
   */
  function verify(artifactId, revision) {
    const rec = getRecord(artifactId, revision);
    if (!rec) return { ok: false, reason: 'missing_record' };
    const bytes = getBytes(artifactId, revision);
    if (!bytes) {
      return {
        ok: false,
        reason: rec.storageStatus === 'evicted' ? 'evicted' : 'missing_bytes',
        record: rec,
      };
    }
    if (!rec.sha256) return { ok: false, reason: 'no_hash', record: rec };
    let digest;
    try {
      digest = sha256(bytes).hex;
    } catch (e) {
      return { ok: false, reason: String(e.message || e), record: rec };
    }
    return {
      ok: digest === rec.sha256,
      expected: rec.sha256,
      actual: digest,
      record: rec,
    };
  }

  /**
   * Restore a revision as a new working artifact snapshot (does not destroy later revisions).
   */
  function restore(artifactId, revision) {
    const snap = getArtifactSnapshot(artifactId, revision);
    if (!snap) return { ok: false, reason: 'missing' };
    const bytes = getBytes(artifactId, revision);
    if (!bytes && snap.representations.bytes) {
      // try from snapshot
      return { ok: true, artifact: snap, warning: 'bytes_from_snapshot_only' };
    }
    if (bytes) {
      snap.representations = {
        ...snap.representations,
        bytes: copyBytes(bytes),
      };
    }
    return { ok: true, artifact: snap };
  }

  /**
   * Export complete output description (no truncation).
   */
  function exportOutput(artifactId, revision, format = 'bytes') {
    const rec = getRecord(artifactId, revision);
    if (!rec) return { ok: false, reason: 'missing_record' };
    const bytes = getBytes(artifactId, revision);
    if (!bytes) {
      return {
        ok: false,
        reason: rec.storageStatus === 'quota_exceeded' ? 'quota_exceeded' : 'missing_bytes',
        record: rec,
        falsePreservation: rec.storageStatus === 'evicted',
      };
    }
    return {
      ok: true,
      format,
      bytes: copyBytes(bytes),
      byteLength: bytes.byteLength,
      sha256: rec.sha256,
      record: rec,
      complete: true,
    };
  }

  function clear(artifactId) {
    if (artifactId) {
      for (const [id, r] of [...records.entries()]) {
        if (r.artifactId === artifactId) {
          payloads.delete(keyOf(r.artifactId, r.revision));
          artifacts.delete(keyOf(r.artifactId, r.revision));
          records.delete(id);
        }
      }
    } else {
      records.clear();
      payloads.clear();
      artifacts.clear();
    }
  }

  function storageSummary() {
    const statuses = {};
    for (const r of records.values()) {
      statuses[r.storageStatus] = (statuses[r.storageStatus] || 0) + 1;
    }
    return {
      recordCount: records.size,
      payloadCount: payloads.size,
      statuses,
      idbEnabled: !idbDisabled,
    };
  }

  return {
    commit,
    listRecords,
    getRecord,
    getBytes,
    getArtifactSnapshot,
    verify,
    restore,
    exportOutput,
    clear,
    storageSummary,
  };
}

let defaultLedger = null;

export function getDefaultLedger() {
  if (!defaultLedger) defaultLedger = createArtifactLedger();
  return defaultLedger;
}

export function resetDefaultLedger() {
  if (defaultLedger) defaultLedger.clear();
  defaultLedger = null;
}
