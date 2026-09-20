// Every package the plan ships, with what exists today. `lastVerified` is the date the
// package's own tests last ran green against the network (from its README); null means the
// package has not landed yet. The nine packages are on npm since 18 September 2026; each install
// line below was run against the public registry that day. The recipes are not a package.
export interface Tool {
  name: string;
  path: string;
  summary: string;
  install: string | null;
  status: 'verified' | 'draft';
  statusLabel?: string;
  lastVerified: string | null;
  planRef: string;
}

export const tools: Tool[] = [
  {
    name: '@gatedpath/chains',
    path: 'packages/chain-definitions',
    summary: 'viem-shaped chain objects for 151 and 153, every system and Safe address verified on-chain, and read-only helpers: isAllowed, getLatestPrice, gasCostUsd, resolveRegistry. No runtime dependencies.',
    install: 'npm install @gatedpath/chains',
    status: 'verified',
    lastVerified: '2026-09-12',
    planRef: 'PLAN section 5.1',
  },
  {
    name: '@gatedpath/agent-rules',
    path: 'packages/agent-rules',
    summary: 'One typed source rendered to CLAUDE.md, AGENTS.md, Cursor, Copilot and Gemini rules files plus llms.txt; a CLI with --check for drift; writeRulesFiles for the scaffolder; and the failure table (40 kinds with plain words, cause, fix and the docs page) that explain_failure, explainError and the /errors page share.',
    install: 'npx -y @gatedpath/agent-rules --out .',
    status: 'verified',
    lastVerified: '2026-09-14',
    planRef: 'PLAN section 12.1 (a)',
  },
  {
    name: 'create-redbelly-dapp',
    path: 'packages/create-redbelly-dapp',
    summary: 'One command writes a monorepo: Foundry contracts on the Gated base with five-state, fuzz and invariant tests, a Next.js web app with the verify-your-wallet interstitial and the dev state panel, pinned CI, the five rules files, npm run dev for the local loop, npm run doctor, gas and ship through the vendored preflight package, and a deploy script that refuses chain 151 without a Safe 1.4.1, a verified deployer and a ship report dated today. Foundry only by default since wave 8; --hardhat adds a Hardhat 3 view of the same sources. Templates gated-erc20 and empty ship; gated-erc721 and gated-vault refuse with a list. Thirteen integration and dev tests on anvil, a recorded testnet fork run, and the golden path re-run on the Foundry-only default.',
    install: 'npm create redbelly-dapp@latest my-app -- --yes',
    status: 'verified',
    lastVerified: '2026-09-14',
    planRef: 'PLAN sections 5.2 and 16, Wave 2',
  },
  {
    name: '@gatedpath/receptor-mock',
    path: 'packages/receptor-mock',
    summary: 'IRedbellyVerifier, the Gated base with gated and gatedFor and the verifier-change hook, ReceptorMock with five states and expiry, adapters for Iden3 ZKPVerifier (1.x, 2.x, 3.x) and VCVerifierBaseContract children, and the Foundry test base that proves a gate against all five states. Solc 0.8.30, Prague, no runtime dependencies in src/. 34 tests, 36 on a testnet fork; Slither and Aderyn reports committed.',
    install: 'npm install @gatedpath/receptor-mock',
    status: 'verified',
    lastVerified: '2026-09-12',
    planRef: 'PLAN section 16, Wave 1',
  },
  {
    name: '@gatedpath/mcp',
    path: 'packages/mcp',
    summary: 'Local stdio MCP server, fourteen tools: chain facts, isAllowed, gas in USD, pre-flight, the five-state suite, rules-file drift, testnet deploy and Routescan verification through forge with a keystore name, docs lookup, status (where the project is and the one next command, no network call without rpc), explain_failure (plain words, cause and fix for a revert, a transaction hash or a pasted stderr, from the shared failure table), doctor (the machine before the first command), gas_report (RBNT and US cents per function) and ship_report (the mainnet gate that writes deployments/ship-<chain>-<date>.md when every check passes). Strict schemas; every tool refuses key-shaped arguments; deploy refuses chain 151 and warns without today\'s ship report on 153; no faucet tool until question 16 is answered. 33 tests.',
    install: 'npx -y @gatedpath/mcp',
    status: 'verified',
    lastVerified: '2026-09-14',
    planRef: 'PLAN sections 12.1 and 13.2',
  },
  {
    name: 'Pre-flight CLI, doctor, gas and ship',
    path: 'packages/preflight',
    summary: 'redbelly-preflight: seven checks before a deploy (chain ID against the RPC, deployer isAllowed, Safe 1.4.1 admin with threshold at least 2 on 151, solc 0.8.30 and prague pins, secrets in git history, RBNT balance with 25% margin, Slither report freshness), one line each, --json, exit 1 on any fail, never a key. redbelly-doctor: the machine before the first command (Node 22, git, forge, anvil and cast at one version and as the real binaries rather than the exit-0 npm shim, slither and aderyn optional, no .env tracked, vendor/ matching the scaffolder\'s record). redbelly gas: a snapshot or forge gas report priced in RBNT and US cents at the base fee and feed price, with --diff. redbelly ship: pre-flight, the Slither check, the five-state tests and the gas report, written to deployments/ship-<chain>-<date>.md only when every check passes; the deploy script refuses 151 without today\'s. 57 tests on anvil; read-only runs against the real networks in reports/.',
    install: 'npx -y -p @gatedpath/preflight redbelly doctor',
    status: 'verified',
    lastVerified: '2026-09-14',
    planRef: 'PLAN section 16, Wave 4',
  },
  {
    name: 'Eligibility recipes',
    path: 'recipes',
    summary: 'Four recipes as recipe.json plus prose: over-18, au-wholesale-investor, accredited-issuer, business-delegate. Criterion in plain language, the Iden3 query shape, credential and issuer, the Gated binding, five-state expectations, a privacy note and dated sources. Drafts with 24 verify markers where the docs are silent; none has met a live verifier yet.',
    install: 'node recipes/check.mjs',
    status: 'draft',
    statusLabel: 'Drafts, not yet run against a live verifier',
    lastVerified: null,
    planRef: 'PLAN section 12.1',
  },
  {
    name: '@gatedpath/contract-kit',
    path: 'packages/contract-kit',
    summary: 'Contract kit v1: a gated ERC-20 on OpenZeppelin 5.6.1 where both parties of every movement must be eligible, an issuer registry with time-boxed mint allowances, a compliance role whose forced transfers carry a justification hash and emit an event, pause split between a fast pauser and a slow admin, and the Safe plus timelock admin pattern with a written emergency path. distribute() skips ineligible recipients and logs each denial instead of reverting. 53 tests: five-state on every gated function, fuzz at 512 runs, two invariant suites (supply conserved, no ineligible recipient, nothing moves while paused, forced transfers carry a hash, issuer within allowance, no ineligible holder without revocation). Slither and Aderyn reports triaged, gas snapshot, one page per module, and an ERC-3643 comparison. The scaffolder copies its src/ and test/ into every gated-erc20 project.',
    install: 'npm install @gatedpath/contract-kit',
    status: 'verified',
    lastVerified: '2026-09-12',
    planRef: 'PLAN section 5.5; section 16, Wave 5',
  },
  {
    name: '@gatedpath/frontend-kit',
    path: 'packages/frontend-kit',
    summary: 'React components for the five states every Redbelly dApp has (not connected, not verified on the network, ineligible for this action, eligible, credential expiring soon) and one hook, useEligibility(address, verifier, requestId), that reads permission.isAllowed and the verifier once per new block or thirty seconds, caches through wagmi, and refreshes on demand. Headless with a default style from the site tokens. Vine\'s wallet gas warning as a component and a doc. explainError(error) turns a viem or wagmi error (NotEligible with the credential state when known, a wallet rejection, a wrong chain, not enough RBNT) into the plain words from the shared failure table; the scaffold\'s web app shows them instead of a hex revert. 95 Vitest tests over a mocked transport; the scaffolder\'s web app has the demo page at /eligibility. Never suggests anvil\'s default accounts, and a test makes sure.',
    install: 'npm install @gatedpath/frontend-kit',
    status: 'verified',
    lastVerified: '2026-09-14',
    planRef: 'PLAN section 5.6; section 16, Wave 5',
  },
  {
    name: '@gatedpath/ops-kit',
    path: 'packages/ops-kit',
    summary: 'Routescan scripts for transfers, holders and verified source; an alert poller that posts pause, forced transfer, role, verifier and issuer events to a webhook from the environment; an RPC fallback helper across governors, Ankr and Uniblock (key from the environment, never embedded); a Goldsky subgraph template with the note that Redbelly on Goldsky needs Redbelly\'s approval; and an incident runbook with a filled-in drill. 29 tests on local servers, anvil and a fake RPC; a recorded read-only run against a live mainnet token.',
    install: 'npx -y -p @gatedpath/ops-kit redbelly-alert --help',
    status: 'verified',
    lastVerified: '2026-09-12',
    planRef: 'PLAN section 5.8; section 16, Wave 5',
  },
  {
    name: 'Ship report (redbelly ship)',
    path: 'packages/preflight',
    summary: 'The generated document that gates mainnet, written by redbelly ship when pre-flight, the Slither check, the five-state tests and the gas report all pass: every check with its result, the deployer and admin with their isAllowed, Safe version, threshold and owners, the contracts from the deployment records with their constructor arguments and the exact forge verify-contract command, gas per function in RBNT and US cents, the compiler pins, and the list of what the report does not prove (monitoring live, security.txt, an audit). The deploy script refuses to broadcast on 151 without one dated today; 153 warns. Proven on a local chain 151 with the real Safe 1.4.1 bytecode and an impersonated Safe; no report has been written for a real network yet.',
    install: 'redbelly ship --chain 151 --account <keystore-name> --admin <safe>',
    status: 'verified',
    lastVerified: '2026-09-14',
    planRef: 'PLAN section 6, Deploy; section 18.3',
  },
];
