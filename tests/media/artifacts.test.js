/**
 * Universal Artifact Pipeline — unit tests
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createArtifact,
  createRevision,
  snapshotArtifact,
  withHash,
  SCHEMA,
  fromText,
  fromBytes,
  ensureTextRepresentation,
  analyzeArtifact,
  compatibleDestinations,
  routeTo,
  DESTINATIONS,
  createHashedArtifactFromBytes,
  createHashedArtifactFromText,
  bytesToHexText,
  hexTextToBytes,
  bytesToBase64Text,
  base64TextToBytes,
} from '../../src/media/artifacts/index.js';

import { sha256 } from '../../src/sha256/index.js';

describe('artifact model', () => {
  it('creates with stable schema and revision 1', () => {
    const a = createArtifact({
      source: { kind: 'bytes', filename: 'x.bin' },
      representations: { bytes: new Uint8Array([1, 2, 3]) },
    });
    assert.equal(a.schema, SCHEMA);
    assert.equal(a.revision, 1);
    assert.ok(a.id);
    assert.equal(a.representations.bytes.byteLength, 3);
    assert.equal(a.provenance.operation, 'import');
  });

  it('snapshot is defensive — mutating snapshot does not affect original', () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const a = createArtifact({
      representations: { bytes },
    });
    const snap = snapshotArtifact(a);
    snap.representations.bytes[0] = 0;
    assert.equal(a.representations.bytes[0], 9);
    assert.equal(snap.representations.bytes[0], 0);
  });

  it('createRevision preserves id and increments revision', () => {
    const a = fromText('hello');
    const r2 = createRevision(a, {
      representations: {
        bytes: new Uint8Array([1]),
        text: null,
        image: null,
      },
      operation: 'crop',
    });
    assert.equal(r2.id, a.id);
    assert.equal(r2.revision, 2);
    assert.equal(r2.provenance.parentArtifactId, a.id);
    assert.equal(r2.provenance.parentRevision, 1);
    assert.equal(r2.provenance.operation, 'crop');
    assert.equal(a.revision, 1);
  });

  it('withHash sets digest without mutating source', () => {
    const a = fromText('x');
    const h = withHash(a, 'abc');
    assert.equal(h.hashes.sha256, 'abc');
    assert.equal(a.hashes.sha256, null);
  });
});

describe('representations', () => {
  it('fromText provides UTF-8 bytes and text', () => {
    const a = fromText('café');
    assert.ok(a.representations.bytes);
    assert.equal(a.representations.text, 'café');
    assert.ok(a.representations.bytes.byteLength > 4); // multi-byte é
  });

  it('fromBytes detects PNG magic', () => {
    // minimal PNG signature
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const a = fromBytes(png, { filename: 't.png' });
    assert.equal(a.representations.image?.format, 'png');
    assert.equal(a.metadata.detectedFormat, 'png');
  });

  it('hex round trip', () => {
    const b = new Uint8Array([0xde, 0xad]);
    const hex = bytesToHexText(b);
    const back = hexTextToBytes(hex);
    assert.deepEqual([...back], [0xde, 0xad]);
  });

  it('base64 round trip', () => {
    const b = new Uint8Array([1, 2, 3, 4]);
    const b64 = bytesToBase64Text(b);
    const back = base64TextToBytes(b64);
    assert.deepEqual([...back], [1, 2, 3, 4]);
  });

  it('ensureTextRepresentation does not erase bytes', () => {
    const a = fromBytes(new TextEncoder().encode('hi'));
    assert.equal(a.representations.text, null);
    const withText = ensureTextRepresentation(a);
    assert.equal(withText.representations.text, 'hi');
    assert.ok(withText.representations.bytes);
    assert.equal(withText.representations.bytes.byteLength, 2);
  });
});

describe('analysis', () => {
  it('reports byte length and sha256 without mutating', async () => {
    const payload = new Uint8Array([0x00, 0x01, 0x02]);
    const a = fromBytes(payload);
    const before = a.representations.bytes[0];
    const analysis = analyzeArtifact(a, { computeHash: true });
    assert.equal(analysis.byteLength, 3);
    assert.ok(analysis.sha256);
    assert.equal(analysis.sha256, sha256(payload).hex);
    assert.equal(a.representations.bytes[0], before);
    assert.equal(a.hashes.sha256, null); // original not mutated
  });

  it('identical bytes produce identical digests', async () => {
    const b = new Uint8Array([7, 7, 7]);
    const { analysis: a1 } = await createHashedArtifactFromBytes(b);
    const { analysis: a2 } = await createHashedArtifactFromBytes(new Uint8Array(b));
    assert.equal(a1.sha256, a2.sha256);
  });

  it('different revisions remain independently identifiable', () => {
    const a = fromText('v1');
    const r2 = createRevision(a, {
      representations: {
        bytes: new TextEncoder().encode('v2'),
        text: 'v2',
        image: null,
      },
      operation: 'edit',
    });
    const an1 = analyzeArtifact(a, { computeHash: true });
    const an2 = analyzeArtifact(r2, { computeHash: true });
    assert.notEqual(an1.sha256, an2.sha256);
    assert.equal(an1.revision, 1);
    assert.equal(an2.revision, 2);
    assert.equal(an1.artifactId, an2.artifactId);
  });
});

describe('destination router', () => {
  it('lists known destinations', () => {
    assert.ok(DESTINATIONS.length >= 5);
    assert.ok(DESTINATIONS.some((d) => d.id === 'image-studio'));
  });

  it('routes bytes to hex-inspector', () => {
    const a = fromBytes(new Uint8Array([1]));
    const result = routeTo(a, 'hex-inspector');
    assert.equal(result.ok, true);
    assert.ok(result.bytes);
    assert.equal(result.artifactId, a.id);
    assert.equal(result.revision, a.revision);
  });

  it('rejects incompatible destination with diagnostics', () => {
    // text-only artifact without ensuring bytes — still has bytes from fromText
    const a = createArtifact({
      source: { kind: 'text' },
      representations: { text: 'only', bytes: null, image: null },
    });
    const result = routeTo(a, 'hex-inspector');
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.length);
  });

  it('compatibleDestinations includes image-studio for PNG', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const a = fromBytes(png);
    const list = compatibleDestinations(a);
    assert.ok(list.some((d) => d.id === 'image-studio'));
    assert.ok(list.some((d) => d.id === 'sha256'));
  });

  it('preserves provenance on route', () => {
    const a = fromText('p');
    const r = routeTo(a, 'converter');
    assert.equal(r.ok, true);
    assert.equal(r.provenance.operation, 'import');
  });
});

describe('hashed helpers', () => {
  it('createHashedArtifactFromText', async () => {
    const { artifact, analysis } = await createHashedArtifactFromText('BabelCodec');
    assert.ok(artifact.hashes.sha256);
    assert.equal(artifact.hashes.sha256, analysis.sha256);
  });
});
