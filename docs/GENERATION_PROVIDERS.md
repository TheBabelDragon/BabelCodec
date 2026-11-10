# Generation Providers

## Built-in

| ID | Network | Notes |
|----|---------|-------|
| `mock` | No | Deterministic solid-color PNG; CI and offline demos |
| `procedural` | No | Seed-driven real images (fBm, Truchet, Gray-Scott); byte-identical for same prompt+seed |
| `gateway` | Yes | Optional remote adapter; registered only when a gateway URL is configured at runtime |

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

## Gateway (`gateway`) — optional remote

Implemented in `src/media/generation/providers/gateway.js` against `services/generation-gateway`.

- **No cloud API keys in the browser.** Only a gateway base URL (and optional lab bearer) from runtime config.
- **Config sources:** `window.BabelCodecGenConfig.gatewayUrl` or `localStorage['babelcodec.gen.gatewayUrl']`.
- **Registration:** `ensureGenerationDefaults()` registers `gateway` only when a URL is configured.
- **Capabilities:** `GET {url}/v1/capabilities` — reports `available: false` with status `unconfigured` / `unreachable` when appropriate.
- **Generate:** `POST {url}/v1/generate` → image bytes; size-capped client-side (12 MiB).

```js
import { getGatewayConfig, setGatewayConfig, createGatewayProvider } from 'babelcodec/media/generation';

setGatewayConfig({ url: 'http://127.0.0.1:8787' });
createGatewayProvider(); // or ensureGenerationDefaults() after setting URL
```

Deploy and environment variables: [IMAGE_GEN_SETUP.md](./IMAGE_GEN_SETUP.md). HTTP contract: [IMAGE_GEN_API.md](./IMAGE_GEN_API.md).

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

**Remote via shipped gateway client:**

```js
localStorage.setItem('babelcodec.gen.gatewayUrl', 'https://gen.example.com');
// reload app → ensureGenerationDefaults() registers gateway
```

Never place provider API keys in this file or in any client bundle.
