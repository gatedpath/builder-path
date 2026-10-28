// The two reads the kit makes. Nothing else is called.

/** `IRedbellyVerifier.isEligible(address, uint64)` from @gatedpath/receptor-mock. */
export const verifierAbi = [
  {
    type: 'function',
    name: 'isEligible',
    stateMutability: 'view',
    inputs: [
      { name: 'wallet', type: 'address' },
      { name: 'requestId', type: 'uint64' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * The bootstrap registry, the one fixed address on both chains: `getContractAddress("permission")`
 * names the permission contract. `checkRecipient` asks it on every call rather than remembering
 * the answer, because the permission proxy's admin has moved before.
 */
export const bootstrapRegistryAbi = [
  {
    type: 'function',
    name: 'getContractAddress',
    stateMutability: 'view',
    inputs: [{ name: 'name', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

/** The network's permission contract: `isAllowed(address)` (RESEARCH.md question 7). */
export const permissionAbi = [
  {
    type: 'function',
    name: 'isAllowed',
    stateMutability: 'view',
    inputs: [{ name: 'wallet', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * `ReceptorMock.recordFor(address, uint64)` from @gatedpath/receptor-mock. The mock is the
 * only verifier in the kit that can say when a credential expires; real verifiers answer a plain
 * boolean. Used by `receptorMockExpiry` for testnet and fork demos only.
 */
export const receptorMockAbi = [
  {
    type: 'function',
    name: 'recordFor',
    stateMutability: 'view',
    inputs: [
      { name: 'wallet', type: 'address' },
      { name: 'requestId', type: 'uint64' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'isSet', type: 'bool' },
          { name: 'status', type: 'uint8' },
          { name: 'expiresAt', type: 'uint64' },
        ],
      },
    ],
  },
] as const;

/**
 * The two `ReceptorMock` functions the dev state panel uses on a local Anvil (chain 31337):
 * `setStatus(wallet, requestId, status)` writes a state, `eligibilityStatus(wallet, requestId)`
 * reads it back. Never called against 151 or 153; the panel refuses to render there.
 */
export const receptorMockStatusAbi = [
  {
    type: 'function',
    name: 'setStatus',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'wallet', type: 'address' },
      { name: 'requestId', type: 'uint64' },
      { name: 'status', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'eligibilityStatus',
    stateMutability: 'view',
    inputs: [
      { name: 'wallet', type: 'address' },
      { name: 'requestId', type: 'uint64' },
    ],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

/**
 * ERC-3643 (T-REX 4.1.x), the shape of every real register on this network (RESEARCH.md source log,
 * 12 October 2026): the token, its identity registry, the trusted-issuers and claim-topics registries.
 * Reads only; the interface was confirmed against a live mainnet register before it was written here.
 */
export const registerTokenAbi = [
  { type: 'function', name: 'identityRegistry', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'compliance', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'onchainID', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'version', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'isFrozen', stateMutability: 'view', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'getFrozenTokens', stateMutability: 'view', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export const identityRegistryAbi = [
  { type: 'function', name: 'identityStorage', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'issuersRegistry', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'topicsRegistry', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'isVerified', stateMutability: 'view', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'identity', stateMutability: 'view', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'investorCountry', stateMutability: 'view', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ name: '', type: 'uint16' }] },
  { type: 'function', name: 'contains', stateMutability: 'view', inputs: [{ name: 'wallet', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
] as const;

export const trustedIssuersRegistryAbi = [
  { type: 'function', name: 'getTrustedIssuers', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address[]' }] },
  { type: 'function', name: 'getTrustedIssuerClaimTopics', stateMutability: 'view', inputs: [{ name: 'issuer', type: 'address' }], outputs: [{ name: '', type: 'uint256[]' }] },
] as const;

export const claimTopicsRegistryAbi = [
  { type: 'function', name: 'getClaimTopics', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256[]' }] },
] as const;
