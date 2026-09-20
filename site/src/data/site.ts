// Fixed strings and links shared by the header, footer and pages. The independence line is
// the one differentiator DESIGN.md section 10 requires on every page; change it here only.
export const SITE_NAME = 'Redbelly Development Tool';
export const INDEPENDENCE_LINE =
  'An independent builder site for Redbelly Network. Not affiliated with or endorsed by Redbelly Network Pty Ltd. Network facts link to Vine.';

/** The same statement, short enough for two lines on a phone; the full line is in the footer. */
export const INDEPENDENCE_LINE_SHORT = 'Independent builder site. Not affiliated with or endorsed by Redbelly Network Pty Ltd.';

export const REPO =
  'https://github.com/gatedpath/builder-path/tree/main';

export const LINKS = {
  redbelly: 'https://redbelly.network/',
  vine: 'https://vine.redbelly.network/',
  docs: 'https://docs.redbelly.network/',
  access: 'https://access.redbelly.network',
  faucet: 'https://redbelly.faucetme.pro/',
  routescanMainnet: 'https://redbelly.routescan.io',
  routescanTestnet: 'https://redbelly.testnet.routescan.io',
  repo: REPO,
  // The public view of the research log: facts, their public sources and the dates checked. The
  // working log itself holds correspondence and open questions and is not published.
  research: `${REPO}/SOURCES.md`,
  plan: `${REPO}/PLAN.md`,
  design: `${REPO}/site/design/DESIGN.md`,
  vineEnvironments: 'https://vine.redbelly.network/environments/',
  vineFees: 'https://vine.redbelly.network/network-fees/',
  vineConsensus: 'https://vine.redbelly.network/consensus/',
  vineEvm: 'https://vine.redbelly.network/consensus/evm-compatibility/',
  vineUserAccess: 'https://vine.redbelly.network/identity/user-access/',
  vineIssuers: 'https://vine.redbelly.network/identity/accredited-issuers/',
  vineEligibility: 'https://vine.redbelly.network/identity/eligibility/',
  vineBusiness: 'https://vine.redbelly.network/business-verification/verify-business/',
  vineIdentifier: 'https://vine.redbelly.network/business-verification/identifier-contract/',
  vineTestingCoins: 'https://vine.redbelly.network/native-currency/testing-coins/',
  vineInteraction: 'https://vine.redbelly.network/smart-contracts/interaction/',
  docsSdk: 'https://docs.redbelly.network/pages/eligibility-sdk/getting-started/',
  docsCriteria: 'https://docs.redbelly.network/pages/eligibility-sdk/configure-eligibility-criteria/',
  docsProofByQuery: 'https://docs.redbelly.network/pages/methods/proof-by-query/',
  docsReceptor: 'https://docs.redbelly.network/pages/receptor/',
  docsWallets: 'https://docs.redbelly.network/pages/eligibility-sdk/wallets/',
  docsBusinessOnboarding: 'https://docs.redbelly.network/pages/eligibility-sdk/onboarding/business/overview/',
  redbellyResearch: 'https://redbelly.network/research',
} as const;

/** The date every network fact on the site was last checked against its source. */
export const FACTS_VERIFIED = '2026-09-12';

export const RESEARCH_SOURCE = { label: 'SOURCES.md', href: LINKS.research };

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[(m ?? 1) - 1]} ${y}`;
}

/** Days between an ISO date and the build date; the Verified badge flips to stale past 90. */
export function daysSince(iso: string, now = new Date()): number {
  return Math.floor((now.getTime() - new Date(iso + 'T00:00:00Z').getTime()) / 86_400_000);
}
