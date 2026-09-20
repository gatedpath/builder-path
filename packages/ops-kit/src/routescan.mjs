// Routescan's API for the two Redbelly networks. Two surfaces exist and both were exercised
// read-only on 12 September 2026 (RESEARCH.md):
//   - the Etherscan-compatible one at .../etherscan/api?module=...&action=... (tokentx, getLogs,
//     getsourcecode, getabi, tokenholderlist all answered);
//   - the native one at .../erc20/<token>/holders (answered) and .../erc20?limit= (answered);
//     .../erc20/<token> and .../erc20/<token>/transfers returned 404, so transfers come from
//     the Etherscan module.
// Keyless limits are 2 requests a second and 10,000 a day (routescan.io/docs/plans-and-limits/
// rate-limits); every call here is paced at 600 ms so a script cannot exceed them. A free key
// raises that to 5 a second; pass it as `apiKey` and it goes on the query string as `apikey`,
// the way Etherscan-style APIs take it.
import { redbellyMainnet, redbellyTestnet } from '@gatedpath/chains';

const PACE_MS = 600;

export function explorerFor(network) {
  const chain = network === 'mainnet' || network === 151 ? redbellyMainnet : network === 'testnet' || network === 153 ? redbellyTestnet : null;
  if (!chain) throw new Error(`unknown network ${network}; use mainnet, testnet, 151 or 153`);
  const etherscan = chain.blockExplorers.default.apiUrl; // .../etherscan/api
  return {
    chain,
    etherscan,
    native: etherscan.replace(/\/etherscan\/api$/, ''),
    web: chain.blockExplorers.default.url,
  };
}

export function createRoutescan(network, { apiKey, fetch: doFetch = globalThis.fetch, paceMs = PACE_MS } = {}) {
  const ex = explorerFor(network);
  let last = 0;
  let calls = 0;
  const paced = async (url) => {
    const wait = last + paceMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    calls += 1;
    const response = await doFetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} from Routescan for ${url.replace(/apikey=[^&]+/, 'apikey=***')}`);
    return response.json();
  };
  const etherscanCall = async (params) => {
    const qs = new URLSearchParams({ ...params, ...(apiKey ? { apikey: apiKey } : {}) });
    const body = await paced(`${ex.etherscan}?${qs}`);
    if (body.status !== '1' && !(body.status === '0' && /No records|No transactions/i.test(body.message ?? ''))) {
      throw new Error(`Routescan ${params.module}/${params.action}: ${body.message ?? 'error'} ${typeof body.result === 'string' ? body.result : ''}`.trim());
    }
    return Array.isArray(body.result) || typeof body.result === 'string' ? body.result : [];
  };

  return {
    explorer: ex,
    get calls() {
      return calls;
    },

    /** ERC-20 transfers of one contract, newest first, up to `limit` (paged at 100). */
    async tokenTransfers(contract, { limit = 100, fromBlock, toBlock } = {}) {
      const out = [];
      for (let page = 1; out.length < limit; page++) {
        const rows = await etherscanCall({
          module: 'account',
          action: 'tokentx',
          contractaddress: contract,
          page: String(page),
          offset: String(Math.min(100, limit - out.length)),
          sort: 'desc',
          ...(fromBlock !== undefined ? { startblock: String(fromBlock) } : {}),
          ...(toBlock !== undefined ? { endblock: String(toBlock) } : {}),
        });
        if (!Array.isArray(rows) || rows.length === 0) break;
        out.push(...rows.map(normaliseTransfer));
        if (rows.length < 100) break;
      }
      return out.slice(0, limit);
    },

    /** Holders of one ERC-20, largest first, from the native listing (balance and share). */
    async holders(contract, { limit = 100 } = {}) {
      const out = [];
      let next;
      while (out.length < limit) {
        const qs = new URLSearchParams({ limit: String(Math.min(100, limit - out.length)), ...(next ? { next } : {}) });
        const body = await paced(`${ex.native}/erc20/${contract}/holders?${qs}`);
        for (const item of body.items ?? []) {
          out.push({ address: item.address, balance: BigInt(item.balance), share: item.percentage ?? null });
        }
        next = body.link?.nextToken;
        if (!next || (body.items ?? []).length === 0) break;
      }
      return out.slice(0, limit);
    },

    /** Whether the source at `contract` is verified on Routescan, and what it says it is. */
    async verifiedSource(contract) {
      const rows = await etherscanCall({ module: 'contract', action: 'getsourcecode', address: contract });
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (!row || !row.SourceCode) {
        return { verified: false, address: contract, url: `${ex.web}/address/${contract}/contract/code` };
      }
      return {
        verified: true,
        address: contract,
        name: row.ContractName ?? null,
        compiler: row.CompilerVersion ?? null,
        evmVersion: row.EVMVersion ?? null,
        optimization: row.OptimizationUsed === '1' ? { runs: Number(row.Runs) } : row.OptimizationUsed === '0' ? false : null,
        license: row.LicenseType ?? null,
        proxy: row.Proxy === '1' ? row.Implementation ?? true : false,
        sourceLength: String(row.SourceCode).length,
        url: `${ex.web}/address/${contract}/contract/code`,
      };
    },

    /** Raw logs through the Etherscan module, for a contract and optional topic0. */
    async logs(contract, { fromBlock = 0, toBlock = 'latest', topic0, limit = 1000 } = {}) {
      const rows = await etherscanCall({
        module: 'logs',
        action: 'getLogs',
        address: contract,
        fromBlock: String(fromBlock),
        toBlock: String(toBlock),
        ...(topic0 ? { topic0 } : {}),
        page: '1',
        offset: String(Math.min(1000, limit)),
      });
      return Array.isArray(rows) ? rows : [];
    },
  };
}

export function normaliseTransfer(row) {
  return {
    blockNumber: Number(row.blockNumber),
    timestamp: new Date(Number(row.timeStamp) * 1000).toISOString(),
    hash: row.hash,
    from: row.from,
    to: row.to,
    value: BigInt(row.value),
    tokenSymbol: row.tokenSymbol,
    tokenDecimal: Number(row.tokenDecimal),
    gasUsed: Number(row.gasUsed),
    gasPriceWei: BigInt(row.gasPrice),
  };
}

/** Formats a raw token amount with its decimals for a table. */
export function formatAmount(value, decimals) {
  const s = value.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals) || '0';
  const frac = decimals ? s.slice(-decimals).replace(/0+$/, '') : '';
  return frac ? `${whole}.${frac}` : whole;
}
