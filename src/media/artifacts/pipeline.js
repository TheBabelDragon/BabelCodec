/**
 * High-level pipeline: input → detect → artifact → hash → ledger.
 *
 * Acquisition policy: by default, ingestion stores the same bounded representation
 * used for detection (maxBytes). Full-original archival requires explicit
 * opts.storeFullOriginal === true (still subject to a separate fullOriginalMaxBytes).
 */

import { detectInput, normalizeInput } from '../detection/index.js';
import { resolveLimits } from '../detection/limits.js';
import { fromBytes, fromText } from './representations-service.js';
import { analyzeArtifact } from './analyze.js';
import { withHash } from './artifact.js';
import { getDefaultLedger } from './ledger.js';
import { copyBytes } from './representations.js';

/**
 * @param {string|Uint8Array|ArrayBuffer|ArrayBufferView|File|Blob} input
 * @param {{
 *   typeHint?: string,
 *   filename?: string,
 *   mimeType?: string,
 *   ledger?: ReturnType<import('./ledger.js').createArtifactLedger>,
 *   detectOptions?: object,
 *   storeFullOriginal?: boolean,
 *   fullOriginalMaxBytes?: number,
 * }} [opts]
 */
export async function ingestInput(input, opts = {}) {
  const detectOptions = { ...(opts.detectOptions || {}) };
  const limits = resolveLimits(detectOptions.limits);

  const detection = await detectInput(input, {
    typeHint: opts.typeHint,
    ...detectOptions,
    limits,
  });

  // Acquisition for storage: same bound as detection unless explicit full-original opt-in
  let storeMax = limits.maxBytes;
  if (opts.storeFullOriginal === true) {
    storeMax =
      opts.fullOriginalMaxBytes != null && Number.isFinite(opts.fullOriginalMaxBytes)
        ? Math.floor(opts.fullOriginalMaxBytes)
        : limits.maxBytes;
  }

  let artifact;
  let acquisition;
  if (typeof input === 'string' && opts.storeFullOriginal !== true && !detection.truncated) {
    artifact = fromText(input, { filename: opts.filename });
    acquisition = {
      originalByteLength: detection.originalByteLength,
      acquiredByteLength: detection.acquiredByteLength ?? detection.byteLength,
      truncated: false,
    };
  } else {
    const norm = await normalizeInput(input, { maxBytes: storeMax });
    acquisition = {
      originalByteLength: norm.originalByteLength ?? norm.bytes.byteLength,
      acquiredByteLength: norm.bytes.byteLength,
      truncated: Boolean(norm.truncatedAtAcquisition),
    };
    artifact = fromBytes(norm.bytes, {
      filename: opts.filename || norm.filename,
      mimeType: opts.mimeType || norm.declaredMime,
    });
  }

  const analysis = analyzeArtifact(artifact, { computeHash: true });
  if (analysis.sha256) {
    artifact = withHash(artifact, analysis.sha256);
  }

  artifact = {
    ...artifact,
    metadata: {
      ...artifact.metadata,
      detectionSchema: detection.schema,
      findingCount: detection.findings.length,
      detectionAlerts: detection.alerts.length,
      acquisition,
    },
  };

  const ledger = opts.ledger || getDefaultLedger();
  const record = await ledger.commit(artifact, {
    operationName: 'ingest',
    detectionRef: {
      schema: detection.schema,
      findingCount: detection.findings.length,
      alerts: detection.alerts,
      truncated: detection.truncated,
      analysisComplete: detection.analysisComplete,
    },
    sourceRepresentation: detection.sourceKind || 'bytes',
    destinationRepresentation: 'artifact',
  });

  return {
    artifact,
    analysis,
    detection: {
      ...detection,
      ledgerCommitted: true,
      originalRetrievableVia: 'artifact-ledger',
      storageStatus: record.storageStatus,
    },
    ledgerRecord: record,
    acquisition,
  };
}

export async function analyzePayload(artifact, options = {}) {
  const bytes = artifact.representations?.bytes;
  if (!bytes) {
    return {
      artifact,
      detection: {
        schema: 'babelcodec.detection.v1',
        byteLength: 0,
        findings: [],
        alerts: [{ level: 'warning', code: 'NO_BYTES', message: 'No bytes to analyze' }],
        originalPreserved: true,
        ledgerCommitted: false,
        originalRetrievableVia: null,
      },
      analysis: analyzeArtifact(artifact, { computeHash: false }),
    };
  }
  const detection = await detectInput(copyBytes(bytes), options);
  const analysis = analyzeArtifact(artifact, { computeHash: true });
  return { artifact, detection, analysis };
}
