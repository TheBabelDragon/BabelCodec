# Generation Providers

## Built-in

| ID | Network | Notes |
|----|---------|-------|
| `mock` | No | Deterministic solid-color PNG; CI and offline demos |
| `procedural` | No | Seed-driven real images (fBm, Truchet, Gray-Scott); byte-identical for same prompt+seed |

## Procedural (`procedural`) — v0.11.0

- **Digest:** SHA-256 of `` `${prompt}\n${seed}` `` via `babelcodec/sha256`.
- **Params:** `digestToParams(digest)` → generator choice, hues, frequency, octaves, symmetry, warp, tile size, Gray-Scott feed/kill/steps.
- **Generators:**
  - `fbm` — value-noise fractional Brownian motion + palette ramp
  - `truchet` — quarter-circle Truchet tiles
  - `gray_scott` — reaction-diffusion with capped step count
- **PRNG:** `sfc32` seeded from digest (no `Math.random`).
- **Sizes:** arbitrary width/height up to 2048; SSTV presets Martin M1 `320×256`, Robot 36 `320×240`.
- **Provenance:** `digestHex`, `params`, `generator`, `seed`, `providerVersion` on job results / provenance.

```js
import {
  createProceduralProvider,
  digestToParams,
  promptSeedDigest,
  generateProceduralImage,
} from 'babelcodec/media/generation';

createProceduralProvider(); // auto-registered by ensureGenerationDefaults()

const { digest, hex } = promptSeedDigest('prompt', 'seed');
const params = digestToParams(digest);
const img = await generateProceduralImage({
  prompt: 'prompt',
  seed: 'seed',
  width: 320,
  height: 256,
});
```

## Contract

```js
{
  id: string,
  displayName?: string,
  requiresNetwork?: boolean,
  getCapabilities?: () => Promise<object> | object,
  generate: (request, { signal, onProgress }) => Promise<{
    providerJobId?: string,
    results: Array<{
      variantIndex: number,
      asset: {
        bytes: Uint8Array,
        mimeType: string,
        width?: number,
        height?: number,
        filename?: string,
      },
      providerMetadata?: object,
    }>,
  }>,
  poll?: (providerJobId) => Promise<object>,
  cancel?: (providerJobId) => Promise<void>,
}
```

Register with `registerProvider(provider)` before opening Image Studio Generate, or at app init via `ensureGenerationDefaults()`.

## Configuration examples

**Offline only (default):** mock + procedural; no configuration required.

**Remote via gateway (sketch):**

```js
registerProvider({
  id: 'gateway',
  displayName: 'Lab Gateway',
  requiresNetwork: true,
  async generate(request, { signal, onProgress }) {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: request.prompt,
        width: request.width,
        height: request.height,
      }),
      signal,
    });
    if (!res.ok) throw new Error('gateway error ' + res.status);
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      results: [{
        variantIndex: 0,
        asset: { bytes: buf, mimeType: res.headers.get('content-type') || 'image/png' },
      }],
    };
  },
});
```

Never place provider API keys in this file or in any client bundle.
