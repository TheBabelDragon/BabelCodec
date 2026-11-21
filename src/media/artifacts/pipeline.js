/**
 * High-level pipeline: input → detect → artifact → hash → ledger.
 */

import { detectInput } from '../detection/index.js';
import { fromBytes, fromText } from './representations-service.js';
import { analyzeArtifact, withHash } from './index.js';
import { getDefaultLedger } from './ledger.js';
import { copyBytes } from './representations.js';

/**
 * Ingest arbitrary input: normalize, detect, create artifact, hash, ledger commit.
 *
 * @param {string|Uint8Array|ArrayBuffer|ArrayBufferView|File|Blob} input
 * @param {{
 *   typeHint?: string,
 *   filename?: string,
 *   mimeType?: string,
 *   ledger?: ReturnType<import('./ledger.js').createArtifactLedger>,
 *   detectOptions?: object,
 * }} [opts]
 */
export async function ingestInput(input, opts = {}) {
  const detection = await detectInput(input, {
    typeHint: opts.typeHint,
    ...(opts.detectOptions || {}),
  });

  // Prefer original bytes from normalization inside detect — re-normalize for artifact
  let artifact;
  if (typeof input === 'string') {
    artifact = fromText(input, { filename: opts.filename });
  } else {
    const { normalizeInput } = await import('../detection/detect.js');
    const norm = await normalizeInput(input);
    artifact = fromBytes(norm.bytes, {
      filename: opts.filename || norm.filename,
      mimeType: opts.mimeType || norm.declaredMime,
    });
  }

  const analysis = analyzeArtifact(artifact, { computeHash: true });
  if (analysis.sha256) {
    artifact = withHash(artifact, analysis.sha256);
  }

  // Attach detection to metadata (copy)
  artifact = {
    ...artifact,
    metadata: {
      ...artifact.metadata,
      detectionSchema: detection.schema,
      findingCount: detection.findings.length,
      detectionAlerts: detection.alerts.length,
    },
  };

  const ledger = opts.ledger || getDefaultLedger();
  const record = await ledger.commit(artifact, {
    operationName: 'ingest',
    detectionRef: {
      schema: detection.schema,
      findingCount: detection.findings.length,
      alerts: detection.alerts,
    },
    sourceRepresentation: detection.sourceKind || 'bytes',
    destinationRepresentation: 'artifact',
  });

  return {
    artifact,
    analysis,
    detection,
    ledgerRecord: record,
  };
}

/**
 * Analyze payload already held as an artifact.
 */
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
      },
      analysis: analyzeArtifact(artifact, { computeHash: false }),
    };
  }
  const detection = await detectInput(copyBytes(bytes), options);
  const analysis = analyzeArtifact(artifact, { computeHash: true });
  return { artifact, detection, analysis };
}
