# Image Gen API

## Browser package

```js
import {
  ensureGenerationDefaults,
  registerProvider,
  submitGeneration,
  awaitJob,
  cancelGeneration,
  listJobs,
  discoverProviderCapabilities,
  createGatewayProvider,
  getGatewayConfig,
} from 'babelcodec/media/generation';
```

### ensureGenerationDefaults()

Registers `mock`, `procedural`, and optional `gateway` when a gateway URL is configured. Registers TPU sentinel `none`.

### submitGeneration(request, { onProgress })

Validated fields include: `prompt`, `negativePrompt?`, `providerId`, `modelId?`, `width`, `height`, `variants`, `seed?`, `quality?`, `useTpu?`.

### Provider contract

See [GENERATION_PROVIDERS.md](./GENERATION_PROVIDERS.md).

## Gateway HTTP API

Base URL: operator-defined (example `http://127.0.0.1:8787`).

### `GET /health`

```json
{ "ok": true, "mode": "synthetic" | "upstream", "version": "1" }
```

### `GET /v1/capabilities`

```json
{
  "textToImage": true,
  "models": [{ "id": "default", "name": "Default" }],
  "maxDimension": 2048,
  "requiresAuth": false
}
```

### `POST /v1/generate`

Request JSON:

```json
{
  "prompt": "string",
  "negative_prompt": "string",
  "width": 512,
  "height": 512,
  "seed": "string",
  "model": "default"
}
```

Success: `200` with `Content-Type: image/png` (or upstream type) and body = image bytes.  
Headers may include `X-Generation-Id`.

Errors: `400` validation, `401` auth, `429` rate limit, `502` upstream, `504` timeout — JSON `{ "error": "...", "code": "..." }`.

### Not supported

- Arbitrary URL fetch / open proxy
- GET-based generation with secrets in query strings
- Unbounded prompt or dimension sizes
