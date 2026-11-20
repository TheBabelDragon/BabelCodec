# BabelCodec MCP Server

Independently deployable **Model Context Protocol (MCP)** adapter for [BabelCodec](https://github.com/TheBabelDragon/BabelCodec).

BabelCodec remains the authoritative Unicode and encoding engine. This service only exposes existing public APIs over Streamable HTTP (JSON-RPC MCP) so AI clients (including Grok / xAI connectors and other MCP hosts) can call them.

## Architecture

```
MCP Client  --HTTP POST /mcp-->  mcp-server (Node 20+)
                                      |
                                      v
                              BabelCodec public APIs
                         (src/text, src/scripts, src/core)
                                      |
                                      v
                         Rust Unicode Core (WASM)
```

- **Rust Unicode Core** is the sole Unicode semantic authority.
- **JavaScript** orchestrates I/O and presentation.
- No second normalization implementation.
- No silent JS fallback when WASM fails.
- No browser dependencies in this service.
- No coupling to GitHub Pages.

## Tools (v0.1)

| Tool | Purpose |
|------|---------|
| `babelcodec_capabilities` | Engine version, codecs, adapters, profiles, limitations, WASM readiness |
| `babelcodec_inspect_text` | Canonical form, code points, graphemes, scripts, diagnostics |
| `babelcodec_normalize_text` | Explicit NONE / NFC / NFD / NFKC / NFKD; source preserved |
| `babelcodec_detect_scripts` | Unicode Script property distribution (not language ID) |
| `babelcodec_inspect_hebrew` | Hebrew scalars, finals, niqqud, cantillation, optional gematria |
| `babelcodec_list_codecs` | Codec registry from core public API |

All successful responses use the envelope with schema `babelcodec.mcp.result.v1`.

Errors use stable codes: `INVALID_INPUT`, `UNSUPPORTED_OPERATION`, `ENGINE_NOT_READY`, `WASM_INITIALIZATION_FAILED`, `INTERNAL_ERROR`.

## Quick start (local)

```bash
npm run build:wasm
cd services/mcp-server
npm install
export MCP_TOKEN=dev-secret
node server.js
# -> http://127.0.0.1:8790/mcp
# -> http://127.0.0.1:8790/health
```

## Environment

| Variable | Default | Notes |
|----------|---------|-------|
| `MCP_HOST` | `127.0.0.1` | Bind address |
| `MCP_PORT` / `PORT` | `8790` | Listen port |
| `MCP_TOKEN` | _(empty)_ | Bearer token |
| `REQUIRE_AUTH` | `true` in production | Force auth |
| `MAX_BODY_BYTES` | `262144` | Request size limit |
| `MAX_TEXT_CHARS` | `100000` | Tool text limit |
| `RATE_LIMIT_PER_MIN` | `60` | Per-client |
| `CORS_ORIGINS` | _(empty)_ | Comma-separated |

Never commit real credentials.

## Grok / xAI connector

Custom MCP server you host:

```
URL:    https://<your-host>/mcp
Header: Authorization: Bearer <MCP_TOKEN>
```

This is **not** native X/Grok product integration.

## Tests

```bash
cd services/mcp-server && node --test test.js
# or: npm run test:mcp
```

## Future extension

Add tools to `TOOL_REGISTRY` in `tools.js` without changing the transport.
