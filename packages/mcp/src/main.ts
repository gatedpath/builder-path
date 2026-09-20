#!/usr/bin/env node
// redbelly-mcp: stdio transport only. stdout is the protocol channel, so nothing else may
// write to it; diagnostics go to stderr.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, VERSION } from './server.js';

const arg = process.argv[2];
if (arg === '--version') {
  process.stdout.write(`${VERSION}\n`);
} else if (arg === '--help' || arg === '-h') {
  process.stdout.write(`redbelly-mcp ${VERSION}: local MCP server over stdio for Redbelly Network builders.\nNo options. Register it with your agent (see README.md) and it starts on demand.\n`);
} else {
  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((e) => {
    process.stderr.write(`redbelly-mcp failed to start: ${(e as Error).message}\n`);
    process.exitCode = 1;
  });
}
