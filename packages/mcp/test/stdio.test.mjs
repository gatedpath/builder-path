// Smoke test of the real binary over stdio, the way an agent runs it.
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TOOL_NAMES } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));

test('the redbelly-mcp binary answers over stdio', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(here, '..', 'dist', 'main.js')], stderr: 'pipe' });
  const client = new Client({ name: 'stdio-smoke', version: '0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, TOOL_NAMES.length);
    const r = await client.callTool({ name: 'docs_lookup', arguments: { topic: 'is-allowed' } });
    assert.equal(r.isError ?? false, false);
    assert.match(r.content[0].text, /vine\.redbelly\.network\/identity\/user-access/);
    const info = await client.callTool({ name: 'chain_info', arguments: { chain: 153 } });
    assert.match(info.content[0].text, /"id": 153/);
  } finally {
    await client.close();
  }
});
