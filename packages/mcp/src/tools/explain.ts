// explain_failure: one failure in, plain words out, from the table in @gatedpath/agent-rules.
// Three inputs, one at a time: `revert` (hex data or a message), `txHash` with `chain` (the receipt
// is read, a status-0 transaction is replayed with eth_call at its block to recover the revert
// data, and a NotEligible revert is followed by a read of the verifier's eligibilityStatus), or
// `stderr` (a pasted forge, cast, anvil or pre-flight failure). Read-only always: nothing here
// signs, and the only network calls are eth_getTransactionReceipt, eth_getTransactionByHash,
// eth_call and, when an RPC is given, the price feed. Unknown input comes back as kind "unknown"
// with the raw text, never a guess.
import {
  decodeRevertData,
  failureByKind,
  matchText,
  notEligibleEntry,
  revertHexIn,
  ELIGIBILITY_STATUS_NAMES,
} from '@gatedpath/agent-rules';
import type { DecodedRevert, FailureEntry } from '@gatedpath/agent-rules';
import { encodeAddress, encodeCall, encodeUint256, functionSelector, gasCostUsd, getLatestPrice, formatUnits, toCaller, RpcError } from '@gatedpath/chains';
import { z } from 'zod';
import { fail, ok } from '../guard.js';
import { rpcFor } from '../rpc.js';
import { chainSchema, rpcSchema } from './read-only.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** The measured deploy gas for the scaffold's GatedERC20 on the local loop, 14 September 2026. */
export const MEASURED_DEPLOY_GAS = 1_899_210;

export const explainFailureInput = z.object({
  revert: z.string().min(1).max(20_000).optional().describe('Revert data as hex (0x…), or the message a tool printed for a revert'),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'a transaction hash').optional().describe('A transaction hash; needs chain. The receipt is read and a failed transaction is replayed with eth_call to recover the revert data'),
  chain: chainSchema.optional().describe('Required with txHash; 153 for testnet, 151 for mainnet'),
  stderr: z.string().min(1).max(200_000).optional().describe('A pasted forge, cast, anvil, npm run dev or redbelly-preflight failure, as printed'),
  rpc: rpcSchema.describe('JSON-RPC URL override for txHash reads, or, with any input, the RPC to price gas figures on. No network call is made without txHash or rpc'),
}).strict();

export interface Explanation {
  kind: string;
  plainWords: string;
  cause: string;
  fix: { command?: string; link?: string };
  [extra: string]: unknown;
}

function fromEntry(entry: FailureEntry, extra: Record<string, unknown> = {}): Explanation {
  return {
    kind: entry.kind,
    plainWords: entry.plainWords,
    cause: entry.cause,
    fix: { ...(entry.fix.command ? { command: entry.fix.command } : {}), ...(entry.fix.link ? { link: entry.fix.link } : {}) },
    title: entry.title,
    docsPage: entry.docsPage,
    shape: entry.status,
    measured: entry.measured,
    ...extra,
  };
}

export function unknown(raw: string, extra: Record<string, unknown> = {}): Explanation {
  return {
    kind: 'unknown',
    plainWords: "This failure isn't in the table, so there are no plain words for it yet.",
    cause: 'Nothing in the failure table matched the selector or the text. The raw input is returned unchanged rather than a guess.',
    fix: {},
    raw: raw.slice(0, 4000),
    ...extra,
  };
}

export { revertHexIn };

function explainDecoded(decoded: DecodedRevert, raw: string): Explanation {
  if (decoded.kind === 'not-eligible') {
    const entry = notEligibleEntry(null);
    return fromEntry(entry, { decoded: { selector: decoded.selector, error: 'NotEligible(address,uint64)', ...(decoded.notEligible ?? {}) }, eligibilityStatus: null, raw });
  }
  if (decoded.kind) {
    const entry = failureByKind(decoded.kind)!;
    return fromEntry(entry, { decoded: { selector: decoded.selector, ...(decoded.reason !== undefined ? { reason: decoded.reason } : {}) }, raw });
  }
  const extra: Record<string, unknown> = { decoded: { selector: decoded.selector } };
  if (decoded.reason !== undefined) (extra['decoded'] as Record<string, unknown>)['reason'] = decoded.reason;
  if (decoded.panic !== undefined) (extra['decoded'] as Record<string, unknown>)['panic'] = decoded.panic;
  return unknown(raw, extra);
}

/** Explains a revert given as hex or as a message. Pure. */
export function explainRevert(revert: string): Explanation {
  const text = revert.trim();
  const hex = /^0x[0-9a-fA-F]*$/.test(text) ? text : revertHexIn(text);
  if (hex) {
    const decoded = decodeRevertData(hex);
    if (decoded) {
      const e = explainDecoded(decoded, text);
      if (e.kind !== 'unknown') return e;
      // an unknown selector inside a message: the words around it may still say what it was
      const byText = matchText(text);
      return byText ? fromEntry(byText, { decoded: e['decoded'], raw: text }) : e;
    }
  }
  const entry = matchText(text);
  return entry ? fromEntry(entry, { raw: text }) : unknown(text);
}

/** Explains a pasted stderr. Pure. */
export function explainStderr(stderr: string): Explanation {
  const text = stderr.trim();
  const hex = revertHexIn(text);
  if (hex) {
    const decoded = decodeRevertData(hex);
    if (decoded?.kind) return explainDecoded(decoded, text);
  }
  const entry = matchText(text);
  if (!entry) return unknown(text);
  const extra: Record<string, unknown> = { raw: text };
  const line = /(?:^|\n)\s*fail\s+[a-z-]+\s+(.*)/.exec(text);
  if (line) extra['preflightLine'] = line[1]!.trim();
  return fromEntry(entry, extra);
}

const SEL_VERIFIER = functionSelector('verifier()');
const SEL_STATUS = functionSelector('eligibilityStatus(address,uint64)');

function revertDataOf(e: unknown): string | null {
  if (!(e instanceof RpcError)) return null;
  const d = e.data;
  if (typeof d === 'string' && /^0x[0-9a-fA-F]*$/.test(d)) return d;
  if (d && typeof d === 'object' && typeof (d as { data?: unknown }).data === 'string') return (d as { data: string }).data;
  const inMessage = revertHexIn(e.message);
  return inMessage;
}

/** Reads `verifier()` on the gated contract, then `eligibilityStatus(wallet, requestId)`. Null when either read fails. */
export async function readEligibilityStatus(rpc: string, contract: string, wallet: string, requestId: string, block = 'latest'): Promise<{ verifier: string; status: number; name: string } | null> {
  const call = toCaller(rpc);
  try {
    const v = (await call('eth_call', [{ to: contract, data: SEL_VERIFIER }, block])) as string;
    if (typeof v !== 'string' || v.length < 66) return null;
    const verifier = `0x${v.slice(-40)}`;
    const s = (await call('eth_call', [{ to: verifier, data: encodeCall(SEL_STATUS, encodeAddress(wallet), encodeUint256(BigInt(requestId))) }, block])) as string;
    if (typeof s !== 'string' || s.length < 66) return null;
    const status = Number(BigInt(s));
    const name = ELIGIBILITY_STATUS_NAMES[status];
    if (!name) return null;
    return { verifier, status, name };
  } catch {
    return null;
  }
}

async function explainTx(txHash: string, chain: 151 | 153, rpcOverride?: string): Promise<Explanation> {
  const rpc = rpcFor(chain, rpcOverride);
  const call = toCaller(rpc);
  let receipt: { status?: string; blockNumber?: string; to?: string | null; from?: string; gasUsed?: string } | null;
  try {
    receipt = (await call('eth_getTransactionReceipt', [txHash])) as typeof receipt;
  } catch (e) {
    return unknown(txHash, { txHash, chain, rpc, error: `could not read the receipt: ${(e as Error).message}` });
  }
  if (!receipt) {
    return unknown(txHash, {
      txHash,
      chain,
      rpc,
      receipt: null,
      note: "No receipt: the transaction was never mined on this chain. A node-level rejection (an unverified wallet, a bad nonce, not enough RBNT) leaves no receipt; the error came back from eth_sendRawTransaction at the time. Paste that error as stderr instead.",
    });
  }
  const status = receipt.status ? Number(BigInt(receipt.status)) : null;
  if (status === 1) {
    return unknown(txHash, { txHash, chain, rpc, receipt: { status: 1, blockNumber: receipt.blockNumber ?? null, gasUsed: receipt.gasUsed ?? null }, note: 'This transaction succeeded (status 1). There is no failure to explain.' });
  }
  type Tx = { from?: string; to?: string | null; input?: string; value?: string; gas?: string };
  let tx: Tx | null;
  try {
    tx = (await call('eth_getTransactionByHash', [txHash])) as Tx | null;
  } catch {
    tx = null;
  }
  const base: Record<string, unknown> = { txHash, chain, rpc, receipt: { status, blockNumber: receipt.blockNumber ?? null, gasUsed: receipt.gasUsed ?? null } };
  if (!tx || !tx.to) return unknown(txHash, { ...base, note: 'The transaction failed but its calldata could not be read back, so the revert cannot be replayed.' });
  // Replay at the block it failed in: the same call, the same sender, the state as it was.
  let data: string | null = null;
  try {
    await call('eth_call', [{ from: tx.from, to: tx.to, data: tx.input, value: tx.value ?? '0x0', gas: tx.gas }, receipt.blockNumber ?? 'latest']);
    return unknown(txHash, { ...base, note: 'The transaction failed on chain but the same call succeeds when replayed at that block, so the revert data is not recoverable here (out of gas, or state that has since changed).' });
  } catch (e) {
    data = revertDataOf(e);
    if (!data) return unknown(txHash, { ...base, replayError: (e as Error).message, note: 'The replay reverted but the node returned no revert data.' });
  }
  const decoded = decodeRevertData(data);
  if (!decoded) return unknown(txHash, { ...base, revertData: data });
  const e = explainDecoded(decoded, data);
  if (e.kind !== 'not-eligible' || !decoded.notEligible) return { ...e, ...base, revertData: data };
  const read = await readEligibilityStatus(rpc, tx.to, decoded.notEligible.wallet, decoded.notEligible.requestId, receipt.blockNumber ?? 'latest');
  if (!read) {
    return { ...e, ...base, revertData: data, eligibilityStatus: null, note: "The verifier's eligibilityStatus could not be read, so the credential state behind the revert is unknown; a real verifier answers Valid or NeverIssued only." };
  }
  const entry = notEligibleEntry(read.status);
  return fromEntry(entry, { ...base, revertData: data, decoded: e['decoded'], eligibilityStatus: { verifier: read.verifier, status: read.status, name: read.name } });
}

/** Adds the current price of gas when the failure is about RBNT and an RPC was given. */
async function priced(explanation: Explanation, rpc: string | undefined, chain: 151 | 153 | undefined): Promise<Explanation> {
  if (!rpc || !['insufficient-funds', 'preflight-balance'].includes(explanation.kind)) return explanation;
  try {
    const url = rpcFor(chain ?? 153, rpc);
    const price = await getLatestPrice({ rpc: url });
    const deploy = await gasCostUsd({ gasUsed: MEASURED_DEPLOY_GAS, rpc: url });
    const pricing: Record<string, unknown> = {
      rpc: url,
      usdPerRbnt: price.usdPerRbnt,
      priceTimestamp: new Date(price.timestamp * 1000).toISOString(),
      measuredDeployGas: MEASURED_DEPLOY_GAS,
      measuredDeployRbnt: deploy.rbnt,
      measuredDeployUsd: deploy.usd,
      note: 'gasCostUsd from @gatedpath/chains at the latest base fee and feed price; pre-flight adds 25% on top.',
    };
    const have = /(?:balance|have)\s*:?\s*(\d{6,})/i.exec(explanation['raw'] as string ?? '');
    const want = /(?:tx cost|want|needs?)\s*:?\s*(\d{6,})/i.exec(explanation['raw'] as string ?? '');
    if (have && want) {
      const short = BigInt(want[1]!) - BigInt(have[1]!);
      if (short > 0n) pricing['shortfall'] = { wei: short.toString(), rbnt: formatUnits(short, 18), usd: Number(formatUnits(short, 18)) * price.usdPerRbnt };
    }
    return { ...explanation, pricing };
  } catch (e) {
    return { ...explanation, pricing: { error: `could not price gas: ${(e as Error).message}` } };
  }
}

export async function explainFailure(args: z.infer<typeof explainFailureInput>): Promise<CallToolResult> {
  const given = ['revert', 'txHash', 'stderr'].filter((k) => args[k as 'revert' | 'txHash' | 'stderr'] !== undefined);
  if (given.length !== 1) return fail(`pass exactly one of revert, txHash or stderr (got ${given.length ? given.join(' and ') : 'none'})`);
  if (args.txHash && !args.chain) return fail('txHash needs chain (153 or 151) so the receipt is read from the right network');
  let explanation: Explanation;
  if (args.txHash) explanation = await explainTx(args.txHash, args.chain!, args.rpc);
  else if (args.revert !== undefined) explanation = explainRevert(args.revert);
  else explanation = explainStderr(args.stderr!);
  explanation = await priced(explanation, args.rpc, args.chain);
  return ok({ ...explanation, input: given[0]!, readOnly: true });
}
