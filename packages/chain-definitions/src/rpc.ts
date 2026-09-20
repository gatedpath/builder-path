// Every helper takes either an RPC URL or a caller function. Nothing here needs viem.

export type JsonRpcCaller = (method: string, params?: unknown[]) => Promise<unknown>;

/** A URL string or a `(method, params) => result` function. */
export type RpcSource = string | JsonRpcCaller;

export interface RpcOptions {
  rpc: RpcSource;
}

export class RpcError extends Error {
  readonly code: number | undefined;
  readonly data: unknown;
  constructor(message: string, code?: number, data?: unknown) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

let nextId = 1;

/**
 * Wraps a JSON-RPC URL in a caller using the global `fetch` (Node 18+, browsers).
 * Extra headers go on every request, which is how a keyed endpoint such as Uniblock
 * is used: `createRpc(url, { headers: { 'x-api-key': key } })`.
 */
export function createRpc(url: string, init: { headers?: Record<string, string>; fetch?: typeof fetch } = {}): JsonRpcCaller {
  const doFetch = init.fetch ?? globalThis.fetch;
  if (typeof doFetch !== 'function') throw new Error('no fetch available; pass one in or use Node 18+');
  return async (method, params = []) => {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    });
    if (!response.ok) throw new RpcError(`HTTP ${response.status} from ${url} for ${method}`);
    const body = (await response.json()) as { result?: unknown; error?: { code?: number; message?: string; data?: unknown } };
    if (body.error) throw new RpcError(body.error.message ?? JSON.stringify(body.error), body.error.code, body.error.data);
    return body.result;
  };
}

export function toCaller(rpc: RpcSource): JsonRpcCaller {
  return typeof rpc === 'string' ? createRpc(rpc) : rpc;
}

export async function ethCall(rpc: RpcSource, to: string, data: string, block: string = 'latest'): Promise<string> {
  const result = await toCaller(rpc)('eth_call', [{ to, data }, block]);
  if (typeof result !== 'string') throw new RpcError(`eth_call returned ${typeof result}`);
  return result;
}

export function isRevert(error: unknown): boolean {
  return error instanceof RpcError && /revert/i.test(error.message);
}
