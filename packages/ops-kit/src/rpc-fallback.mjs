// An RPC caller that rotates across the public providers Vine lists when one fails: the
// governors endpoint first, then Ankr, then Uniblock. URLs come from @gatedpath/chains
// (verified 2026-09-12); nothing is retyped here. Uniblock wants an API key on the `x-api-key`
// header (vine.redbelly.network/environments/); the key is read from UNIBLOCK_API_KEY or passed
// in, never written anywhere. Without a key the Uniblock provider is left out rather than
// tried, because the helper must not send a keyless request to a keyed endpoint on your behalf.
//
// Testnet has one public RPC (the governors endpoint; Vine lists no third party for 153), so
// on testnet the "rotation" is retries against that one URL.
import { createRpc, keyedRpcs, redbellyMainnet, redbellyTestnet, RpcError } from '@gatedpath/chains';

export class AllProvidersFailed extends Error {
  constructor(method, attempts) {
    super(`every RPC provider failed for ${method}: ${attempts.map((a) => `${a.name} (${a.error})`).join('; ')}`);
    this.name = 'AllProvidersFailed';
    this.attempts = attempts;
  }
}

/** The provider list for a network, in the order they are tried. */
export function providersFor(network, { uniblockKey = process.env.UNIBLOCK_API_KEY } = {}) {
  if (network === 'mainnet' || network === 151) {
    const list = [
      { name: 'governors', url: redbellyMainnet.rpcUrls.default.http[0] },
      { name: 'ankr', url: redbellyMainnet.rpcUrls.public.http.find((u) => u.includes('ankr')) },
    ].filter((p) => p.url);
    if (uniblockKey) {
      list.push({ name: 'uniblock', url: keyedRpcs.mainnet.uniblock.url, headers: { [keyedRpcs.mainnet.uniblock.header]: uniblockKey } });
    }
    return list;
  }
  if (network === 'testnet' || network === 153) {
    return [{ name: 'governors', url: redbellyTestnet.rpcUrls.default.http[0] }];
  }
  throw new Error(`unknown network ${network}; use mainnet, testnet, 151 or 153`);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new RpcError(`timeout after ${ms} ms from ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Builds a `(method, params) => result` caller that tries each provider in turn and moves to
 * the next on a network error, an HTTP error, a timeout or a JSON-RPC error that is not a
 * revert. A revert (or any other error the contract itself produced) is returned from the first
 * provider that answers, because every provider would say the same. Providers that fail are
 * skipped for `cooldownMs` so a dead endpoint is not retried on every call.
 *
 * @param {object} options
 * @param {'mainnet'|'testnet'|151|153} options.network
 * @param {Array<{name:string,url:string,headers?:object}>} [options.providers] Override the list (tests, a private node first).
 * @param {string} [options.uniblockKey] Uniblock API key; defaults to UNIBLOCK_API_KEY. Never logged.
 * @param {number} [options.timeoutMs=8000] Per-request timeout.
 * @param {number} [options.retriesPerProvider=1] Attempts per provider before moving on.
 * @param {number} [options.cooldownMs=30000] How long a failed provider sits out.
 * @param {typeof fetch} [options.fetch] A fetch to use (tests).
 * @param {(event: object) => void} [options.onEvent] Called on every failover with `{ provider, method, error }`; never with the key.
 */
export function createFallbackRpc({
  network,
  providers,
  uniblockKey,
  timeoutMs = 8000,
  retriesPerProvider = 1,
  cooldownMs = 30_000,
  fetch: doFetch,
  onEvent = () => {},
} = {}) {
  const list = (providers ?? providersFor(network, { uniblockKey })).map((p) => ({
    ...p,
    call: createRpc(p.url, { headers: p.headers, fetch: doFetch }),
    failedAt: 0,
  }));
  if (list.length === 0) throw new Error('no RPC providers');

  const rpc = async (method, params = []) => {
    const attempts = [];
    const now = Date.now();
    const ordered = [...list.filter((p) => now - p.failedAt >= cooldownMs), ...list.filter((p) => now - p.failedAt < cooldownMs)];
    for (const provider of ordered) {
      for (let attempt = 0; attempt < retriesPerProvider; attempt++) {
        try {
          return await withTimeout(provider.call(method, params), timeoutMs, provider.name);
        } catch (error) {
          if (isContractError(error)) throw error;
          attempts.push({ name: provider.name, error: error.message });
          onEvent({ provider: provider.name, method, error: error.message, attempt });
        }
      }
      provider.failedAt = Date.now();
    }
    throw new AllProvidersFailed(method, attempts);
  };
  rpc.providers = list.map((p) => ({ name: p.name, url: p.url, keyed: Boolean(p.headers) }));
  return rpc;
}

/** A JSON-RPC error the contract produced (revert, invalid argument), which no other provider would answer differently. */
export function isContractError(error) {
  if (!(error instanceof RpcError)) return false;
  if (error.code === 3 || error.code === -32000) return /revert|execution reverted|invalid opcode/i.test(error.message);
  if (error.code === -32602) return true;
  return /revert/i.test(error.message);
}
