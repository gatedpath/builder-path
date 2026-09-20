// A small curated map from a topic to the page on Vine or docs.redbelly.network and to the
// one-line consequence for the builder's code, taken verbatim from the agent-rules source so
// the two cannot drift. The server links; it never fetches or rewrites Redbelly's pages.
import { rulesSource } from '@gatedpath/agent-rules';

export interface DocsEntry {
  readonly topic: string;
  readonly url: string;
  /** Rules-file section the consequence line lives in. */
  readonly section: string;
  /** The start of the rule sentence to quote; matched as a prefix against that section's rules. */
  readonly rule: string;
  readonly aliases?: readonly string[];
}

const vine = (p: string) => `https://vine.redbelly.network/${p}`;
const docs = (p: string) => `https://docs.redbelly.network/pages/${p}`;

export const DOCS_MAP: readonly DocsEntry[] = [
  { topic: 'chain-ids', aliases: ['environments', 'rpc', 'networks'], url: vine('environments/'), section: 'chain-facts', rule: 'Mainnet is chain 151.' },
  { topic: 'testnet', url: vine('environments/'), section: 'chain-facts', rule: 'Testnet is chain 153.' },
  { topic: 'explorer', aliases: ['routescan', 'contract-verification', 'verify-contract'], url: vine('environments/'), section: 'chain-facts', rule: "Routescan's Etherscan-style API" },
  { topic: 'evm-version', aliases: ['solc', 'compiler', 'prague'], url: vine('consensus/evm-compatibility/'), section: 'chain-facts', rule: 'The EVM is Prague on both networks.' },
  { topic: 'transient-storage', aliases: ['opcodes', 'push0'], url: vine('consensus/evm-compatibility/'), section: 'chain-facts', rule: 'PUSH0, transient storage, MCOPY' },
  { topic: 'block-time', aliases: ['blocks', 'polling', 'latency'], url: vine('consensus/'), section: 'chain-facts', rule: 'Blocks are produced on demand.' },
  { topic: 'finality', aliases: ['consensus', 'dbft', 'reorgs'], url: vine('consensus/'), section: 'chain-facts', rule: 'Finality is deterministic' },
  { topic: 'trace-rpc', aliases: ['debug', 'traces'], url: vine('environments/'), section: 'chain-facts', rule: "The governors RPC doesn't serve debug_*" },
  { topic: 'gas', aliases: ['fees', 'gas-price', 'network-fees'], url: vine('network-fees/'), section: 'gas', rule: 'A 21,000-gas transfer costs US$0.01.' },
  { topic: 'priority-fee', aliases: ['eip-1559', 'max-priority-fee'], url: vine('network-fees/'), section: 'gas', rule: 'The priority fee is always zero.' },
  { topic: 'price-feed', aliases: ['oracle', 'rbnt-price'], url: vine('network-fees/'), section: 'gas', rule: 'The price feed is the contract the bootstrap registry names pricefeed' },
  { topic: 'wallet-gas-display', aliases: ['wallets', 'walletconnect'], url: vine('smart-contracts/interaction/'), section: 'gas', rule: 'Vine warns that most wallets show gas information wrongly' },
  { topic: 'fee-distribution', url: vine('network-fees/distribution/'), section: 'gas', rule: 'A 21,000-gas transfer costs US$0.01.' },
  { topic: 'is-allowed', aliases: ['permission', 'write-access', 'network-access'], url: vine('identity/user-access/'), section: 'identity', rule: 'The gate is permission.isAllowed(address)' },
  { topic: 'wallet-verification', aliases: ['access-dapp', 'kyc', 'verify-wallet'], url: 'https://access.redbelly.network', section: 'identity', rule: 'Read isAllowed for the deployer before every deploy' },
  { topic: 'verifier-contract', aliases: ['zkpverifier', 'vcverifier'], url: docs('methods/proof-by-query/'), section: 'identity', rule: 'There is no network-wide verifier contract.' },
  { topic: 'accredited-issuers', aliases: ['issuers', 'issuer-registry'], url: vine('identity/accredited-issuers/'), section: 'identity', rule: 'The accredited issuer registry is' },
  { topic: 'eligibility-sdk', aliases: ['sdk', 'github-packages', 'api-key'], url: docs('eligibility-sdk/getting-started/'), section: 'identity', rule: 'The Eligibility SDK' },
  { topic: 'eligibility-criteria', aliases: ['queries', 'iden3-query', 'schemas', 'credential-types'], url: docs('eligibility-sdk/configure-eligibility-criteria/'), section: 'identity', rule: 'Seven schemas are queryable today' },
  { topic: 'revocation', aliases: ['skipClaimRevocationCheck', 'circuits'], url: docs('eligibility-sdk/configure-eligibility-criteria/'), section: 'identity', rule: 'Keep revocation checks on in production.' },
  { topic: 'proof-by-query', aliases: ['zk', 'zero-knowledge', 'receptor'], url: docs('methods/proof-by-query/'), section: 'identity', rule: 'There is no network-wide verifier contract.' },
  { topic: 'five-states', aliases: ['credential-states', 'gated-tests'], url: docs('receptor/'), section: 'identity', rule: 'Test every gated function in five credential states' },
  { topic: 'business-verification', aliases: ['business', 'kyb', 'averer', 'delegate', 'business-identifier'], url: vine('business-verification/verify-business/'), section: 'identity', rule: 'Businesses verify through an accredited issuer' },
  { topic: 'stale-docs-addresses', aliases: ['rb-env'], url: docs('general/rb-env/'), section: 'identity', rule: 'Ignore the addresses on' },
  { topic: 'faucet', aliases: ['testnet-rbnt', 'testing-coins', 'faucetme'], url: vine('native-currency/testing-coins/'), section: 'two-speeds', rule: 'Get testnet RBNT from FAUCETME' },
  { topic: 'mainnet-gate', aliases: ['ship-report', 'pre-flight', 'preflight', 'two-speeds'], url: vine('environments/'), section: 'two-speeds', rule: 'Deploy to 151 only after pre-flight passes' },
  { topic: 'safe', aliases: ['multisig', 'admin', 'gnosis-safe'], url: vine('environments/'), section: 'two-speeds', rule: 'Safe 1.4.1, Multicall3 and the deterministic deployers' },
  { topic: 'keys', aliases: ['private-key', 'keystore', 'signing', 'hardware-wallet'], url: vine('smart-contracts/interaction/'), section: 'keys', rule: 'Sign with a Foundry keystore account' },
  { topic: 'schemas-repo', aliases: ['receptor-schema'], url: 'https://github.com/redbellynetwork/receptor-schema', section: 'where-to-look', rule: 'Credential schemas live in' },
  { topic: 'nodes', aliases: ['node-operator', 'run-a-node'], url: vine('nodes/operator-guide/'), section: 'chain-facts', rule: 'There is no local node.' },
];

export interface DocsLookupResult {
  topic: string;
  url: string;
  consequence: string;
  section: string;
  verified: string | null;
  note: string;
}

export function listTopics(): string[] {
  return DOCS_MAP.map((e) => e.topic);
}

export function lookupDocs(query: string): DocsLookupResult | null {
  const q = query.trim().toLowerCase().replace(/[\s_]+/g, '-');
  const entry = DOCS_MAP.find((e) => e.topic === q) ?? DOCS_MAP.find((e) => e.aliases?.includes(q)) ?? DOCS_MAP.find((e) => e.topic.includes(q) || e.aliases?.some((a) => a.includes(q)));
  if (!entry) return null;
  const section = rulesSource.sections.find((s) => s.id === entry.section);
  const consequence = section?.rules.find((r) => r.startsWith(entry.rule));
  if (!section || !consequence) throw new Error(`docs map entry "${entry.topic}" points at a rule that no longer exists in agent-rules`);
  return {
    topic: entry.topic,
    url: entry.url,
    consequence,
    section: section.heading,
    verified: section.verified ?? null,
    note: 'Read the page at url for the facts; consequence is the one line this project adds for your code. The page is Redbelly\'s and is not copied here.',
  };
}
