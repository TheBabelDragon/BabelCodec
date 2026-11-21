# BabelCodec MCP Server

Independently deployable **Model Context Protocol (MCP)** adapter for [BabelCodec](https://github.com/TheBabelDragon/BabelCodec).

Uses the **official** `@modelcontextprotocol/server` + `@modelcontextprotocol/node` **Streamable HTTP** transport (`createMcpHandler` + `toNodeHandler`). BabelCodec remains the sole Unicode authority.

## Architecture

```
MCP Client  --Streamable HTTP /mcp-->  mcp-server (Node ≥20)
                                            |
                                            v
                                    BabelCodec public APIs
                               (src/text, src/scripts, src/core)
                                            |
                                            v
                                   Rust Unicode Core (WASM)
```

- No second normalization implementation
- No silent JS fallback when WASM fails
- No browser / GitHub Pages coupling
- Stateless per-request server factory

## Tools (v0.1.1)

| Tool | Purpose |
|------|---------|
| `babelcodec_capabilities` | Engine readiness, codecs, adapters, profiles, limitations |
| `babelcodec_inspect_text` | Canonical form, code points, graphemes, scripts |
| `babelcodec_normalize_text` | NONE / NFC / NFD / NFKC / NFKD; source preserved |
| `babelcodec_detect_scripts` | Unicode Script property (not language ID) |
| `babelcodec_inspect_hebrew` | Hebrew scalars, niqqud, cantillation, optional gematria |
| `babelcodec_list_codecs` | Real codec registry only — explicit failure if unavailable |

Success envelope: `schema: babelcodec.mcp.result.v1`.  
Errors: `INVALID_INPUT`, `UNSUPPORTED_OPERATION`, `ENGINE_NOT_READY`, `WASM_INITIALIZATION_FAILED`, `INTERNAL_ERROR`.

## Quick start

```bash
npm run build:wasm          # monorepo root — required for real Unicode results
cd services/mcp-server
npm ci                      # or npm install
export MCP_TOKEN=dev-secret # optional in development
node server.js
# http://127.0.0.1:8790/mcp
# http://127.0.0.1:8790/health
```

## Environment

| Variable | Default | Notes |
|----------|---------|-------|
| `MCP_HOST` | `127.0.0.1` | Bind address |
| `MCP_PORT` / `PORT` | `8790` | Listen port |
| `MCP_TOKEN` | _(empty)_ | Bearer token |
| `REQUIRE_AUTH` | `true` in production | Force auth |
| `TRUSTED_PROXIES` | _(empty)_ | IPs allowed to supply `X-Forwarded-For` |
| `MAX_BODY_BYTES` | `262144` | Request size limit |
| `MAX_TEXT_CHARS` | `100000` | Tool text limit |
| `RATE_LIMIT_PER_MIN` | `60` | Per client key |
| `CORS_ORIGINS` | _(empty)_ | Comma-separated; empty = no browser CORS |

Never commit real credentials.

## Security

- Bearer auth (`MCP_TOKEN` / `REQUIRE_AUTH`)
- **`X-Forwarded-For` is ignored** unless the direct peer is listed in `TRUSTED_PROXIES`
- Rate limiting, body/text limits, explicit CORS allowlist
- Production refuses to start without `MCP_TOKEN` when auth is required
- Error bodies never include stacks or secrets

## Tests

```bash
npm test              # unit + official @modelcontextprotocol/client interop
npm run test:unit
npm run test:interop
# from monorepo root after npm install in this directory:
npm run test:mcp
```

Interop tests exercise initialize, tool discovery, tool invocation, structured content, and invalid arguments via the official MCP client — not hand-rolled JSON-RPC.

## Grok / custom MCP connector

```
URL:    https://<your-host>/mcp
Header: Authorization: Bearer <MCP_TOKEN>
```

This is a **custom** MCP server you host. It is not a built-in X/Grok product integration.

## Known limitations

- WASM (`pkg/`) must be built and loadable by the Node process
- Script detection is Unicode Script property, not language identification
- Non-Hebrew adapters are detection stubs
- No natural-language translation is provided or claimed

## Future extension

Add handlers to `TOOL_HANDLERS` in `tools.js` and register them in `createBabelMcpServer()` in `server.js`.
