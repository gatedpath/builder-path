// Is the admin a Safe? On mainnet the admin address must hold a SafeProxy whose singleton is
// the canonical Safe 1.4.1 (L1 or L2 singleton), the singleton must carry the 1.4.1 bytecode,
// and getThreshold() must be at least 2. On testnet the same reads run but an EOA or a low
// threshold is a warning, because testnet is for trying things.
import { addresses, ethCall, keccak256Hex, toCaller } from '@gatedpath/chains';
import type { CheckResult } from '../types.js';

/**
 * keccak256 of the runtime code at the canonical Safe 1.4.1 addresses, read with eth_getCode
 * from both governors RPCs on 2026-09-12 (identical on 151 and 153). A singleton whose code
 * hashes to something else is not the Safe 1.4.1 release, whatever address it sits at.
 */
export const SAFE_141_CODE_HASHES = {
  safeSingleton: '0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4',
  safeL2Singleton: '0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff',
  safeProxyFactory: '0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317',
  safeFallbackHandler: '0x7c6007a5d711cea8dfd5d91f5940ec29c7f200fe511eb1fc1397b367af3c42f9',
  /** The 171-byte runtime code of a SafeProxy made by that factory, the same at every address; derived 2026-09-19 from the fixtures (code hash). */
  safeProxy: '0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c',
} as const;

const GET_THRESHOLD = '0xe75235b8'; // getThreshold()
const GET_OWNERS = '0xa0e67e2b'; // getOwners()

/** keccak256 of runtime code given as a 0x hex string, hashing the bytes rather than the text. */
export function codeHash(codeHex: string): string {
  return keccak256Hex(Buffer.from(codeHex.replace(/^0x/, ''), 'hex'));
}

export interface AdminReading {
  address: string;
  isContract: boolean;
  singleton: string | null;
  singletonKind: 'safeSingleton' | 'safeL2Singleton' | null;
  singletonCodeMatches: boolean | null;
  /** The admin's own runtime code is the SafeProxy 1.4.1 code. Its answers prove nothing; its code does. */
  proxyCodeMatches: boolean;
  threshold: number | null;
  ownerCount: number | null;
}

export async function readAdmin(address: string, rpc: string, network: 'mainnet' | 'testnet'): Promise<AdminReading> {
  const caller = toCaller(rpc);
  const code = (await caller('eth_getCode', [address, 'latest'])) as string;
  const isContract = code !== '0x' && code !== '0x0' && code.length > 2;
  const reading: AdminReading = { address, isContract, singleton: null, singletonKind: null, singletonCodeMatches: null, proxyCodeMatches: isContract && codeHash(code) === SAFE_141_CODE_HASHES.safeProxy, threshold: null, ownerCount: null };
  if (!reading.isContract) return reading;
  const slot0 = (await caller('eth_getStorageAt', [address, '0x0', 'latest'])) as string;
  const singleton = '0x' + slot0.slice(-40);
  reading.singleton = singleton;
  const known = addresses[network];
  for (const kind of ['safeSingleton', 'safeL2Singleton'] as const) {
    if (known[kind].address.toLowerCase() === singleton.toLowerCase()) reading.singletonKind = kind;
  }
  if (reading.singletonKind) {
    const singletonCode = (await caller('eth_getCode', [singleton, 'latest'])) as string;
    reading.singletonCodeMatches = codeHash(singletonCode) === SAFE_141_CODE_HASHES[reading.singletonKind];
  }
  try {
    const ret = await ethCall(rpc, address, GET_THRESHOLD);
    if (ret && ret !== '0x') reading.threshold = Number(BigInt(ret));
  } catch {
    reading.threshold = null;
  }
  try {
    // address[]: an offset word, then the length word
    const ret = await ethCall(rpc, address, GET_OWNERS);
    if (ret && ret.length >= 2 + 128) reading.ownerCount = Number(BigInt('0x' + ret.slice(2 + 64, 2 + 128)));
  } catch {
    reading.ownerCount = null;
  }
  return reading;
}

export async function checkAdminSafe(admin: string | null, rpc: string, chain: number | null): Promise<CheckResult> {
  if (!admin) {
    // On mainnet "no admin" is not something to skip past: the report would read ok with nobody named to own the contracts.
    return chain === 151
      ? { id: 'admin-safe', status: 'fail', reason: 'No admin given. On mainnet the admin must be named and must be a Safe 1.4.1 with a threshold of at least 2; pass --admin <0x…> or set ADMIN_SAFE.' }
      : { id: 'admin-safe', status: 'skip', reason: 'No admin given; pass --admin <0x…> with the address that will own the deployed contracts.' };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(admin)) return { id: 'admin-safe', status: 'fail', reason: `"${admin}" is not a 20-byte hex address.` };
  if (chain !== 151 && chain !== 153) return { id: 'admin-safe', status: 'skip', reason: 'The RPC is not a Redbelly chain.' };
  const network = chain === 151 ? 'mainnet' : 'testnet';
  const bad: 'fail' | 'warn' = chain === 151 ? 'fail' : 'warn';
  let r: AdminReading;
  try {
    r = await readAdmin(admin, rpc, network);
  } catch (e) {
    return { id: 'admin-safe', status: 'fail', reason: `Could not read the admin address: ${(e as Error).message}.` };
  }
  const data = { ...r };
  if (!r.isContract) {
    return chain === 151
      ? { id: 'admin-safe', status: 'fail', reason: `Admin ${admin} is an externally owned account; on mainnet the admin must be a Safe 1.4.1 with a threshold of at least 2.`, data }
      : { id: 'admin-safe', status: 'warn', reason: `Admin ${admin} is an externally owned account; fine on testnet, but mainnet pre-flight will refuse it, so put a Safe in place now.`, data };
  }
  if (!r.proxyCodeMatches) return { id: 'admin-safe', status: bad, reason: `Admin ${admin} is a contract but not a SafeProxy 1.4.1: its own runtime code does not hash to the proxy the canonical factory creates. What it answers to getThreshold() proves nothing.`, data };
  if (!r.singletonKind) return { id: 'admin-safe', status: bad, reason: `Admin ${admin} is a contract but its storage slot 0 (${r.singleton}) is not the canonical Safe 1.4.1 singleton or SafeL2 singleton on this chain.`, data };
  if (r.singletonCodeMatches === false) return { id: 'admin-safe', status: bad, reason: `Admin ${admin} points at ${r.singleton}, whose code does not hash to the Safe 1.4.1 release.`, data };
  if (r.threshold === null) return { id: 'admin-safe', status: bad, reason: `Admin ${admin} looks like a Safe but getThreshold() did not answer; the proxy may not be set up.`, data };
  if (r.threshold < 2) return { id: 'admin-safe', status: bad, reason: `Admin ${admin} is a Safe 1.4.1 with threshold ${r.threshold}; one signer is one stolen key away from your contracts, so use 2 or more.`, data };
  if (r.ownerCount === null || r.ownerCount < r.threshold) return { id: 'admin-safe', status: bad, reason: `Admin ${admin} is a Safe 1.4.1 with threshold ${r.threshold} but ${r.ownerCount ?? 'an unreadable number of'} owners; it could never sign.`, data };
  return { id: 'admin-safe', status: 'pass', reason: `Admin ${admin} is a Safe 1.4.1 (${r.singletonKind === 'safeL2Singleton' ? 'SafeL2' : 'Safe'} singleton; proxy and singleton code hashes verified) with threshold ${r.threshold} of ${r.ownerCount} owners.`, data };
}
