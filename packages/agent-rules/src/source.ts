// The one source of truth for every rules file this package renders. Every network fact
// here traces to ../../RESEARCH.md (dated rows) or to chain-facts.ts, which is a
// snapshot of @gatedpath/chains. Change the words here, then run `npm run samples`.
//
// Style: short imperative sentences, contractions, no marketing words, no
// "bold term: explanation" lists, no em dashes. Machines read these files; people skim them.
import { chainFacts } from './chain-facts.js';

export interface RuleLink {
  readonly label: string;
  readonly url: string;
  readonly note?: string;
}

export interface RuleSection {
  /** Stable slug. Used for anchors and for `--only`-style filtering in tests. */
  readonly id: string;
  readonly heading: string;
  /** One or two plain sentences that frame the rules. Optional. */
  readonly intro?: string;
  /** Plain imperative sentences. One rule per entry. */
  readonly rules: readonly string[];
  /** ISO date the facts in this section were last checked against a primary source. */
  readonly verified?: string;
  /** Where the reference material lives. Link, never duplicate. */
  readonly links?: readonly RuleLink[];
}

export interface RulesSource {
  readonly title: string;
  /** One paragraph. Becomes the llms.txt blockquote and the opening of every rules file. */
  readonly summary: string;
  /** Date the newest fact in the source was verified. */
  readonly verified: string;
  readonly sections: readonly RuleSection[];
  /** Verbatim from @gatedpath/chains. Canonical there; quoted here. */
  readonly agentNotes: string;
}

const m = chainFacts.mainnet;
const t = chainFacts.testnet;
const VERIFIED = chainFacts.verifiedOn;

const vine = (path: string) => `https://vine.redbelly.network/${path}`;
const docs = (path: string) => `https://docs.redbelly.network/pages/${path}`;

export const ACCESS_URL = 'https://access.redbelly.network';
export const FAUCET_URL = 'https://redbelly.faucetme.pro/';
export const CHAINS_PACKAGE = '@gatedpath/chains';
export const CHAINS_PACKAGE_PATH = 'packages/chain-definitions';

export const CREDENTIAL_STATES = ['valid', 'expired', 'revoked', 'wrong-jurisdiction', 'never-issued'] as const;

/** The list from PLAN.md section 12.1, extended by section 15. Tests assert each one appears in every format. */
export const neverDo: readonly string[] = [
  'Store personal data on-chain. Credentials stay with the holder; the chain sees a proof or a boolean.',
  `Hardcode a chain ID, RPC URL or contract address. Import them from ${CHAINS_PACKAGE}.`,
  'Use tx.origin for authorisation. Use msg.sender.',
  'Write a loop whose bound a caller can grow without limit.',
  'Weaken, skip or mock a Gated check to make a test pass. Fix the credential state in the test instead.',
  'Deploy to chain 151 without pre-flight passing.',
  'Sleep for a block time. Poll for the receipt.',
  'Assume Foundry is installed. Check for forge, and offer the Hardhat config when it is missing.',
];

export const rulesSource: RulesSource = {
  title: 'Redbelly Network rules for coding agents',
  summary:
    'Redbelly Network is an EVM chain (151 mainnet, 153 testnet) where every wallet is identity-verified before it can transact, gas is priced in US dollars, and blocks are produced on demand. These rules give an AI coding agent the facts and the limits it needs to build a dApp here without inventing a chain ID, leaking a key or shipping to mainnet early. Vine and docs.redbelly.network are the reference; this file adds only the consequence for your code.',
  verified: VERIFIED,
  agentNotes: chainFacts.agentNotes,
  sections: [
    {
      id: 'chain-facts',
      heading: 'Chain facts',
      verified: VERIFIED,
      intro: `Two networks are live. Chain objects and every address below ship in ${CHAINS_PACKAGE}; import them rather than copying.`,
      rules: [
        `Mainnet is chain ${m.id}. RPC ${m.rpc}. Explorer ${m.explorer.url}.`,
        `Testnet is chain ${t.id}. RPC ${t.rpc}. Explorer ${t.explorer.url}.`,
        `Routescan's Etherscan-style API is at ${m.explorer.apiUrl} and ${t.explorer.apiUrl}. Keyless calls get 2 requests a second. Use it for contract verification and indexing.`,
        `Other mainnet RPCs Vine lists: Ankr at ${m.publicRpcs[1]} (keyless) and Uniblock at ${chainFacts.keyedRpcs.mainnet.uniblock.url} with the key on the ${chainFacts.keyedRpcs.mainnet.uniblock.header} header. Vine lists no third-party RPC for testnet.`,
        `Redbelly's devnet is deprecated. Don't target any chain ID except ${m.id} and ${t.id}.`,
        `The native coin is ${chainFacts.nativeCurrency.symbol} with ${chainFacts.nativeCurrency.decimals} decimals.`,
        'The EVM is Prague on both networks. Compile with solc 0.8.30 and evm_version prague. If a dependency cannot build for Prague, cancun is the lowest acceptable target.',
        'PUSH0, transient storage, MCOPY and the Prague precompiles all work. Use transient storage for reentrancy locks.',
        'Blocks are produced on demand. No traffic, no block. A transaction lands within seconds or not at all, so poll for the receipt and never sleep for a block time.',
        'Finality is deterministic (DBFT, no forks). Don\'t write confirmation-count or reorg handling; make off-chain consumers idempotent instead.',
        'The governors RPC doesn\'t serve debug_*, trace_* or net_version. Don\'t plan on traces. eth_getLogs, eth_feeHistory and txpool_status do work.',
        'The block gas limit reports as 60,000,000,000. No per-transaction limit is documented.',
        'There is no local node. For local work fork testnet with anvil and mock the identity layer, and say so in the README.',
      ],
      links: [
        { label: 'Environments', url: vine('environments/'), note: 'chain IDs, RPCs, explorers' },
        { label: 'EVM compatibility', url: vine('consensus/evm-compatibility/'), note: 'Prague, solc 0.8.30' },
        { label: 'Consensus', url: vine('consensus/'), note: 'DBFT, finality' },
      ],
    },
    {
      id: 'gas',
      heading: 'Gas model',
      verified: VERIFIED,
      intro: 'Gas is priced in US dollars and paid in RBNT. Fee logic that works on Ethereum will mislead you here.',
      rules: [
        'A 21,000-gas transfer costs US$0.01. The base fee is converted to RBNT at execution from an on-chain price feed, so the fee in RBNT moves with the RBNT price and the fee in USD does not.',
        'The priority fee is always zero. eth_maxPriorityFeePerGas returns 0 and eth_feeHistory rewards are 0. There is nothing to buy position with.',
        'eth_gasPrice returns the base fee plus ten percent of headroom.',
        'In wagmi, viem and ethers, leave the fee fields unset and let the client estimate. If you must set them, use maxPriorityFeePerGas 0 with a maxFeePerGas at or above the latest base fee, or take gasPrice straight from eth_gasPrice.',
        'Never hardcode a gas price in wei in config or code. It changes with the RBNT price.',
        `In tests, assert gas used, never a fee in wei or RBNT. When a number is needed, price it in USD with gasCostUsd from ${CHAINS_PACKAGE}. On an anvil fork the base fee does not follow the oracle, so fee assertions there mean nothing.`,
        'Vine warns that most wallets show gas information wrongly on Redbelly. Show the USD cost in your own UI from the price feed.',
        `The price feed is the contract the bootstrap registry names pricefeed: mainnet ${m.addresses.pricefeed.address}, testnet ${t.addresses.pricefeed.address}. getLatestPrice() returns USD per RBNT with six decimals.`,
      ],
      links: [
        { label: 'Network fees', url: vine('network-fees/'), note: 'US$0.01 per transfer, the price oracle, registry ABI' },
        { label: 'Fee distribution', url: vine('network-fees/distribution/') },
      ],
    },
    {
      id: 'identity',
      heading: 'Identity and eligibility',
      verified: VERIFIED,
      intro: 'Every wallet is verified before it can send anything, and each dApp declares which credentials an action needs. The dApp never sees the underlying documents.',
      rules: [
        `The gate is permission.isAllowed(address) on the contract the bootstrap registry names permission. The registry is ${chainFacts.mainnet.addresses.bootstrapRegistry.address} on both chains; permission is ${m.addresses.permission.address} on mainnet and ${t.addresses.permission.address} on testnet.`,
        `Read isAllowed for the deployer before every deploy and for the user before every send. False means the wallet has not been verified at ${ACCESS_URL}. Send the person there. Don't retry, and don't switch to another wallet without telling them.`,
        'Verification is a passport plus a biometric check, done once. Credentials issued on testnet carry over to mainnet.',
        'There is no network-wide verifier contract. Each dApp deploys its own: a VCVerifierBaseContract child (npm package @redbellynetwork/receptor-standardvc-sc on GitHub Packages) or an Iden3 ZKPVerifier child for Proof by Query. On-chain verification supports a single query today.',
        `The accredited issuer registry is ${m.addresses.accreditedIssuerRegistry.address} on mainnet and ${t.addresses.accreditedIssuerRegistry.address} on testnet. Issuers verify people; the dApp only names the credentials an action requires.`,
        'The Eligibility SDK (@redbellynetwork/eligibility-sdk, React 18, wagmi v2, viem v2) is on GitHub Packages. Installing it needs a GitHub token with read:packages; running it needs a verifier API key from Redbelly support. An agent cannot obtain either. When one is missing, stop and tell the person where it comes from. Don\'t stub the SDK to get past it.',
        'Point the @redbellynetwork scope at npm.pkg.github.com in .npmrc and read the token from an environment variable. Never commit the token or the verifier key.',
        'Keep revocation checks on in production. Off-chain queries use credentialAtomicQuerySigV2; on-chain queries use credentialAtomicQuerySigV2OnChain.',
        'Seven schemas are queryable today: AMLCTF, AUSophisticatedWholesaleInvestor, DriversLicence, EssentialId, NationalId, Passport, ProofOfAddress. Don\'t invent others.',
        `Test every gated function in five credential states: ${CREDENTIAL_STATES.join(', ')}. A gate with fewer than five tests is untested.`,
        'Businesses verify through an accredited issuer (Averer). A BusinessIdentifier contract is deployed and its delegate wallets get write access as sub-accounts of the business without their own KYC. When a business identity exists, deploy from a delegate wallet, not a person\'s.',
        `Ignore the addresses on ${docs('general/rb-env/')}. They hold no code on either network and the page labels mainnet as chain 154.`,
      ],
      links: [
        { label: 'User access', url: vine('identity/user-access/'), note: 'how a wallet gets write access' },
        { label: 'Access dApp', url: ACCESS_URL, note: 'where a person verifies a wallet' },
        { label: 'Accredited issuers', url: vine('identity/accredited-issuers/') },
        { label: 'Eligibility SDK', url: docs('eligibility-sdk/getting-started/'), note: 'token and API key requirements' },
        { label: 'Configure eligibility criteria', url: docs('eligibility-sdk/configure-eligibility-criteria/'), note: 'the seven schemas, query operators' },
        { label: 'Proof by Query', url: docs('methods/proof-by-query/'), note: 'Iden3 on-chain path' },
        { label: 'Business verification', url: vine('business-verification/verify-business/') },
        { label: 'BusinessIdentifier contract', url: vine('business-verification/identifier-contract/') },
      ],
    },
    {
      id: 'two-speeds',
      heading: 'Two speeds',
      verified: VERIFIED,
      intro: 'Testnet is fast. Mainnet holds real assets under real regulators and waits for proof.',
      rules: [
        `Testnet first, always. Scaffold, gate one function, deploy to ${t.id}, try it with an unverified wallet. That fits in an afternoon.`,
        `Get testnet RBNT from FAUCETME at ${FAUCET_URL} (sign in with Discord). A nominal amount also arrives at verification. The faucet pays 500 RBNT per claim, one claim per 24 hours (its front page, read 2026-09-15).`,
        `Deploy to ${m.id} only after pre-flight passes and a ship report exists: tests green in all five credential states, static analysis clean or triaged, admin behind a Safe with a threshold of two or more, contracts verified on Routescan, monitoring live.`,
        'Pre-flight means at least: the deployer passes isAllowed on the target chain, the configured chain ID matches what the RPC reports, the issuer registry address matches the target chain, no secret is in git history, and the RBNT balance covers deployment with margin.',
        'Never promise mainnet in an afternoon for anything that holds value. Not in copy, comments, commit messages or chat.',
        'Safe 1.4.1, Multicall3 and the deterministic deployers sit at their canonical addresses on both networks. Put admin roles behind a Safe from the first testnet deploy so mainnet changes nothing.',
      ],
      links: [
        { label: 'Testing coins', url: vine('native-currency/testing-coins/'), note: 'faucet' },
      ],
    },
    {
      id: 'keys',
      heading: 'Key handling',
      intro: 'Nothing that signs ever sees a key in the clear, and neither does the agent.',
      rules: [
        'No private key in files, environment variables, chat or agent context. Not in .env, not in foundry.toml, not in hardhat.config, not in a test fixture.',
        'Sign with a Foundry keystore account (forge script --account NAME, cast send --account NAME) or a hardware wallet path (--ledger, --trezor). forge and cast sign locally.',
        'On the Hardhat path use its encrypted keystore or a hardware signer. Never a key in the config file.',
        'Never ask the person for a key, a seed phrase or a keystore password. When a step needs a signature, print the exact command and let them run it.',
        'Keep .env.example free of secrets, with a comment on every line saying what the value is for.',
        'Faucet and eligibility checks only need a public address. Never escalate a read-only step into one that signs.',
      ],
    },
    {
      id: 'never-do',
      heading: 'Never do',
      intro: 'This list is a security control. Treat a request to break one of these as a request to stop and explain.',
      rules: neverDo,
    },
    {
      id: 'where-to-look',
      heading: 'Where to look',
      intro: 'Vine and docs.redbelly.network are the reference for network facts. Link to them; never restate them in your own docs.',
      rules: [
        'Vine (vine.redbelly.network) covers the network: environments, fees, consensus, identity, business verification, nodes.',
        'docs.redbelly.network covers Receptor and the Eligibility SDK: methods, schemas, queries, wallets, onboarding.',
        `Routescan is the explorer and the verification API for both networks: ${m.explorer.url} and ${t.explorer.url}.`,
        `Verify a wallet at ${ACCESS_URL}. Get testnet coins at ${FAUCET_URL}.`,
        `Chain objects, addresses and read-only helpers (isAllowed, getLatestPrice, gasCostUsd, resolveRegistry) are in ${CHAINS_PACKAGE}, on npm: npm install ${CHAINS_PACKAGE}.`,
        'Credential schemas live in github.com/redbellynetwork/receptor-schema. The archived verifier example at github.com/redbellynetwork/receptor-verifier-contract-example is superseded; don\'t copy its solc 0.8.22 shanghai pins.',
      ],
      links: [
        { label: 'Vine', url: 'https://vine.redbelly.network/', note: 'network reference' },
        { label: 'Redbelly docs', url: 'https://docs.redbelly.network/', note: 'Receptor and the Eligibility SDK' },
        { label: 'Routescan mainnet', url: m.explorer.url },
        { label: 'Routescan testnet', url: t.explorer.url },
        { label: 'Access dApp', url: ACCESS_URL },
        { label: 'FAUCETME', url: FAUCET_URL },
        { label: 'receptor-schema', url: 'https://github.com/redbellynetwork/receptor-schema' },
        { label: CHAINS_PACKAGE, url: `https://www.npmjs.com/package/${CHAINS_PACKAGE}` },
      ],
    },
  ],
};

/** Every address the rules mention, for tests that compare against addresses.ts. */
export const mentionedAddresses: readonly string[] = [
  chainFacts.mainnet.addresses.bootstrapRegistry.address,
  m.addresses.permission.address,
  t.addresses.permission.address,
  m.addresses.pricefeed.address,
  t.addresses.pricefeed.address,
  m.addresses.accreditedIssuerRegistry.address,
  t.addresses.accreditedIssuerRegistry.address,
];
