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
