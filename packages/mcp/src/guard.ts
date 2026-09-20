// Two rules every tool obeys before its handler runs. One: the arguments are checked for
// anything shaped like a key (64 hex characters, a PRIVATE_KEY-style name, a seed phrase, a
// keystore JSON) and refused outright, because this server never takes a key and an agent that
// pastes one has already made a mistake worth stopping on. Two: every input schema is strict,
// so an unknown argument is an error rather than something silently dropped.
import { scanValue } from '@gatedpath/preflight';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * `allowHashAt` names argument paths that legitimately carry a 0x-prefixed 64-hex value, such as
 * explain_failure's txHash: a transaction hash has the shape of a key, and the tool only ever reads
 * a receipt for it. Every other rule (a key word on the line, a privateKey argument, a seed phrase,
 * keystore JSON) still applies there.
 */
export function refuseKeys(args: unknown, options: { allowHashAt?: readonly string[] } = {}): CallToolResult | null {
  const allow = new Set(options.allowHashAt ?? []);
  const hits = scanValue(args).filter((h) => !(allow.has(h.path) && h.kind === 'hex64'));
  if (hits.length === 0) return null;
  const first = hits[0]!;
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Refused: argument ${first.path} looks like a secret (${first.why}). This server never takes a private key, seed phrase or keystore. Signing tools take a Foundry keystore name (--account) and forge or cast sign locally; read-only tools take a public address. Nothing was run. If this is a wallet or keystore you have just exposed, treat it as compromised and rotate it.`,
      },
    ],
  };
}

/** Wrap a result object into the content the SDK expects: pretty JSON text plus the object. */
export function ok(result: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(result, bigintSafe, 2) }], structuredContent: result };
}

export function fail(message: string, extra: Record<string, unknown> = {}): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: message, ...extra }, bigintSafe, 2) }], structuredContent: { error: message, ...extra } };
}

function bigintSafe(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
