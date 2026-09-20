// Watching the network's own contracts. Redbelly does not announce changes to the permission,
// registry, price feed or gas fee contracts; asked on 12 September 2026, the answer on 17 September
// was that builders monitor for themselves (RESEARCH.md question 8). This is that monitor.
//
// Two ways of looking, because neither is enough alone. A snapshot records what the bootstrap
// registry answers for each name, a fingerprint of the code at each address, and for a proxy what
// sits behind it (EIP-1967 implementation and admin, and the admin's owner); comparing two
// snapshots catches a change even if it emitted no event. The logs of the permission proxy and its
// admin catch what a snapshot cannot see: role grants and revocations, and the transaction an
// upgrade happened in.
//
// Read-only. No key, no wallet, nothing signed.
import { addresses, registryNames, resolveRegistry, keccak256Hex, toCaller, isRevert } from '@gatedpath/chains';
import { WATCHED_EVENTS, roleName } from './events.mjs';

/** Storage slots from EIP-1967: keccak256('eip1967.proxy.<name>') minus one. */
export const EIP1967 = {
  implementation: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
  admin: '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103',
};

/** The governors RPC accepts about 100 blocks per eth_getLogs call and refuses 250 (measured 2026-09-15). */
export const LOG_WINDOW = 100;

const OWNER_SELECTOR = '0x8da5cb5b'; // owner()
const ZERO_WORD = /^0x0*$/;
const addressFromWord = (w) => '0x' + w.slice(-40).toLowerCase();
const codeHash = (code) => (code && code !== '0x' ? keccak256Hex(Buffer.from(code.slice(2), 'hex')) : null);

const roleEvents = Object.fromEntries(WATCHED_EVENTS.filter((e) => e.name.startsWith('Role')).map((e) => [e.name, e]));

/** Events worth hearing about on the permission proxy and on its proxy admin. */
export const SYSTEM_EVENTS = [
  {
    name: 'Upgraded',
    signature: 'Upgraded(address)',
    what: 'the code behind the permission proxy was replaced; the rules for who may transact can have changed',
    decode: ({ topics }) => ({ implementation: addressFromWord(topics[1]) }),
  },
  {
    name: 'AdminChanged',
    signature: 'AdminChanged(address,address)',
    what: 'the account that can upgrade the permission proxy changed',
    decode: ({ data }) => ({ previousAdmin: addressFromWord(data.slice(0, 66)), newAdmin: addressFromWord('0x' + data.slice(66, 130)) }),
  },
  {
    name: 'OwnershipTransferred',
    signature: 'OwnershipTransferred(address,address)',
    what: 'the owner of the proxy admin changed; the owner is who can upgrade the permission contract',
    decode: ({ topics }) => ({ previousOwner: addressFromWord(topics[1]), newOwner: addressFromWord(topics[2]) }),
  },
  { ...roleEvents.RoleGranted, what: 'a role was granted on the network permission contract' },
  { ...roleEvents.RoleRevoked, what: 'a role was revoked on the network permission contract' },
  { ...roleEvents.RoleAdminChanged, what: 'the admin of a role changed on the network permission contract' },
].map((e) => ({ ...e, severity: 'critical', topic: keccak256Hex(e.signature) }));

const systemEventsByTopic = Object.fromEntries(SYSTEM_EVENTS.map((e) => [e.topic, e]));

async function ownerOf(rpc, address) {
  try {
    const result = await rpc('eth_call', [{ to: address, data: OWNER_SELECTOR }, 'latest']);
    return typeof result === 'string' && result.length >= 66 && !ZERO_WORD.test(result) ? addressFromWord(result) : null;
  } catch (error) {
    // A proxy admin that is an EOA, a Safe or anything without owner() simply has no owner to record.
    if (isRevert(error) || /revert/i.test(error?.message ?? '')) return null;
    throw error;
  }
}

async function describe(rpc, address) {
  if (!address) return { address: null, codeHash: null, implementation: null, implementationCodeHash: null, proxyAdmin: null, proxyAdminOwner: null };
  const [code, implWord, adminWord] = await Promise.all([
    rpc('eth_getCode', [address, 'latest']),
    rpc('eth_getStorageAt', [address, EIP1967.implementation, 'latest']),
    rpc('eth_getStorageAt', [address, EIP1967.admin, 'latest']),
  ]);
  const implementation = ZERO_WORD.test(implWord) ? null : addressFromWord(implWord);
  const proxyAdmin = ZERO_WORD.test(adminWord) ? null : addressFromWord(adminWord);
  return {
    address: address.toLowerCase(),
    codeHash: codeHash(code),
    implementation,
    implementationCodeHash: implementation ? codeHash(await rpc('eth_getCode', [implementation, 'latest'])) : null,
    proxyAdmin,
    proxyAdminOwner: proxyAdmin ? await ownerOf(rpc, proxyAdmin) : null,
  };
}

/** What the network's own contracts look like right now. */
export async function takeSnapshot({ rpc: source, network }) {
  const rpc = toCaller(source);
  const registry = addresses[network].bootstrapRegistry.address;
  const block = Number(BigInt(await rpc('eth_blockNumber')));
  const contracts = { registry: await describe(rpc, registry) };
  for (const name of registryNames) contracts[name] = await describe(rpc, await resolveRegistry(name, { rpc, network, registry }));
  return { network, block, takenAt: new Date().toISOString(), contracts };
}

const CHANGES = [
  ['codeHash', 'CodeChanged', 'the code at this system contract address changed'],
  ['implementation', 'ImplementationChanged', 'the proxy now points at different code; the rules it enforces can have changed'],
  ['implementationCodeHash', 'ImplementationCodeChanged', 'the code at the implementation address changed', 'implementation'],
  ['proxyAdmin', 'ProxyAdminChanged', 'the account that can upgrade this proxy changed'],
  ['proxyAdminOwner', 'ProxyAdminOwnerChanged', 'the owner of the proxy admin changed; the owner is who can upgrade this contract', 'proxyAdmin'],
];

/** What a parent's alert carries about its child: [name in args, field in the snapshot]. */
const DETAIL = {
  implementation: ['currentCodeHash', 'implementationCodeHash'],
  proxyAdmin: ['currentOwner', 'proxyAdminOwner'],
};

/** Every difference between two snapshots, in the same alert shape the event poller posts. */
export function diffSnapshots(previous, current, { explorerUrl } = {}) {
  const alerts = [];
  const alert = (name, event, what, contract, args) =>
    alerts.push({
      network: current.network,
      contract,
      event,
      severity: 'critical',
      what,
      blockNumber: current.block,
      transactionHash: null,
      logIndex: null,
      args: { name, ...args, previousBlock: previous.block },
      explorerUrl: explorerUrl && contract ? `${explorerUrl}/address/${contract}` : null,
    });
  for (const [name, now] of Object.entries(current.contracts)) {
    const before = previous.contracts[name];
    if (!before) continue;
    if (before.address !== now.address) {
      // A different contract altogether; comparing its insides with the old one's would only add noise.
      alert(name, 'RegistryEntryChanged', `the bootstrap registry now answers a different address for "${name}"`, now.address ?? before.address, { previous: before.address, current: now.address, currentCodeHash: now.codeHash, currentImplementation: now.implementation });
      continue;
    }
    for (const [field, event, what, parent] of CHANGES) {
      if (before[field] === now[field]) continue;
      // New code behind a new implementation, or a new owner behind a new admin, is the same change
      // seen twice. One change, one alert; the parent's alert carries the detail.
      if (parent && before[parent] !== now[parent]) continue;
      const detail = DETAIL[field] ? { [DETAIL[field][0]]: now[DETAIL[field][1]] } : {};
      alert(name, event, what, now.address, { previous: before[field], current: now[field], ...detail });
    }
  }
  return alerts;
}

function decodeSystemLog(log, { network, explorerUrl }) {
  const def = systemEventsByTopic[log.topics?.[0]];
  if (!def) return null;
  return {
    network: network ?? null,
    contract: log.address.toLowerCase(),
    event: def.name,
    severity: def.severity,
    what: def.what,
    blockNumber: Number(log.blockNumber),
    transactionHash: log.transactionHash,
    logIndex: Number(log.logIndex ?? 0),
    args: def.decode(log),
    explorerUrl: explorerUrl ? `${explorerUrl}/tx/${log.transactionHash}` : null,
  };
}

/**
 * Reads the watched events between two blocks in windows the RPC accepts. `maxWindows` bounds one
 * run, so a watcher that was off for a month catches up over several runs instead of one burst;
 * `scannedTo` is where the next run starts.
 */
export async function readSystemLogs({ rpc: source, addresses: watched, from, to, network, explorerUrl, maxWindows = 50 }) {
  const rpc = toCaller(source);
  const alerts = [];
  let scannedTo = from - 1;
  for (let start = from, windows = 0; start <= to && windows < maxWindows; start += LOG_WINDOW, windows++) {
    const end = Math.min(start + LOG_WINDOW - 1, to);
    const logs = await rpc('eth_getLogs', [
      { address: watched, fromBlock: '0x' + start.toString(16), toBlock: '0x' + end.toString(16), topics: [SYSTEM_EVENTS.map((e) => e.topic)] },
    ]);
    for (const raw of logs) {
      const decoded = decodeSystemLog(raw, { network, explorerUrl });
      if (decoded) alerts.push(decoded);
    }
    scannedTo = end;
  }
  return { alerts, scannedTo };
}

/**
 * One pass: snapshot, compare with the last one, read the logs since the last block seen, deliver
 * every alert, and only then move the state forward. If a delivery fails the state is untouched,
 * so the same change is reported on the next run rather than lost.
 */
export async function watchOnce({ rpc, network, state, deliver, explorerUrl, log = console.error, maxWindows }) {
  const snapshot = await takeSnapshot({ rpc, network });
  if (!state.snapshot) {
    state.snapshot = snapshot;
    state.lastBlock = snapshot.block;
    log(`baseline taken at block ${snapshot.block}; only changes after it will alert`);
    return { snapshot, alerts: [] };
  }
  const alerts = diffSnapshots(state.snapshot, snapshot, { explorerUrl });
  let scannedTo = state.lastBlock;
  if (snapshot.block > state.lastBlock) {
    // Both the old and the new permission proxy and admin, so the handover itself is not missed.
    const watched = [...new Set([state.snapshot, snapshot].flatMap((s) => [s.contracts.permission?.address, s.contracts.permission?.proxyAdmin]).filter(Boolean))];
    const read = await readSystemLogs({ rpc, addresses: watched, from: state.lastBlock + 1, to: snapshot.block, network, explorerUrl, maxWindows });
    alerts.push(...read.alerts);
    scannedTo = read.scannedTo;
  }
  for (const a of alerts) await deliver(a);
  state.snapshot = snapshot;
  state.lastBlock = scannedTo;
  return { snapshot, alerts };
}

export { roleName };
