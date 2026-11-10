# Image Generation Pipeline

TPU-aware, provider-independent image generation integrated into BabelCodec Image Studio.

**Version:** 0.11.0

## Architecture

Four layers:

1. **TPU Compute Adapter** (`src/media/generation/capabilities.js`)  
   Hardware-neutral capability interface. Backends register explicitly and report health. Browser hardware detection is never treated as proof of TPU availability. Image generation itself is not assumed to run on a user TPU.

2. **Image Generation Provider Adapter** (`src/media/generation/providers/`)  
   Provider-independent `generate()` interface with optional capability discovery, polling, and cancellation. New providers register without modifying Image Studio UI.

3. **Generation Orchestrator** (`src/media/generation/orchestrator.js`)  
   Job lifecycle: `QUEUED → PREPARING → GENERATING → INGESTING → PROCESSING → COMPLETE` (plus `FAILED` / `CANCELLED`). Optional TPU prompt assist, retry without duplicating completed work, in-memory history.

4. **Image Studio Integration** (`src/ui/generation-ui.js`)  
   First-class **Generate** mode: prompt editor, provider/model selectors, TPU status, dimensions (including SSTV presets), variants, progress, gallery, history, job details (digest/params), send-to-studio, download, Export SSTV handoff.

## Offline defaults

- **Mock** provider (`mock`) — deterministic solid-color PNG for CI and quick demos.
- **Procedural** provider (`procedural`) — real offline images from seed-driven generators (fBm, Truchet, Gray-Scott). Same `prompt` + `seed` + size → byte-identical output.
- TPU sentinel (`none`) reports unavailable honestly.
- No network requests unless a remote provider is explicitly registered and selected.

## Procedural determinism

1. Digest material: `` `${prompt}\n${seed}` ``
2. SHA-256 via BabelCodec `babelcodec/sha256`
3. `digestToParams(digest)` maps bytes → generator, palette, frequency, symmetry, RD steps, etc.
4. Seeded `sfc32` PRNG (no `Math.random` / `Date`)
5. Pure generators write RGBA; PNG encode is deterministic

Provenance on completed jobs records `digestHex`, `generator`, `params`, `seed`, and `providerVersion` so any image can be reproduced from its manifest metadata.

## Security

- No API keys in client-side JavaScript.
- No secrets in the repository.
- Provider responses are treated as untrusted (size limits, content checks).
- Max dimension 2048; orchestrator soft limit 12 MiB per asset.
- Existing offline Image Studio features remain fully usable when generation is not configured.

See [GENERATION_SECURITY.md](./GENERATION_SECURITY.md).

## Adding a provider

```js
import { registerProvider } from 'babelcodec/media/generation';

registerProvider({
  id: 'my-provider',
  displayName: 'My Provider',
  requiresNetwork: true,
  async getCapabilities() {
    return {
      textToImage: true,
      imageToImage: false,
      models: [{ id: 'v1', name: 'Model v1' }],
    };
  },
  async generate(request, { signal, onProgress }) {
    // return { providerJobId, results: [{ asset: { bytes, mimeType, width, height } }] }
  },
});
```

Remote providers should call a **configurable backend gateway** you control; never embed credentials in the browser bundle.

## Job provenance

Each completed job retains prompt, provider/model ids, timestamps, dimensions, original asset hash, and error information when present. Procedural jobs additionally retain digest, generator name, and params. Metadata is not invented when a backend omits it.

## Tests

```bash
npm run test:media
# or
node --test tests/media/generation.test.js tests/media/procedural-generation.test.js
```

Mock and procedural only — no paid API calls in CI.
