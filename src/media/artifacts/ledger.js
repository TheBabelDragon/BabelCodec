/**
 * Artifact History / Output Ledger
 */

import { sha256 } from '../../sha256/index.js';
import { encodeHex } from '../../core/hex.js';
import { encodeBase64 } from '../../core/base64.js';
import { decodeUtf8 } from '../../core/utf8.js';
import { copyBytes } from './representations.js';
import { snapshotArtifact, createRevision } from './artifact.js';

let recordSeq = 0;
function nextRecordId() {
  recordSeq += 1;
  return `led-${Date.now().toString(36)}-${recordSeq}`;
}

function nextOpId(name) {
  return `op-${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createArtifactLedger(opts = {}) {
  const records = new Map();
  const payloads = new Map();
  const artifacts = new Map();

  const maxMemoryRecords = opts.maxMemoryRecords ?? 200;
  const idbName = opts.idbName || 'babelcodec-ledger-v1';
  let idbDisabled = Boolean(opts.disableIdb);
  let idb = null;
  let restored = false;

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
    for (const r of records.values()) {
      if (r.artifactId === artifactId && r.revision === revision) return { ...r };
    }
    return null;
  }

  function getBytes(artifactId, revision) {
    const b = payloads.get(keyOf(artifactId, revision));
    return b ? copyBytes(b) : null;
  }

  /**
   * Load cold persisted payload into memory if available.
   */
  async function ensureBytes(artifactId, revision) {
    const existing = getBytes(artifactId, revision);
    if (existing) return existing;
    const db = await openIdb();
    if (!db) return null;
    const rows = await new Promise((resolve) => {
      try {
        const tx = db.transaction('ledger', 'readonly');
        const req = tx.objectStore('ledger').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
    for (const row of rows) {
      if (row.artifactId === artifactId && row.revision === revision && row.bytes) {
        const buf =
          row.bytes instanceof Uint8Array
            ? copyBytes(row.bytes)
            : copyBytes(new Uint8Array(row.bytes));
        if (buf) {
          payloads.set(keyOf(artifactId, revision), buf);
          const rec = getRecord(artifactId, revision);
          if (rec) {
            for (const [id, r] of records.entries()) {
              if (r.artifactId === artifactId && r.revision === revision) {
                r.exportAvailable = true;
                r.storageStatus = 'persisted';
                records.set(id, r);
              }
            }
          }
          return copyBytes(buf);
        }
      }
    }
    return null;
  }

  function getArtifactSnapshot(artifactId, revision) {
    const a = artifacts.get(keyOf(artifactId, revision));
    return a ? snapshotArtifact(a) : null;
  }

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

    if (records.size >= maxMemoryRecords) {
      const oldest = [...records.values()].sort((a, b) => a.timestamp - b.timestamp)[0];
      if (oldest) {
        const ok = keyOf(oldest.artifactId, oldest.revision);
        payloads.delete(ok);
        artifacts.delete(ok);
        if (oldest.storageStatus === 'persisted') {
          oldest.storageStatus = 'persisted_cold';
          oldest.exportAvailable = false;
        } else {
          oldest.storageStatus = 'evicted';
          oldest.exportAvailable = false;
        }
        records.set(oldest.recordId, oldest);
      }
    }

    records.set(record.recordId, record);
    if (bytes) payloads.set(k, bytes);
    artifacts.set(k, snap);

    if (info.persist !== false && !idbDisabled) {
      const persistResult = await persistRecord(record, bytes);
      if (persistResult.ok) record.storageStatus = 'persisted';
      else if (persistResult.reason === 'quota') {
        record.storageStatus = 'quota_exceeded';
        record.exportAvailable = Boolean(bytes);
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

  async function deletePersisted(recordId) {
    const db = await openIdb();
    if (!db) return;
    await new Promise((resolve) => {
      try {
        const tx = db.transaction('ledger', 'readwrite');
        tx.objectStore('ledger').delete(recordId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async function restoreAll() {
    const db = await openIdb();
    if (!db) {
      restored = true;
      return { restored: 0, available: false };
    }
    const rows = await new Promise((resolve) => {
      try {
        const tx = db.transaction('ledger', 'readonly');
        const req = tx.objectStore('ledger').getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });

    let n = 0;
    for (const row of rows) {
      if (!row || !row.recordId) continue;
      if (!records.has(row.recordId)) {
        const { bytes: rowBytes, ...meta } = row;
        records.set(row.recordId, {
          ...meta,
          storageStatus: 'persisted',
          exportAvailable: Boolean(rowBytes),
        });
        n += 1;
      }
      if (row.bytes) {
        const k = keyOf(row.artifactId, row.revision);
        if (!payloads.has(k)) {
          const buf =
            row.bytes instanceof Uint8Array
              ? copyBytes(row.bytes)
              : copyBytes(new Uint8Array(row.bytes));
          if (buf) payloads.set(k, buf);
          const rec = records.get(row.recordId);
          if (rec) {
            rec.exportAvailable = true;
            rec.storageStatus = 'persisted';
          }
        }
      }
    }
    restored = true;
    return { restored: n, available: true };
  }

  function isRestored() {
    return restored;
  }

  function verify(artifactId, revision) {
    const rec = getRecord(artifactId, revision);
    if (!rec) return { ok: false, reason: 'missing_record' };
    const bytes = getBytes(artifactId, revision);
    if (!bytes) {
      return {
        ok: false,
        reason:
          rec.storageStatus === 'evicted'
            ? 'evicted'
            : rec.storageStatus === 'persisted_cold'
              ? 'not_loaded'
              : 'missing_bytes',
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
    return { ok: digest === rec.sha256, expected: rec.sha256, actual: digest, record: rec };
  }

  /**
   * Snapshot historical revision (does not create new revision).
   */
  function restore(artifactId, revision) {
    const snap = getArtifactSnapshot(artifactId, revision);
    const bytes = getBytes(artifactId, revision);
    if (!snap && !bytes) return { ok: false, reason: 'missing' };
    if (snap && bytes) {
      snap.representations = { ...snap.representations, bytes: copyBytes(bytes) };
      return { ok: true, artifact: snap };
    }
    if (snap) return { ok: true, artifact: snap, warning: 'bytes_from_snapshot_only' };
    return {
      ok: true,
      artifact: {
        schema: 'babelcodec.artifact.v1',
        id: artifactId,
        revision,
        source: { kind: 'bytes', name: null, mimeType: null, filename: null },
        representations: { bytes: copyBytes(bytes), text: null, image: null },
        metadata: { byteLength: bytes.byteLength },
        hashes: { sha256: getRecord(artifactId, revision)?.sha256 ?? null },
        provenance: { parentArtifactId: null, parentRevision: null, operation: 'restore' },
      },
    };
  }

  /**
   * Restore historical revision as a **new working revision** (preserves history).
   */
  async function restoreWorking(artifactId, revision) {
    let bytes = getBytes(artifactId, revision);
    if (!bytes) bytes = await ensureBytes(artifactId, revision);
    if (!bytes) return { ok: false, reason: 'missing_bytes' };

    const parentSnap = getArtifactSnapshot(artifactId, revision);
    const base = parentSnap || {
      schema: 'babelcodec.artifact.v1',
      id: artifactId,
      revision,
      source: { kind: 'bytes', name: null, mimeType: null, filename: null },
      representations: { bytes, text: null, image: null },
      metadata: { byteLength: bytes.byteLength },
      hashes: { sha256: null },
      provenance: { parentArtifactId: null, parentRevision: null, operation: 'import' },
    };

    const working = createRevision(base, {
      representations: {
        bytes: copyBytes(bytes),
        text: base.representations?.text ?? null,
        image: base.representations?.image ?? null,
      },
      operation: 'restore',
      detail: { restoredFromRevision: revision },
    });

    let digest;
    try {
      digest = sha256(bytes).hex;
    } catch {
      digest = null;
    }
    if (digest) working.hashes = { sha256: digest };

    const record = await commit(working, {
      operationName: 'restore',
      operationParams: { fromRevision: revision },
      sourceRepresentation: 'bytes',
      destinationRepresentation: 'artifact',
    });

    return { ok: true, artifact: working, record, restoredFromRevision: revision };
  }

  function exportOutput(artifactId, revision, format = 'bytes') {
    const rec = getRecord(artifactId, revision);
    if (!rec) return { ok: false, reason: 'missing_record', complete: false };
    const bytes = getBytes(artifactId, revision);
    if (!bytes) {
      return {
        ok: false,
        reason:
          rec.storageStatus === 'quota_exceeded'
            ? 'quota_exceeded'
            : rec.storageStatus === 'persisted_cold'
              ? 'not_loaded'
              : 'missing_bytes',
        record: rec,
        complete: false,
        falsePreservation: rec.storageStatus === 'evicted',
      };
    }

    const base = {
      ok: true,
      format,
      byteLength: bytes.byteLength,
      sha256: rec.sha256,
      record: rec,
      complete: true,
    };

    if (format === 'bytes') return { ...base, bytes: copyBytes(bytes) };
    if (format === 'hex') return { ...base, text: encodeHex(bytes), bytes: copyBytes(bytes) };
    if (format === 'base64') return { ...base, text: encodeBase64(bytes), bytes: copyBytes(bytes) };
    if (format === 'text') {
      try {
        return { ...base, text: decodeUtf8(bytes), bytes: copyBytes(bytes), encoding: 'utf-8' };
      } catch (e) {
        return {
          ok: false,
          reason: 'not_valid_utf8',
          message: String(e.message || e),
          record: rec,
          complete: false,
          bytes: copyBytes(bytes),
        };
      }
    }
    if (format === 'json-report') {
      return {
        ...base,
        text: JSON.stringify(
          {
            artifactId,
            revision,
            sha256: rec.sha256,
            byteLength: bytes.byteLength,
            operationName: rec.operationName,
            timestamp: rec.timestamp,
            parentArtifactId: rec.parentArtifactId,
            parentRevision: rec.parentRevision,
            detectionRef: rec.detectionRef,
          },
          null,
          2,
        ),
        bytes: copyBytes(bytes),
      };
    }
    return { ok: false, reason: 'unknown_format', complete: false, record: rec };
  }

  function copyOutput(artifactId, revision, options = {}) {
    const format = options.format || 'text';
    const exp = exportOutput(artifactId, revision, format);
    if (!exp.ok) {
      return { ok: false, reason: exp.reason, claimed: false, complete: false };
    }
    if (format === 'bytes') {
      return {
        ok: true,
        mimeType: 'application/octet-stream',
        bytes: exp.bytes,
        claimed: false,
        note: 'Binary payload ready; use download if clipboard binary is unsupported',
        complete: true,
        sha256: exp.sha256,
      };
    }
    return {
      ok: true,
      mimeType: 'text/plain',
      text: exp.text,
      claimed: true,
      complete: true,
      sha256: exp.sha256,
      byteLength: exp.byteLength,
    };
  }

  /**
   * Clear memory and optionally delete IndexedDB rows.
   * @param {string} [artifactId]
   * @param {{ persist?: boolean }} [opts] persist:true deletes IDB entries
   */
  async function clear(artifactId, opts = {}) {
    const persist = opts.persist !== false;
    const toDelete = [];
    if (artifactId) {
      for (const [id, r] of [...records.entries()]) {
        if (r.artifactId === artifactId) {
          payloads.delete(keyOf(r.artifactId, r.revision));
          artifacts.delete(keyOf(r.artifactId, r.revision));
          records.delete(id);
          toDelete.push(r.recordId);
        }
      }
    } else {
      for (const r of records.values()) toDelete.push(r.recordId);
      records.clear();
      payloads.clear();
      artifacts.clear();
    }
    if (persist && !idbDisabled) {
      for (const rid of toDelete) await deletePersisted(rid);
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
      restored,
    };
  }

  return {
    commit,
    listRecords,
    getRecord,
    getBytes,
    ensureBytes,
    getArtifactSnapshot,
    verify,
    restore,
    restoreWorking,
    restoreAll,
    isRestored,
    exportOutput,
    copyOutput,
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
  if (defaultLedger) defaultLedger.clear(undefined, { persist: false });
  defaultLedger = null;
}
