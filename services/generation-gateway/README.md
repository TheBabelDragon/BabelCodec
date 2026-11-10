# BabelCodec Generation Gateway

Separately deployable HTTP gateway for remote image generation.

## Quick start

```bash
export CORS_ORIGINS=https://thebabeldragon.github.io,http://127.0.0.1:5500
node server.js
```

Synthetic mode (no `UPSTREAM_URL`) returns deterministic PNGs — use this to verify CORS and the browser adapter without cloud keys.

See [../../docs/IMAGE_GEN_SETUP.md](../../docs/IMAGE_GEN_SETUP.md).
