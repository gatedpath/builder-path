// Reading an ERC-3643 register. On this network the real registers (share classes, fund units) are
// T-REX tokens: an ERC-20 whose every transfer asks an identity registry whether both parties are
// verified holders. This reads one such register in one call so a page or a script can say what it is
// and where a wallet stands with it, before anyone signs anything.
//
// Three gates meet a holder here, in order: the network's (permission.isAllowed), a dApp's recipe
// (the Receptor verifier) and the register's (identityRegistry.isVerified). The kit already reads the
// first two; this is the third. Interface confirmed against a live mainnet register on 12 October 2026
// (RESEARCH.md source log of that day). Read-only: no key, no wallet, nothing signed.
import { toCaller, ethCall, isRevert, functionSelector, encodeAddress, decodeWords, decodeAddress, decodeBool, checksumAddress } from '@gatedpath/chains';

/** The ERC-3643 (T-REX 4.1.x) functions this reads, by signature; selectors are derived, never typed. */
export const REGISTER_SIGNATURES = {
  token: ['name()', 'symbol()', 'decimals()', 'totalSupply()', 'version()', 'paused()', 'onchainID()', 'compliance()', 'identityRegistry()', 'isFrozen(address)', 'getFrozenTokens(address)', 'balanceOf(address)'],
  registry: ['identityStorage()', 'issuersRegistry()', 'topicsRegistry()', 'isVerified(address)', 'identity(address)', 'investorCountry(address)', 'contains(address)'],
  issuers: ['getTrustedIssuers()', 'getTrustedIssuerClaimTopics(address)'],
  topics: ['getClaimTopics()'],
};
export const SELECTORS = Object.fromEntries(
  Object.values(REGISTER_SIGNATURES)
    .flat()
    .map((sig) => [sig.slice(0, sig.indexOf('(')), functionSelector(sig)]),
);

const ZERO = '0x0000000000000000000000000000000000000000';
const strip = (h) => (h.startsWith('0x') ? h.slice(2) : h);

/** ABI string: offset word, length word, bytes. */
export function decodeString(data) {
  const body = strip(data);
  if (body.length < 128) return '';
  const offset = Number(BigInt('0x' + body.slice(0, 64))) * 2;
  const length = Number(BigInt('0x' + body.slice(offset, offset + 64)));
  return Buffer.from(body.slice(offset + 64, offset + 64 + length * 2), 'hex').toString('utf8');
}

/** ABI dynamic array of words: offset word, length word, items. */
export function decodeWordArray(data) {
  const words = decodeWords(data);
  if (words.length < 2) return [];
  const offset = Number(words[0]) / 32;
  const length = Number(words[offset]);
  return words.slice(offset + 1, offset + 1 + length);
}

const toAddr = (w) => checksumAddress('0x' + w.toString(16).padStart(40, '0'));

export class NotARegister extends Error {
  constructor(address, why) {
    super(`${address} is not an ERC-3643 register: ${why}`);
    this.name = 'NotARegister';
    this.address = address;
  }
}

/**
 * Does the contract at `address` answer `identityRegistry()` with a contract? That is the test the
 * census uses; it catches T-REX shapes and nothing else, which is what "register" means here.
 */
export async function isErc3643({ rpc: source, address }) {
  const rpc = toCaller(source);
  const code = await rpc('eth_getCode', [address, 'latest']);
  if (!code || code === '0x') return false;
  try {
    const registry = decodeAddress(await ethCall(rpc, address, SELECTORS.identityRegistry));
    if (registry === ZERO) return false;
    const rcode = await rpc('eth_getCode', [registry, 'latest']);
    return Boolean(rcode && rcode !== '0x');
  } catch (e) {
    if (isRevertLike(e)) return false;
    throw e;
  }
}

/** A revert, an empty answer or return data that does not decode: the function is not there. */
function isRevertLike(e) {
  return isRevert(e) || /revert|not whole words|empty return|not a bool|high bits/i.test(String(e && e.message));
}

async function callOr(rpc, to, data, decode, fallback) {
  try {
    return decode(await ethCall(rpc, to, data));
  } catch (e) {
    if (isRevertLike(e)) return fallback;
    throw e;
  }
}

/**
 * Read one register, and where `wallet` stands with it if a wallet is given.
 * Throws `NotARegister` for anything that is not a T-REX token. Everything else is best effort: a
 * function the deployed version lacks reads as null rather than failing the whole read.
 */
export async function readRegister({ rpc: source, token, wallet }) {
  const rpc = toCaller(source);
  if (!(await isErc3643({ rpc, address: token }))) throw new NotARegister(token, 'identityRegistry() does not answer with a contract');
  const registry = decodeAddress(await ethCall(rpc, token, SELECTORS.identityRegistry));
  const [name, symbol, decimals, totalSupply, version, paused, onchainID, compliance] = await Promise.all([
    callOr(rpc, token, SELECTORS.name, decodeString, null),
    callOr(rpc, token, SELECTORS.symbol, decodeString, null),
    callOr(rpc, token, SELECTORS.decimals, (d) => Number(decodeWords(d)[0]), null),
    callOr(rpc, token, SELECTORS.totalSupply, (d) => decodeWords(d)[0], null),
    callOr(rpc, token, SELECTORS.version, decodeString, null),
    callOr(rpc, token, SELECTORS.paused, decodeBool, null),
    callOr(rpc, token, SELECTORS.onchainID, decodeAddress, null),
    callOr(rpc, token, SELECTORS.compliance, decodeAddress, null),
  ]);
  const [identityStorage, issuersRegistry, topicsRegistry] = await Promise.all([
    callOr(rpc, registry, SELECTORS.identityStorage, decodeAddress, null),
    callOr(rpc, registry, SELECTORS.issuersRegistry, decodeAddress, null),
    callOr(rpc, registry, SELECTORS.topicsRegistry, decodeAddress, null),
  ]);
  const claimTopics = topicsRegistry ? await callOr(rpc, topicsRegistry, SELECTORS.getClaimTopics, decodeWordArray, []) : [];
  const issuerAddresses = issuersRegistry ? (await callOr(rpc, issuersRegistry, SELECTORS.getTrustedIssuers, decodeWordArray, [])).map(toAddr) : [];
  const trustedIssuers = await Promise.all(
    issuerAddresses.map(async (issuer) => ({
      address: issuer,
      claimTopics: await callOr(rpc, issuersRegistry, SELECTORS.getTrustedIssuerClaimTopics + strip(encodeAddress(issuer)), decodeWordArray, []),
    })),
  );
  // No required topics means the registry verifies any registered identity: registration is the gate.
  const gate = claimTopics.length === 0 ? 'registration only' : 'claims';

  let standing = null;
  if (wallet) {
    const arg = strip(encodeAddress(wallet));
    const [isVerified, identity, country, frozen, frozenTokens, balance] = await Promise.all([
      callOr(rpc, registry, SELECTORS.isVerified + arg, decodeBool, null),
      callOr(rpc, registry, SELECTORS.identity + arg, decodeAddress, null),
      callOr(rpc, registry, SELECTORS.investorCountry + arg, (d) => Number(decodeWords(d)[0]), null),
      callOr(rpc, token, SELECTORS.isFrozen + arg, decodeBool, null),
      callOr(rpc, token, SELECTORS.getFrozenTokens + arg, (d) => decodeWords(d)[0], null),
      callOr(rpc, token, SELECTORS.balanceOf + arg, (d) => decodeWords(d)[0], null),
    ]);
    standing = {
      address: checksumAddress(wallet),
      isVerified,
      registered: identity !== null && identity !== ZERO,
      identity: identity === ZERO ? null : identity,
      country: country === 0 ? null : country,
      frozen,
      frozenTokens,
      balance,
    };
  }
  return {
    token: { address: checksumAddress(token), name, symbol, decimals, totalSupply, version, paused, onchainID, compliance, identityRegistry: registry },
    registry: { address: registry, identityStorage, issuersRegistry, topicsRegistry, trustedIssuers, claimTopics, gate },
    wallet: standing,
  };
}

/** The read in plain words, one fact a line. Numbers carry their unit; nothing is interpreted. */
export function describeRegister(r) {
  const t = r.token;
  const lines = [];
  lines.push(`${t.name ?? '(no name)'} (${t.symbol ?? '?'}), an ERC-3643 register${t.version ? `, T-REX ${t.version}` : ''}, at ${t.address}`);
  lines.push(`supply ${t.totalSupply === null ? 'unknown' : t.totalSupply.toString()} base units${t.decimals !== null ? ` (${t.decimals} decimals)` : ''}; transfers ${t.paused === null ? 'pause state unknown' : t.paused ? 'PAUSED by the issuer' : 'not paused'}`);
  lines.push(`identity registry ${r.registry.address}; ${r.registry.trustedIssuers.length} trusted issuer(s); ${r.registry.claimTopics.length} required claim topic(s)`);
  lines.push(
    r.registry.gate === 'registration only'
      ? 'gate: registration only. No claim topics are required, so any wallet the issuer has registered with an identity is verified, and no other wallet is.'
      : `gate: claims. A wallet is verified when its identity holds claims for topics ${r.registry.claimTopics.map(String).join(', ')} from a trusted issuer.`,
  );
  if (r.wallet) {
    const w = r.wallet;
    lines.push(
      `wallet ${w.address}: ${w.isVerified ? 'VERIFIED for this register' : 'not verified for this register'}; ${w.registered ? `registered with identity ${w.identity}${w.country ? `, country code ${w.country}` : ''}` : 'not registered'}; balance ${w.balance === null ? 'unknown' : w.balance.toString()} base units${w.frozen ? '; FROZEN' : ''}${w.frozenTokens && w.frozenTokens > 0n ? `; ${w.frozenTokens.toString()} base units frozen` : ''}`,
    );
  }
  lines.push('This reads the register; it does not say who holds the identity behind an address, and only the issuer can register one.');
  return lines;
}
