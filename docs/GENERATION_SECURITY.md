# Generation Security

## Principles

BabelCodec remains offline-first. Image generation extends that model; it does not replace it.

- **No secrets in the client.** Provider API keys must never appear in shipped JavaScript.
- **Explicit remote disclosure.** UI labels mark remote providers. Users are not silently opted into network calls.
- **Local stays local.** Convert, Inspect, Create, Batch, Hex Inspector, and all encoding tools work with zero network.
- **Untrusted provider input.** Response bytes are size-limited and treated as data. Content types and dimensions are validated where practical.
- **No credential leakage.** Job metadata, logs, and error strings must not include tokens or authorization headers.

## Gateway pattern (implemented)

For authenticated remote generation, run the in-repo gateway:

```
Browser (BabelCodec)  →  services/generation-gateway  →  provider API
         (no secrets)     (holds keys via env)
```

Source: `services/generation-gateway/server.js`

Controls:

- `CORS_ORIGINS` allowlist
- `RATE_LIMIT_PER_MIN`
- `MAX_PROMPT_CHARS` / `MAX_DIMENSION`
- Rejection of open-proxy style fields (`url`, `target`, `fetch_url`, …)
- Optional `GATEWAY_TOKEN` (Bearer)
- `UPSTREAM_API_KEY` server-side only

Configure the browser with a gateway URL outside the repository (`localStorage` / `window.BabelCodecGenConfig`), never as a hardcoded secret.

See [IMAGE_GEN_SETUP.md](./IMAGE_GEN_SETUP.md) and [IMAGE_GEN_API.md](./IMAGE_GEN_API.md).

## Offline mode

When no gateway URL is configured (default), only the deterministic mock and procedural providers are available. All other BabelCodec functionality is unchanged.

## Threat notes

- Malformed provider payloads must not execute code (`eval`-free pipeline).
- Object URLs for previews are revoked on gallery refresh.
- Default asset size ceiling: 12 MiB per result in the orchestrator / gateway client.
- CI and unit tests assert client sources do not embed `sk-…` tokens or hardcoded API keys.
