# BabelCodec MCP Server Integration

**Status:** v0.1.1  
**Service path:** `services/mcp-server/`  
**Transport:** Official MCP SDK Streamable HTTP (`createMcpHandler` + `toNodeHandler`)  
**Authority:** BabelCodec Rust Unicode Core + existing public JS APIs

## Architecture

The MCP server is an **adapter**. It does not reimplement Unicode algorithms. It calls:

- `toCanonical()` / `applyNormalization()` / `detectScripts()` from `babelcodec/text`
- `hebrewAdapter` from `babelcodec/scripts`
- codec registry from `babelcodec` / `babelcodec/core`

When WASM initialization fails, tools return `WASM_INITIALIZATION_FAILED` or `ENGINE_NOT_READY`. There is no silent JavaScript fallback. Codec registry failures are explicit errors (no fabricated lists).

## Tools

See [services/mcp-server/README.md](../../services/mcp-server/README.md).

Success envelope:

```json
{
  "schema": "babelcodec.mcp.result.v1",
  "success": true,
  "tool": "babelcodec_inspect_text",
  "engine": "rust-wasm",
  "engine_version": "…",
  "result": {},
  "diagnostics": []
}
```

## Security

- Bearer auth (`MCP_TOKEN`, `REQUIRE_AUTH`)
- `X-Forwarded-For` honored only for peers in `TRUSTED_PROXIES`
- Body/text limits and per-client rate limiting
- Explicit CORS origin allowlist (empty default)
- No request-body logging of secrets; no stack traces in client errors

## Deployment

Independent of GitHub Pages:

```bash
npm run build:wasm
cd services/mcp-server
npm ci
export NODE_ENV=production
export MCP_TOKEN=<strong-secret>
export MCP_HOST=0.0.0.0
export MCP_PORT=8790
node server.js
```

- Health: `GET /health`
- MCP: Streamable HTTP on `/mcp` via the official SDK handler

## Grok connection

Configure a **custom MCP connector** with the server URL and Bearer token. Distinct from any built-in X Grok surface.

## Verification

```bash
cd services/mcp-server && npm test
```

Includes official `@modelcontextprotocol/client` interop (initialize, list tools, call tools, structured content, invalid args).

## Future extension

Register new tools in `createBabelMcpServer()` (`server.js`) backed by handlers in `TOOL_HANDLERS` (`tools.js`). External LLMs must not substitute for BabelCodec’s engine.
