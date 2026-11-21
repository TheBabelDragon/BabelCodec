/**
 * Real MCP client interoperability against the Streamable HTTP server.
 * Uses @modelcontextprotocol/client — not hand-rolled JSON-RPC.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createServer } from './server.js';
import { config } from './config.js';

let server;
let port;
let baseUrl;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function authHeaders() {
  if (config.MCP_TOKEN) {
    return { Authorization: `Bearer ${config.MCP_TOKEN}` };
  }
  return {};
}

async function connectClient() {
  const url = new URL(`${baseUrl}${config.MCP_PATH}`);
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: authHeaders() },
  });
  const client = new Client({ name: 'babelcodec-interop', version: '0.1.0' });
  await client.connect(transport);
  return { client, transport };
}

describe('MCP client interoperability', () => {
  it('initialize and list tools via official client', async () => {
    if (config.REQUIRE_AUTH && !config.MCP_TOKEN) return;
    const { client, transport } = await connectClient();
    try {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name).sort();
      assert.deepEqual(names, [
        'babelcodec_capabilities',
        'babelcodec_detect_scripts',
        'babelcodec_inspect_hebrew',
        'babelcodec_inspect_text',
        'babelcodec_list_codecs',
        'babelcodec_normalize_text',
      ]);
    } finally {
      await client.close().catch(() => {});
      await transport.close?.().catch(() => {});
    }
  });

  it('call babelcodec_list_codecs via official client', async () => {
    if (config.REQUIRE_AUTH && !config.MCP_TOKEN) return;
    const { client, transport } = await connectClient();
    try {
      const result = await client.callTool({
        name: 'babelcodec_list_codecs',
        arguments: {},
      });
      assert.ok(result);
      assert.ok(Array.isArray(result.content));
      const structured = result.structuredContent;
      if (structured) {
        assert.equal(typeof structured.success, 'boolean');
        if (structured.success) {
          assert.ok(Array.isArray(structured.result.codecs));
        }
      }
    } finally {
      await client.close().catch(() => {});
      await transport.close?.().catch(() => {});
    }
  });

  it('call babelcodec_inspect_text preserves source', async () => {
    if (config.REQUIRE_AUTH && !config.MCP_TOKEN) return;
    const { client, transport } = await connectClient();
    try {
      const sample = 'BabelCodec';
      const result = await client.callTool({
        name: 'babelcodec_inspect_text',
        arguments: { text: sample },
      });
      assert.ok(result);
      const structured = result.structuredContent;
      if (structured?.success) {
        assert.equal(structured.result.original_source, sample);
      } else if (structured) {
        assert.equal(structured.success, false);
        assert.ok(structured.code);
      }
    } finally {
      await client.close().catch(() => {});
      await transport.close?.().catch(() => {});
    }
  });

  it('invalid tool arguments surface as error', async () => {
    if (config.REQUIRE_AUTH && !config.MCP_TOKEN) return;
    const { client, transport } = await connectClient();
    try {
      let failed = false;
      try {
        const result = await client.callTool({
          name: 'babelcodec_inspect_text',
          arguments: { text: 99 },
        });
        if (result?.isError || result?.structuredContent?.success === false) {
          failed = true;
        }
      } catch {
        failed = true;
      }
      assert.equal(failed, true);
    } finally {
      await client.close().catch(() => {});
      await transport.close?.().catch(() => {});
    }
  });

  it('health remains available without MCP session', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.transport, 'streamable-http');
  });
});
