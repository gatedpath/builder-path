// Every entry traces to a row in ../../../RESEARCH.md dated 2026-09-12. Nothing from
// docs.redbelly.network/pages/general/rb-env/, which lists addresses with no code.
import type { Hex } from './abi.js';

export interface VerifiedAddress {
  readonly address: Hex;
  /** Date the address was confirmed on this chain, ISO 8601. */
  readonly verifiedOn: '2026-09-12';
  /** Primary page URL, or the RPC method that proved it. */
  readonly source: string;
  readonly note?: string;
}

const RESEARCH_DATE = '2026-09-12' as const;
const VINE_FEES = 'https://vine.redbelly.network/network-fees/';
const VINE_ISSUERS = 'https://vine.redbelly.network/identity/accredited-issuers/';
const CHECKER = 'https://redbelly.testnet.routescan.io/address/0xf0da85AB0D065c46290501C3c138035fA8f9EE8F/contract/153/code';

const entry = (address: Hex, source: string, note?: string): VerifiedAddress =>
  note === undefined ? { address, verifiedOn: RESEARCH_DATE, source } : { address, verifiedOn: RESEARCH_DATE, source, note };

/** Deterministic-deployment contracts that sit at the same address on both networks. */
const canonical = {
  multicall3: entry('0xcA11bde05977b3631167028862bE2a173976CA11', 'eth_getCode', 'Multicall3, canonical address'),
  nicksDeployer: entry('0x4e59b44847b379578588920cA78FbF26c0B4956C', 'eth_getCode', "Nick's CREATE2 deployer (Arachnid deterministic-deployment-proxy)"),
  safeSingletonFactory: entry('0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7', 'eth_getCode', 'Safe singleton factory'),
  safeSingleton: entry('0x41675C099F32341bf84BFc5382aF534df5C7461a', 'eth_getCode', 'Safe 1.4.1 (L1 singleton)'),
  safeL2Singleton: entry('0x29fcB43b46531BcA003ddC8FCB67FFE91900C762', 'eth_getCode', 'SafeL2 1.4.1'),
  safeProxyFactory: entry('0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67', 'eth_getCode', 'SafeProxyFactory 1.4.1'),
  safeFallbackHandler: entry('0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99', 'eth_getCode', 'CompatibilityFallbackHandler 1.4.1'),
  safeMultiSend: entry('0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526', 'eth_getCode', 'MultiSend 1.4.1'),
  safeMultiSendCallOnly: entry('0x9641d764fc13c8B624c04430C7356C1C7C8102e2', 'eth_getCode', 'MultiSendCallOnly 1.4.1'),
  safeCreateCall: entry('0x9b35Af71d77eaf8d7e40252370304687390A1A52', 'eth_getCode', 'CreateCall 1.4.1'),
  safeSignMessageLib: entry('0xd53cd0aB83D845Ac265BE939c57F53AD838012c9', 'eth_getCode', 'SignMessageLib 1.4.1'),
  safeSimulateTxAccessor: entry('0x3d4BA2E0884aa488718476ca2FB8Efc291A46199', 'eth_getCode', 'SimulateTxAccessor 1.4.1'),
  eip2935History: entry('0x0000F90827F1C53a10cb7A02335B175320002935', 'eth_getCode', 'EIP-2935 block-hash history contract, 83 bytes of code; evidence the chain is Prague'),
} as const;

const bootstrapRegistry = entry(
  '0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5',
  VINE_FEES,
  'Same address on 151 and 153; has code at block 0. getContractAddress(string) resolves "permission", "pricefeed", "gasfees".',
);

export const addresses = {
  mainnet: {
    bootstrapRegistry,
    permission: entry(
      '0xcb385cD90ca6b219798F57B4a7958897e91A9163',
      'eth_call getContractAddress("permission") on the bootstrap registry',
      'isAllowed(address) gate for every transaction; created at block 25; source not verified on Routescan',
    ),
    pricefeed: entry(
      '0x0CD42d829F88fe539f710E9b7692C70b94aaEad4',
      'eth_call getContractAddress("pricefeed") on the bootstrap registry',
      'getLatestPrice() returns (usdPerRbnt with 6 decimals, timestamp); decimals() answers 6',
    ),
    gasfees: entry(
      '0x292Cc6D79E95B2848579735c24B70215179D4a33',
      'eth_call getContractAddress("gasfees") on the bootstrap registry',
      'Unverified source: resolved by the registry and has code, but no documented interface and no verified source on Routescan. Same address on 153.',
    ),
    accreditedIssuerRegistry: entry('0x2d68f1C50a057a310EeF28DF3199F95A65cE4ac5', VINE_ISSUERS, 'ABI not published; code confirmed with eth_getCode'),
    ...canonical,
  },
  testnet: {
    bootstrapRegistry,
    permission: entry(
      '0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690',
      'eth_call getContractAddress("permission") on the bootstrap registry',
      'isAllowed(address) gate for every transaction; created at block 26; interface from the verified RedbellyPermissionChecker: ' + CHECKER,
    ),
    pricefeed: entry(
      '0xBf207257412D3672F9C772ef263583611B98039a',
      'eth_call getContractAddress("pricefeed") on the bootstrap registry',
      'getLatestPrice() returns (usdPerRbnt with 6 decimals, timestamp); decimals() answers 6',
    ),
    gasfees: entry(
      '0x292Cc6D79E95B2848579735c24B70215179D4a33',
      'eth_call getContractAddress("gasfees") on the bootstrap registry',
      'Unverified source: resolved by the registry and has code, but no documented interface and no verified source on Routescan. Same address on 151.',
    ),
    accreditedIssuerRegistry: entry('0x6aEe06F4052ff6d01Ed7E13Fa5Ab53675756A057', VINE_ISSUERS, 'ABI not published; code confirmed with eth_getCode'),
    permit2: entry('0x000000000022D473030F116dDEE9F6B43aC78BA3', 'eth_getCode', 'Uniswap Permit2, canonical address. Testnet only: no code on 151.'),
    ...canonical,
  },
} as const;

export type MainnetAddressName = keyof typeof addresses.mainnet;
export type TestnetAddressName = keyof typeof addresses.testnet;

/** Names the bootstrap registry resolves. Any other name reverts on 151 and returns the zero address on 153. */
export const registryNames = ['permission', 'pricefeed', 'gasfees'] as const;
export type RegistryName = (typeof registryNames)[number];

/**
 * Addresses that `permission.isAllowed` returned true for on 2026-09-12. Used by the
 * live tests as positive controls. They are third parties; do not rely on them
 * staying allowed.
 */
export const knownAllowed = {
  mainnet: {
    address: '0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76' as Hex,
    source: 'Deployer of the verified RedbellyPermissionChecker on 153 (tx 0xe870ea77a1d173b8956c9144f3f52ffcc7421639b4727ed698d4634b07f03f85); isAllowed true on 151 and 153',
  },
  testnet: {
    address: '0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76' as Hex,
    source: 'Deployer of the verified RedbellyPermissionChecker on 153 (tx 0xe870ea77a1d173b8956c9144f3f52ffcc7421639b4727ed698d4634b07f03f85); isAllowed true on 151 and 153',
  },
} as const;
