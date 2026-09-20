// The events on a contract-kit GatedERC20 that an operator wants to hear about, with their
// topic hashes and a decoder for each. Signatures are from packages/contract-kit/abi/GatedERC20.json
// (Gated, IssuerRegistry, OpenZeppelin AccessControl and Pausable); hashes are computed with
// keccak256 from @gatedpath/chains at load time so a typo here fails loudly, and the test
// compares them with `cast sig-event` output recorded on 12 September 2026.
import { keccak256Hex } from '@gatedpath/chains';

const word = (data, i) => '0x' + data.slice(2 + i * 64, 2 + (i + 1) * 64);
const addr = (w) => '0x' + w.slice(-40);
const uint = (w) => BigInt(w);
const topicAddr = (t) => addr(t);

export const WATCHED_EVENTS = [
  {
    name: 'Paused',
    signature: 'Paused(address)',
    severity: 'critical',
    what: 'the token was paused; every movement is refused until the admin unpauses',
    decode: ({ data }) => ({ account: addr(word(data, 0)) }),
  },
  {
    name: 'Unpaused',
    signature: 'Unpaused(address)',
    severity: 'critical',
    what: 'the token was unpaused; movements resume',
    decode: ({ data }) => ({ account: addr(word(data, 0)) }),
  },
  {
    name: 'ForcedTransfer',
    signature: 'ForcedTransfer(address,address,uint256,bytes32,address)',
    severity: 'critical',
    what: 'a compliance officer moved tokens out of a wallet; match the hash to a document within the hour',
    decode: ({ topics, data }) => ({
      from: topicAddr(topics[1]),
      to: topicAddr(topics[2]),
      justificationHash: topics[3],
      amount: uint(word(data, 0)).toString(),
      officer: addr(word(data, 1)),
    }),
  },
  {
    name: 'RoleGranted',
    signature: 'RoleGranted(bytes32,address,address)',
    severity: 'critical',
    what: 'a role was granted; if nobody scheduled it, the admin is compromised',
    decode: ({ topics }) => ({ role: roleName(topics[1]), account: topicAddr(topics[2]), sender: topicAddr(topics[3]) }),
  },
  {
    name: 'RoleRevoked',
    signature: 'RoleRevoked(bytes32,address,address)',
    severity: 'critical',
    what: 'a role was revoked',
    decode: ({ topics }) => ({ role: roleName(topics[1]), account: topicAddr(topics[2]), sender: topicAddr(topics[3]) }),
  },
  {
    name: 'RoleAdminChanged',
    signature: 'RoleAdminChanged(bytes32,bytes32,bytes32)',
    severity: 'critical',
    what: 'the admin of a role changed',
    decode: ({ topics }) => ({ role: roleName(topics[1]), previousAdminRole: roleName(topics[2]), newAdminRole: roleName(topics[3]) }),
  },
  {
    name: 'VerifierChanged',
    signature: 'VerifierChanged(address,address)',
    severity: 'critical',
    what: 'the verifier that decides eligibility changed; confirm the new address is yours',
    decode: ({ topics }) => ({ previousVerifier: topicAddr(topics[1]), newVerifier: topicAddr(topics[2]) }),
  },
  {
    name: 'RequestIdChanged',
    signature: 'RequestIdChanged(uint64,uint64)',
    severity: 'critical',
    what: 'the eligibility request id changed; every holder is re-checked against a different rule',
    decode: ({ data }) => ({ previousRequestId: uint(word(data, 0)).toString(), newRequestId: uint(word(data, 1)).toString() }),
  },
  {
    name: 'IssuerPermissionSet',
    signature: 'IssuerPermissionSet(address,uint64,uint64,uint256)',
    severity: 'warning',
    what: 'an issuer was granted or re-granted a mint window; check the window and allowance fit the tranche',
    decode: ({ topics, data }) => ({
      issuer: topicAddr(topics[1]),
      validFrom: isoOrSeconds(uint(word(data, 0))),
      validUntil: isoOrSeconds(uint(word(data, 1))),
      allowance: uint(word(data, 2)).toString(),
    }),
  },
  {
    name: 'IssuerPermissionRevoked',
    signature: 'IssuerPermissionRevoked(address)',
    severity: 'warning',
    what: 'an issuer permission was revoked',
    decode: ({ topics }) => ({ issuer: topicAddr(topics[1]) }),
  },
  {
    name: 'EligibilityDenied',
    signature: 'EligibilityDenied(address,uint64,address)',
    severity: 'info',
    what: 'a distribution skipped a recipient who was not eligible',
    decode: ({ topics }) => ({ wallet: topicAddr(topics[1]), requestId: uint(topics[2]).toString(), verifier: topicAddr(topics[3]) }),
  },
].map((e) => ({ ...e, topic: keccak256Hex(e.signature) }));

const ROLE_NAMES = Object.fromEntries(
  ['PAUSER_ROLE', 'COMPLIANCE_ROLE', 'ISSUER_ADMIN_ROLE', 'MINTER_ROLE', 'PROPOSER_ROLE', 'EXECUTOR_ROLE', 'CANCELLER_ROLE'].map((n) => [keccak256Hex(n), n]),
);
ROLE_NAMES['0x0000000000000000000000000000000000000000000000000000000000000000'] = 'DEFAULT_ADMIN_ROLE';

export function roleName(topic) {
  return ROLE_NAMES[topic] ?? topic;
}

export const topicsByName = Object.fromEntries(WATCHED_EVENTS.map((e) => [e.name, e.topic]));
export const eventsByTopic = Object.fromEntries(WATCHED_EVENTS.map((e) => [e.topic, e]));

/** Decodes one raw log (eth_getLogs shape) into an alert record, or null if it is not watched. */
/**
 * A uint64 of seconds as an ISO date, or, past what a JavaScript Date can hold, the raw number with
 * what it means. `setIssuer` accepts any `validUntil`, so "never expires" (2^64-1) is legal, and
 * `toISOString()` throws on it.
 */
export function isoOrSeconds(seconds) {
  const ms = Number(seconds) * 1000;
  return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString() : `${seconds} (seconds; beyond any calendar date, so in effect never)`;
}

export function decodeLog(log, { network, contract, explorerUrl } = {}) {
  const def = eventsByTopic[log.topics?.[0]];
  if (!def) return null;
  const blockNumber = Number(log.blockNumber);
  return {
    network: network ?? null,
    contract: contract ?? log.address,
    event: def.name,
    severity: def.severity,
    what: def.what,
    blockNumber,
    transactionHash: log.transactionHash,
    logIndex: Number(log.logIndex ?? 0),
    args: def.decode(log),
    explorerUrl: explorerUrl ? `${explorerUrl}/tx/${log.transactionHash}` : null,
  };
}
