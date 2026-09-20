// Minimal JSON-RPC helper. No dependencies; Node 18+.
export const ENVS = {
  testnet: { chainId: 153, rpc: process.env.RBN_TESTNET_RPC || 'https://governors.testnet.redbelly.network' },
  mainnet: { chainId: 151, rpc: process.env.RBN_MAINNET_RPC || 'https://governors.mainnet.redbelly.network' },
};

let id = 0;
export async function rpc(url, method, params = []) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url} for ${method}`);
  const body = await res.json();
  if (body.error) {
    const e = new Error(body.error.message || JSON.stringify(body.error));
    e.code = body.error.code; e.data = body.error.data; e.rpcError = true;
    throw e;
  }
  return body.result;
}

export const hex = (n) => '0x' + BigInt(n).toString(16);
export const num = (h) => (h == null ? null : Number(BigInt(h)));
export const big = (h) => (h == null ? null : BigInt(h));

export function pickEnv(argv) {
  const name = argv.find((a) => a in ENVS) || 'testnet';
  return { name, ...ENVS[name] };
}

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function percentile(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
