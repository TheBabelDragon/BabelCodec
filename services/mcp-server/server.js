/**
 * BabelCodec MCP Server — Streamable HTTP transport (JSON response mode).
 *
 * Adapter only: BabelCodec (Rust WASM Unicode core + JS orchestration) remains
 * the sole semantic authority. Independently deployable from GitHub Pages.
 */

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import {
  setCors,
  readBody,
  checkAuth,
  allowRate,
  clientKey,
} from './auth.js';
import { ErrorCode, httpErrorBody } from './errors.js';
import {
  TOOL_REGISTRY,
  ensureEngine,
  isEngineReady,
  getEngineVersion,
} from './tools.js';

const toolsByName = new Map(TOOL_REGISTRY.map((t) => [t.name, t]));

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

/** Minimal MCP JSON-RPC handler (initialize, tools/list, tools/call). */
export async function handleMcpJsonRpc(body) {
  let msg;
  try {
    msg = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    return {
      status: 400,
      payload: {
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' },
        id: null,
      },
    };
  }

  const id = msg?.id ?? null;
  const method = msg?.method;
  const params = msg?.params || {};

  if (method === 'initialize') {
    return {
      status: 200,
      payload: {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params.protocolVersion || '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: {
            name: config.SERVER_NAME,
            version: config.SERVER_VERSION,
          },
        },
      },
    };
  }

  if (method === 'notifications/initialized' || method === 'initialized') {
    return { status: 202, payload: null };
  }

  if (method === 'tools/list') {
    return {
      status: 200,
      payload: {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOL_REGISTRY.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      },
    };
  }

  if (method === 'tools/call') {
    const name = params.name;
    const args = params.arguments || {};
    const entry = toolsByName.get(name);
    if (!entry) {
      return {
        status: 200,
        payload: {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`,
            data: { code: ErrorCode.UNSUPPORTED_OPERATION },
          },
        },
      };
    }

    try {
      const result = await entry.handler(args);
      const isErr = result && result.success === false;
      return {
        status: 200,
        payload: {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              { type: 'text', text: JSON.stringify(result, null, 0) },
            ],
            structuredContent: result,
            isError: isErr,
          },
        },
      };
    } catch {
      return {
        status: 200,
        payload: {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  schema: 'babelcodec.mcp.error.v1',
                  success: false,
                  code: ErrorCode.INTERNAL_ERROR,
                  message: 'Internal tool error',
                }),
              },
            ],
            isError: true,
          },
        },
      };
    }
  }

  if (method === 'ping') {
    return {
      status: 200,
      payload: { jsonrpc: '2.0', id, result: {} },
    };
  }

  return {
    status: 200,
    payload: {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    },
  };
}

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

        if (req.method === 'GET') {
          return json(res, 405, {
            error: 'Use POST for MCP JSON-RPC (JSON response mode)',
            code: 'METHOD_NOT_ALLOWED',
          });
        }

        if (req.method !== 'POST') {
          return json(
            res,
            405,
            httpErrorBody('METHOD_NOT_ALLOWED', 'method not allowed', 405),
          );
        }

        let raw;
        try {
          raw = await readBody(req);
        } catch (e) {
          if (e.code === ErrorCode.BODY_TOO_LARGE) {
            return json(
              res,
              413,
              httpErrorBody(ErrorCode.BODY_TOO_LARGE, 'body too large', 413),
            );
          }
          throw e;
        }

        const text = raw.toString('utf8') || '{}';
        const { status, payload } = await handleMcpJsonRpc(text);
        if (payload == null) {
          res.writeHead(status || 202);
          res.end();
          return;
        }
        return json(res, status, payload);
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
  if (config.isProduction && config.REQUIRE_AUTH && !config.MCP_TOKEN) {
    console.error(
      '[babelcodec-mcp] FATAL: production requires MCP_TOKEN (or set REQUIRE_AUTH=false explicitly).',
    );
    process.exit(1);
  }

  const server = createServer();
  server.listen(config.PORT, config.HOST, async () => {
    console.log(
      `[babelcodec-mcp] ${config.SERVER_NAME} v${config.SERVER_VERSION} listening on http://${config.HOST}:${config.PORT}${config.MCP_PATH}`,
    );
    console.log(
      `[babelcodec-mcp] health=http://${config.HOST}:${config.PORT}${config.HEALTH_PATH} auth=${config.REQUIRE_AUTH || Boolean(config.MCP_TOKEN)}`,
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

export { toolsByName };
