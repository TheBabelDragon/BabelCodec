# Image Gen Setup

## Offline (default — GitHub Pages)

No configuration required.

1. Open https://thebabeldragon.github.io/BabelCodec/
2. Tab **Image Studio** → mode **Generate**
3. Select provider **Procedural (offline)** or **Mock (offline)**
4. Enter prompt (and optional seed for exact procedural replay) → **Generate**

## Optional remote gateway

### 1. Configure environment

Copy `.env.example` values into your host environment (never commit real secrets):

```bash
cd services/generation-gateway
cp ../../.env.example .env   # edit locally; do not commit
npm install                  # zero deps beyond Node 18+
node server.js
```

Key variables:

| Variable | Purpose |
|----------|---------|
| `PORT` | Listen port (default `8787`) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `GATEWAY_TOKEN` | Optional shared secret; browser sends `Authorization: Bearer …` only if you choose to store a **non-provider** lab token client-side (prefer network isolation instead) |
| `UPSTREAM_URL` | Optional third-party generate endpoint |
| `UPSTREAM_API_KEY` | Server-side only |
| `RATE_LIMIT_PER_MIN` | Default `30` |
| `MAX_PROMPT_CHARS` | Default `2000` |

Without `UPSTREAM_URL`, the gateway runs in **local synthetic** mode (deterministic PNG) so you can validate the boundary end-to-end without paying a cloud provider.

### 2. Point the browser at the gateway

In the browser console on the BabelCodec origin, or via a small bootstrap snippet you control:

```js
localStorage.setItem('babelcodec.gen.gatewayUrl', 'http://127.0.0.1:8787');
location.reload();
```

Or:

```html
<script>
  window.BabelCodecGenConfig = { gatewayUrl: 'https://gen.example.com', enabled: true };
</script>
```

The **Gateway (remote)** provider appears when a URL is configured. It never embeds cloud API keys.

### 3. CORS

Include your Pages origin in `CORS_ORIGINS`, e.g.:

```
CORS_ORIGINS=https://thebabeldragon.github.io,http://127.0.0.1:5500,http://localhost:5500
```

## Production notes

- Deploy gateway **separately** from GitHub Pages.
- Terminate TLS at your edge.
- Prefer network allowlists over long-lived browser tokens.
- Monitor rate-limit responses (`429`).

## Working vs planned

| Feature | Status |
|---------|--------|
| Offline mock + procedural | Working |
| Image Studio Generate UI | Working |
| SSTV handoff manifest | Working |
| Self-hosted gateway (synthetic) | Working (this branch) |
| Self-hosted gateway → real cloud API | Working when `UPSTREAM_*` set by operator |
| Hosted multi-tenant BabelCodec cloud | Not provided |
