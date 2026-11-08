import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRACT_VERSION,
  validateMediaJobManifest,
  createImageToSstvManifest,
  parseMediaJobManifest,
} from '../../src/media/integrations/index.js';

describe('media job manifest v1', () => {
  it('rejects wrong contract version', () => {
    const r = validateMediaJobManifest({
      contract_version: 99,
      job_id: 'x',
      created_at: new Date().toISOString(),
      source_application: 'BabelCodec',
      operation: 'image_to_sstv',
      asset: { filename: 'a.png', mime_type: 'image/png' },
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => /contract_version/.test(e)));
  });

  it('creates valid image_to_sstv manifest', () => {
    const m = createImageToSstvManifest({
      jobId: 'test-1',
      filename: 'source.png',
      width: 320,
      height: 240,
      mode: 'robot36',
      sampleRate: 48000,
      sha256: 'a'.repeat(64),
    });
    assert.equal(m.contract_version, CONTRACT_VERSION);
    assert.equal(m.operation, 'image_to_sstv');
    assert.equal(m.sstv.mode, 'robot36');
    assert.equal(m.audio.channels, 1);
    assert.equal(m.audio.encoding, 'pcm_s16le');
  });

  it('parses JSON and rejects garbage', () => {
    const bad = parseMediaJobManifest('{not json');
    assert.equal(bad.ok, false);
    const good = createImageToSstvManifest({ filename: 'x.png', mode: 'martin_m1' });
    const round = parseMediaJobManifest(JSON.stringify(good));
    assert.equal(round.ok, true);
    assert.equal(round.manifest.sstv.mode, 'martin_m1');
  });

  it('rejects invalid sstv mode and sample rates', () => {
    const r = validateMediaJobManifest({
      contract_version: 1,
      job_id: 'x',
      created_at: new Date().toISOString(),
      source_application: 'BabelCodec',
      operation: 'image_to_sstv',
      asset: { filename: 'a.png', mime_type: 'image/png' },
      sstv: { mode: 'scottie1', sample_rate_hz: 22050 },
    });
    assert.equal(r.ok, false);
  });
});
