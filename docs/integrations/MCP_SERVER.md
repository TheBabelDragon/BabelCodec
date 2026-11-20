# BabelCodec MCP Server Integration

**Status:** v0.1  
**Service path:** `services/mcp-server/`  
**Transport:** HTTP JSON-RPC (MCP tools/list, tools/call, initialize) — Streamable HTTP compatible JSON response mode  
**Authority:** BabelCodec Rust Unicode Core + existing public JS APIs

## Architecture

The MCP server is an **adapter**. It does not reimplement Unicode algorithms, normalization, or script detection. It calls:

- `toCanonical()` / `applyNormalization()` / `detectScripts()` from `babelcodec/text`
- `hebrewAdapter` from `babelcodec/scripts`
- codec registry from `babelcodec` / `babelcodec/core`

When WASM initialization fails, tools return `WASM_INITIALIZATION_FAILED` or `ENGINE_NOT_READY`. There is no silent JavaScript fallback.

## Available tools

See [services/mcp-server/README.md](../../services/mcp-server/README.md) for the full table and input/output contracts.

Response envelope (success):

```json
{
  "schema": "babelcodec.mcp.result.v1",
  "success": true,
  "tool": "babelcodec_inspect_text",
  "engine": "rust-wasm",
  "engine_version": "…",
  "result": { },
  "diagnostics": []
}
```

## Security

- Optional Bearer auth in development; mandatory configurable auth in production.
- Request-size and input-length limits.
- Per-client rate limiting.
- Explicit CORS origin allowlist (empty by default).
- No arbitrary URL fetch, no dynamic code execution, no request-body logging by default.
- Error bodies never include stack traces or environment values.

## Deployment

Independent of GitHub Pages. Example:

```bash
npm run build:wasm
cd services/mcp-server
export NODE_ENV=production
export MCP_TOKEN=<strong-secret>
export MCP_HOST=0.0.0.0
export MCP_PORT=8790
node server.js
```

Health: `GET /health`  
MCP: `POST /mcp`

## Grok connection

Configure a **custom MCP connector** with the server URL and Bearer token. This is distinct from any built-in X Grok surface. Native product integration is out of scope until verified.

## Known limitations

- WASM assets (`pkg/`) must be built and loadable by the Node process.
- Script detection is Unicode Script property, not language identification.
- Non-Hebrew script adapters are detection stubs.
- No natural-language translation is offered or claimed.
- Official MCP TypeScript SDK packages are optional; a minimal JSON-RPC path is implemented so the service runs without them.

## Future extension points

Tool registry is data-driven (`TOOL_REGISTRY` in `tools.js`). Future capabilities register as new tools with explicit capability flags. External LLMs must not substitute for BabelCodec’s engine.
