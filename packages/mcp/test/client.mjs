// A client wired to a fresh server over the SDK's in-memory transport.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../dist/index.js';

export async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientTransport);
  return {
    client,
    server,
    call: (name, args) => client.callTool({ name, arguments: args }),
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export function parse(result) {
  if (result.structuredContent) return result.structuredContent;
  return JSON.parse(result.content[0].text);
}
