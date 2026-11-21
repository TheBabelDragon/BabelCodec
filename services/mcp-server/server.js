/**
 * BabelCodec MCP Server — official SDK Streamable HTTP transport.
 * Adapter only. BabelCodec remains the Unicode authority.
 */

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';
import { config } from './config.js';
import {
  setCors,
  checkAuth,
  allowRate,
  clientKey,
  assertProductionAuthConfig,
} from './auth.js';
import { ErrorCode, httpErrorBody } from './errors.js';
import {
  TOOL_HANDLERS,
  ensureEngine,
  isEngineReady,
  getEngineVersion,
} from './tools.js';

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

function toolResult(payload) {
  const isErr = payload && payload.success === false;
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
    isError: !!isErr,
  };
}

/** Build a fresh McpServer per request (stateless). */
export function createBabelMcpServer() {
  const server = new McpServer({
    name: config.SERVER_NAME,
    version: config.SERVER_VERSION,
  });

  server.registerTool(
    'babelcodec_capabilities',
    {
      title: 'BabelCodec capabilities',
      description:
        'Return actual supported BabelCodec capabilities: engine version, codecs, script adapters, normalization profiles, inspection ops, WASM readiness, and known limitations. Does not provide natural-language translation.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => toolResult(await TOOL_HANDLERS.babelcodec_capabilities()),
  );

  server.registerTool(
    'babelcodec_inspect_text',
    {
      title: 'Inspect text',
      description:
        'Inspect text via BabelCodec toCanonical(): code points, graphemes, primary/mixed scripts, normalization state, engine identity. Source is always preserved.',
      inputSchema: z.object({
        text: z.string().describe('Text to inspect'),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => toolResult(await TOOL_HANDLERS.babelcodec_inspect_text(args)),
  );

  server.registerTool(
    'babelcodec_normalize_text',
    {
      title: 'Normalize text',
      description:
        'Normalize text with an explicit profile (NONE, NFC, NFD, NFKC, NFKD) using the Rust-backed engine. Original source is never silently replaced.',
      inputSchema: z.object({
        text: z.string().describe('Text to normalize'),
        profile: z
          .enum(['NONE', 'NFC', 'NFD', 'NFKC', 'NFKD'])
          .optional()
          .describe('Normalization profile'),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => toolResult(await TOOL_HANDLERS.babelcodec_normalize_text(args)),
  );

  server.registerTool(
    'babelcodec_detect_scripts',
    {
      title: 'Detect scripts',
      description:
        'Detect Unicode Script property distribution (primary script, distribution, mixed status). Not language identification and not translation.',
      inputSchema: z.object({
        text: z.string().describe('Text to analyze'),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => toolResult(await TOOL_HANDLERS.babelcodec_detect_scripts(args)),
  );

  server.registerTool(
    'babelcodec_inspect_hebrew',
    {
      title: 'Inspect Hebrew',
      description:
        'Hebrew script adapter: detection, scalar categories (letters, finals, niqqud, cantillation), optional standard gematria, canonical form.',
      inputSchema: z.object({
        text: z.string().describe('Text to inspect for Hebrew'),
        include_gematria: z
          .boolean()
          .optional()
          .describe('Include standard gematria analysis'),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => toolResult(await TOOL_HANDLERS.babelcodec_inspect_hebrew(args)),
  );

  server.registerTool(
    'babelcodec_list_codecs',
    {
      title: 'List codecs',
      description:
        'Return the BabelCodec codec registry and supported encoding operations from the public API. Fails explicitly if the registry cannot load.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => toolResult(await TOOL_HANDLERS.babelcodec_list_codecs()),
  );

  return server;
}

const mcpHandler = createMcpHandler(createBabelMcpServer);
const nodeMcpHandler = toNodeHandler(mcpHandler);

export function createServer() {
  return http.createServer(async (req, res) => {
    setCors(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const host = req.headers.host || `localhost:${config.PORT}`;
    let url;
    try {
      url = new URL(req.url || '/', `http://${host}`);
    } catch {
      return json(res, 400, httpErrorBody(ErrorCode.INVALID_INPUT, 'bad request url'));
    }

    const path = url.pathname;

    try {
      if (req.method === 'GET' && path === config.HEALTH_PATH) {
        return json(res, 200, {
          ok: true,
          service: config.SERVER_NAME,
          version: config.SERVER_VERSION,
          engine_ready: isEngineReady(),
          engine_version: getEngineVersion(),
          auth_required: config.REQUIRE_AUTH || Boolean(config.MCP_TOKEN),
          transport: 'streamable-http',
          sdk: '@modelcontextprotocol/server',
        });
      }

      if (path === config.MCP_PATH || path === `${config.MCP_PATH}/`) {
        const key = clientKey(req);
        if (!allowRate(key)) {
          return json(
            res,
            429,
            httpErrorBody(ErrorCode.RATE_LIMIT, 'rate limit exceeded', 429),
          );
        }
        if (!checkAuth(req)) {
          return json(
            res,
            401,
            httpErrorBody(ErrorCode.UNAUTHORIZED, 'unauthorized', 401),
          );
        }

        return void nodeMcpHandler(req, res);
      }

      return json(res, 404, httpErrorBody('NOT_FOUND', 'not found', 404));
    } catch {
      return json(
        res,
        500,
        httpErrorBody(ErrorCode.INTERNAL_ERROR, 'internal error', 500),
      );
    }
  });
}

async function tryWarmEngine() {
  try {
    await ensureEngine();
    console.log(
      `[babelcodec-mcp] Unicode engine ready (version=${getEngineVersion() || 'unknown'})`,
    );
  } catch (e) {
    console.warn(
      `[babelcodec-mcp] Unicode engine not ready at startup: ${e.message}. Tools will surface WASM_INITIALIZATION_FAILED until pkg/ is available.`,
    );
  }
}

const isMain =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const authGate = assertProductionAuthConfig();
  if (!authGate.ok) {
    console.error(`[babelcodec-mcp] FATAL: ${authGate.message}`);
    process.exit(1);
  }

  const server = createServer();
  server.listen(config.PORT, config.HOST, async () => {
    console.log(
      `[babelcodec-mcp] ${config.SERVER_NAME} v${config.SERVER_VERSION} listening on http://${config.HOST}:${config.PORT}${config.MCP_PATH}`,
    );
    console.log(
      `[babelcodec-mcp] health=http://${config.HOST}:${config.PORT}${config.HEALTH_PATH} auth=${config.REQUIRE_AUTH || Boolean(config.MCP_TOKEN)} transport=streamable-http`,
    );
    await tryWarmEngine();
  });

  const shutdown = () => {
    console.log('[babelcodec-mcp] shutting down…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export { mcpHandler };
