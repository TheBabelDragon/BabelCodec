# Image Gen Architecture

## Separation of concerns

| Layer | Owner | Deploy |
|-------|-------|--------|
| Static workbench UI | BabelCodec GitHub Pages | `thebabeldragon.github.io/BabelCodec` |
| Offline providers | Browser (`mock`, `procedural`) | Shipped with static assets |
| Remote provider gateway | Operator-controlled Node service | Separate host (Fly, Railway, VPS, localhost) |
| Cloud image API | Third party | Called **only** from gateway |

BabelCodec encoding, Unicode Core, labs, and Image Studio Convert/Inspect remain independent of remote generation.

## Module map

```
src/media/generation/          # browser-side contract + orchestrator
src/media/generation/providers/
  mock.js
  procedural.js
  gateway.js                   # optional remote adapter (no secrets)
src/ui/generation-ui.js        # Generate mode UI
src/ui/studio-ui.js            # Image Studio shell
services/generation-gateway/   # optional backend
```

There is **no** parallel `image-gen/` tree; the existing `media/generation` package is the subsystem. Duplicating it would create two competing contracts.

## Job lifecycle

`QUEUED → PREPARING → GENERATING → INGESTING → PROCESSING → COMPLETE`  
Terminal: `FAILED`, `CANCELLED`

Orchestrator validates requests, optionally invokes TPU assist backends (default: honest unavailable), calls `provider.generate`, normalizes results, builds provenance.

## Normalized result shape

```js
{
  schemaVersion,
  resultId,
  variantIndex,
  asset: { bytes, mimeType, width, height, filename, createdAt },
  providerMetadata: { /* provider-specific, no secrets */ }
}
```

Gateway HTTP responses map into the same structure after the client receives image bytes.

## Security boundary

```
Browser  --(prompt, size, model id)-->  Gateway  --(API key)-->  Upstream
         <--(image bytes / error)-----           <--(image)----
```

- Keys exist only in gateway environment variables.
- Gateway rejects oversized prompts, unknown fields, and non-allowlisted CORS origins.
- Gateway is not an open URL proxy.

## Configuration surface (browser)

Runtime only (never committed secrets):

- `window.BabelCodecGenConfig = { gatewayUrl, enabled }`
- or `localStorage['babelcodec.gen.gatewayUrl']`

If unset, offline providers remain the only options and the UI states that clearly.
