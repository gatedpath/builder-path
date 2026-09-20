// The one table of failure messages for the whole tool: what happened, why, and the next command
// or link, in that order. The MCP server's explain_failure, the frontend kit's explainError and the
// site's /errors page all read this file, so the words cannot drift between them. Pure data plus a
// few pure helpers: no node imports, no network, no clock, so a browser bundle can carry it.
//
// Style: contractions, plain words, no exclamation marks, no marketing vocabulary, no em dashes. Every
// network fact links to Vine or docs.redbelly.network; the entry adds only the consequence for the
// builder's code. An entry whose real shape has not been seen says so in `status`.
//
// Measured figures quoted below come from the wave 6 run of 14 September 2026
// (packages/create-redbelly-dapp/reports/golden-path-dev-2026-09-14.md and cards/runs/2026-09-14/card-01.md).
import { chainFacts } from './chain-facts.js';

export type FailureGroup = 'contract' | 'deploy-script' | 'preflight' | 'network' | 'wallet' | 'forge' | 'cast' | 'anvil' | 'tooling' | 'doctor';

/** How an entry is recognised. Every matcher is data so a page can show it. */
export type FailureMatcher =
  /** The first four bytes of revert data, lower-case, 0x-prefixed. */
  | { readonly type: 'selector'; readonly value: string }
  /** A case-insensitive regular expression source matched against a message or a pasted stderr. */
  | { readonly type: 'text'; readonly value: string }
  /** A pre-flight check line: `fail  <id>  ...` or the JSON check with that id and status. */
  | { readonly type: 'preflight'; readonly id: string }
  /** A viem or wagmi error class name, matched against `error.name` while walking the cause chain. */
  | { readonly type: 'error-name'; readonly value: string }
  /** A redbelly-doctor check line: `fail  <id>  ...` or the JSON check with that id and status. */
  | { readonly type: 'doctor'; readonly id: string };

export interface FailureEntry {
  /** Stable kebab-case id. Anchors on the site's /errors page and the `kind` every decoder returns. */
  readonly kind: string;
  readonly group: FailureGroup;
  /** A short heading. */
  readonly title: string;
  /** What happened, in one or two plain sentences. */
  readonly plainWords: string;
  /** Why it happened. */
  readonly cause: string;
  /** The next thing to run, or the page that says what to do. One or both. */
  readonly fix: { readonly command?: string; readonly link?: string };
  /** Site page the entry belongs on, as a path. The /errors page lists every entry as well. */
  readonly docsPage: string;
  /** A docs_lookup topic in the MCP server, when the network fact behind the entry has one. */
  readonly topic?: string;
  /** `measured` when the exact shape was captured from a real run; `pending` when it is the best reading so far. */
  /**
   * `measured`: we saw it ourselves, and `measured` says where. `reported`: someone else saw it and
   * published where; we have not, and `reportedBy` credits them. `pending`: nobody we know of has.
   */
  readonly status: 'measured' | 'reported' | 'pending';
  /** For `reported` entries: whose observation this is. Never a substitute for seeing it ourselves. */
  readonly reportedBy?: { readonly who: string; readonly url: string; readonly date: string };
  /** Where and when the shape was seen, or what is still missing. */
  readonly measured: string;
  readonly match: readonly FailureMatcher[];
}

/** `Gated.NotEligible(address,uint64)`: keccak256 of the signature, first four bytes. Checked by tests against a keccak implementation. */
export const NOT_ELIGIBLE_SELECTOR = '0x879342fb';
/** `Gated.ZeroVerifier()`. */
export const ZERO_VERIFIER_SELECTOR = '0x4a8bdce3';
/** Solidity's `Error(string)`. */
export const ERROR_STRING_SELECTOR = '0x08c379a0';
/** Solidity's `Panic(uint256)`. */
export const PANIC_SELECTOR = '0x4e487b71';

/** The five credential states, in `EligibilityStatus` enum order (receptor-mock/src/IRedbellyVerifier.sol). */
export const ELIGIBILITY_STATUS_NAMES = ['NeverIssued', 'Valid', 'Expired', 'Revoked', 'WrongJurisdiction'] as const;
export type EligibilityStatusName = (typeof ELIGIBILITY_STATUS_NAMES)[number];

const vine = (p: string) => `https://vine.redbelly.network/${p}`;
const docs = (p: string) => `https://docs.redbelly.network/pages/${p}`;
const ACCESS = 'https://access.redbelly.network';
const TESTNET_RPC = chainFacts.testnet.rpc;
const MAINNET_RPC = chainFacts.mainnet.rpc;
const TESTNET_PERMISSION = chainFacts.testnet.addresses.permission.address;
const BOOTSTRAP_REGISTRY = chainFacts.mainnet.addresses.bootstrapRegistry.address;
const FAUCET = 'https://redbelly.faucetme.pro/';
const FOUNDRY_INSTALL = 'https://getfoundry.sh/introduction/installation';
const NODE_INSTALL = 'https://nodejs.org/en/download';
const GIT_INSTALL = 'https://git-scm.com/downloads';
const ADERYN_INSTALL = 'https://github.com/Cyfrin/aderyn';
/** The line `redbelly-doctor` prints when the npm shim is on PATH; the real binary sits in the platform package beside it. */
export const FOUNDRY_SHIM_FIX = 'foundryup   # or link the real binary over the shim: ln -sf <shim dir>/node_modules/@foundry-rs/<tool>-<os>-<arch>/bin/<tool> <a dir on PATH>/<tool>';

const notEligibleFix = (state: string) => `cast call <verifier> "eligibilityStatus(address,uint64)(uint8)" <wallet> <requestId> --rpc-url <rpc>   # ${state}`;

export const failures: readonly FailureEntry[] = [
  // ---- the contract's own gate ----
  {
    kind: 'not-eligible',
    group: 'contract',
    title: 'NotEligible(wallet, requestId)',
    plainWords: "The contract refused this wallet: its verifier doesn't hold an accepted credential for the request id the gate is bound to.",
    cause: "Every function behind `gated` asks `verifier.isEligible(wallet, requestId)` and reverts with `NotEligible` on false. The wallet may hold no credential, an expired one, a revoked one, or one that doesn't satisfy the query; a real verifier only answers yes or no, so the reason isn't in the revert.",
    fix: { command: notEligibleFix('on ReceptorMock the answer names the state; a real verifier answers Valid or NeverIssued only'), link: docs('methods/proof-by-query/') },
    docsPage: '/concepts/identity-gate/',
    topic: 'verifier-contract',
    status: 'measured',
    measured: 'Local loop, 14 September 2026: `cast send` from the NeverIssued wallet answered `custom error 0x879342fb` with the wallet and 18 encoded, decoded by cast as NotEligible(wallet, 18).',
    match: [{ type: 'selector', value: NOT_ELIGIBLE_SELECTOR }, { type: 'text', value: 'NotEligible\\(' }],
  },
  {
    kind: 'not-eligible-never-issued',
    group: 'contract',
    title: 'NotEligible: no credential was ever issued',
    plainWords: 'The contract refused this wallet because it holds no credential at all for this request id.',
    cause: "`eligibilityStatus` on the verifier reads NeverIssued, the zero value: nothing was set for this wallet and request. On a fork or the local loop that means `setStatus` was never called for it; on a real network it means the person hasn't completed the eligibility flow for this dApp.",
    fix: { command: 'cast send <verifier> "setStatus(address,uint64,uint8)" <wallet> <requestId> 1 --unlocked --from <deployer> --rpc-url http://127.0.0.1:8545   # local loop only; 1 is Valid', link: docs('eligibility-sdk/getting-started/') },
    docsPage: '/concepts/identity-gate/',
    topic: 'eligibility-sdk',
    status: 'measured',
    measured: 'Local loop, 14 September 2026: wallet 2 (NeverIssued) calling subscribe() reverted NotEligible; the dev state panel and `eligibilityStatus` read 0.',
    match: [],
  },
  {
    kind: 'not-eligible-expired',
    group: 'contract',
    title: 'NotEligible: the credential has expired',
    plainWords: 'The contract refused this wallet because its credential is past its validity window.',
    cause: "`eligibilityStatus` reads Expired. `ReceptorMock` records an `expiresAt` and answers false once `block.timestamp` passes it; a real verifier rejects the proof for the same reason and says nothing more. The frontend kit's `expiring` state exists so a page warns before this happens.",
    fix: { command: notEligibleFix('Expired: the person renews the credential with its issuer, then tries again'), link: vine('identity/accredited-issuers/') },
    docsPage: '/concepts/identity-gate/',
    topic: 'accredited-issuers',
    status: 'measured',
    measured: 'Local loop, 14 September 2026: wallet 4 seeded Expired reverted NotEligible; the panel flipped wallet 3 to Expired and the gate re-rendered without a reload.',
    match: [],
  },
  {
    kind: 'not-eligible-revoked',
    group: 'contract',
    title: 'NotEligible: the issuer revoked the credential',
    plainWords: 'The contract refused this wallet because the issuer revoked its credential.',
    cause: '`eligibilityStatus` reads Revoked. Under Iden3 the revocation status lives in the reverse hash service and the verifier checks it on every proof while revocation checks stay on. Retrying does nothing; the issuer decides.',
    fix: { command: notEligibleFix('Revoked: only the issuer can reinstate it'), link: docs('eligibility-sdk/configure-eligibility-criteria/') },
    docsPage: '/concepts/identity-gate/',
    topic: 'revocation',
    status: 'measured',
    measured: 'Card 1 re-run, 14 September 2026: the panel set wallet 3 to Revoked for request id 708 and the gate read "Not eligible for this action".',
    match: [],
  },
  {
    kind: 'not-eligible-wrong-jurisdiction',
    group: 'contract',
    title: "NotEligible: the credential doesn't satisfy the query",
    plainWords: "The contract refused this wallet because the credential it holds doesn't satisfy this request's query, or its issuer isn't on the allow-list.",
    cause: "`eligibilityStatus` reads WrongJurisdiction. The credential exists and is valid, but the claim doesn't meet the recipe's criterion (the wrong country, the wrong schema, an issuer the dApp doesn't accredit). Changing the wallet won't help; the recipe and the credential have to agree.",
    fix: { command: notEligibleFix('WrongJurisdiction: compare the recipe under recipes/ with the credential the person holds'), link: docs('eligibility-sdk/configure-eligibility-criteria/') },
    docsPage: '/concepts/identity-gate/',
    topic: 'eligibility-criteria',
    status: 'measured',
    measured: 'Local loop, 14 September 2026: wallet 6 seeded WrongJurisdiction reverted NotEligible.',
    match: [],
  },
  {
    kind: 'zero-verifier',
    group: 'contract',
    title: 'ZeroVerifier()',
    plainWords: 'The contract refused to be constructed or reconfigured with the zero address as its verifier.',
    cause: '`Gated` requires a verifier contract. On testnet and local chains the deploy script deploys a `ReceptorMock` when `VERIFIER` is unset; on mainnet it refuses instead, so this revert means a script or a test passed `address(0)` by hand.',
    fix: { command: 'grep -rn "VERIFIER" .env .env.example script/', link: docs('methods/proof-by-query/') },
    docsPage: '/concepts/identity-gate/',
    topic: 'verifier-contract',
    status: 'measured',
    measured: 'receptor-mock tests, 12 September 2026: `test_zeroVerifierReverts` expects the custom error.',
    match: [{ type: 'selector', value: ZERO_VERIFIER_SELECTOR }, { type: 'text', value: 'ZeroVerifier\\(' }],
  },

  // ---- the scaffold's deploy script (script/RedbellyDeployScript.sol, script/Deploy.s.sol) ----
  {
    kind: 'deploy-mainnet-no-safe',
    group: 'deploy-script',
    title: 'Mainnet without ADMIN_SAFE',
    plainWords: 'The deploy script refused to run against chain 151 because no admin Safe is set.',
    cause: 'On mainnet every privileged role goes to a Safe 1.4.1 with a threshold of at least 2, never to the deployer. `ADMIN_SAFE` is empty, so the script reverts before broadcasting anything.',
    fix: { command: 'ADMIN_SAFE=<safe address> redbelly-preflight --project contracts --chain 151 --address <deployer> --admin <safe address>', link: vine('environments/') },
    docsPage: '/review/',
    topic: 'safe',
    status: 'measured',
    measured: 'Scaffolder integration test, 12 September 2026: the cheatcode test for the mainnet path expects this revert; the fork run rehearsed the refusal.',
    match: [{ type: 'text', value: 'ADMIN_SAFE is not set' }],
  },
  {
    kind: 'deploy-admin-not-contract',
    group: 'deploy-script',
    title: 'ADMIN_SAFE is an externally owned account',
    plainWords: 'The deploy script refused chain 151 because the admin address has no code.',
    cause: 'A person\'s wallet can\'t be the mainnet admin: one stolen key would own every role. `ADMIN_SAFE` must be a contract, and specifically a Safe 1.4.1 proxy.',
    fix: { command: `cast code <admin> --rpc-url ${MAINNET_RPC}   # 0x means no contract`, link: vine('environments/') },
    docsPage: '/review/',
    topic: 'safe',
    status: 'measured',
    measured: 'Scaffolder integration test, 12 September 2026: an EOA admin on the mainnet path reverts with this message.',
    match: [{ type: 'text', value: 'ADMIN_SAFE is not a contract' }],
  },
  {
    kind: 'deploy-admin-not-safe',
    group: 'deploy-script',
    title: 'ADMIN_SAFE is not a Safe 1.4.1 on a canonical singleton',
    plainWords: "The deploy script refused chain 151 because the admin contract isn't a Safe 1.4.1 proxy pointing at the canonical singleton.",
    cause: "The script asks the admin for `VERSION()` and `masterCopy()` and accepts only \"1.4.1\" over the Safe or SafeL2 singleton recorded in @gatedpath/chains. A different multisig, an older Safe or a proxy on an unknown singleton all fail here.",
    fix: { command: `cast call <admin> "VERSION()(string)" --rpc-url ${MAINNET_RPC} && cast call <admin> "masterCopy()(address)" --rpc-url ${MAINNET_RPC}`, link: vine('environments/') },
    docsPage: '/review/',
    topic: 'safe',
    status: 'measured',
    measured: 'Scaffolder integration test, 12 September 2026: a contract that is not a Safe proxy reverts with this message on the mainnet path.',
    match: [{ type: 'text', value: 'ADMIN_SAFE is not a Safe 1\\.4\\.1' }],
  },
  {
    kind: 'deploy-threshold-below-2',
    group: 'deploy-script',
    title: 'ADMIN_SAFE threshold below 2',
    plainWords: 'The deploy script refused chain 151 because the admin Safe needs only one signature.',
    cause: 'A threshold of 1 is one stolen key away from every role on the contract. Mainnet requires 2 or more; testnet warns and continues.',
    fix: { command: `cast call <admin> "getThreshold()(uint256)" --rpc-url ${MAINNET_RPC}   # raise it in the Safe app, then retry`, link: vine('environments/') },
    docsPage: '/review/',
    topic: 'safe',
    status: 'measured',
    measured: 'Scaffolder integration test, 12 September 2026: the real Safe 1.4.1 bytecode on Anvil with threshold 1 reverts on the mainnet path and passes with threshold 2.',
    match: [{ type: 'text', value: 'ADMIN_SAFE threshold must be at least 2' }, { type: 'text', value: 'threshold is 1' }],
  },
  {
    kind: 'deploy-deployer-not-allowed',
    group: 'deploy-script',
    title: 'The deployer fails permission.isAllowed',
    plainWords: "The deploy script refused because the wallet that would sign isn't verified on this network.",
    cause: 'Before broadcasting on 151 or 153 the script reads `permission.isAllowed(deployer)` through the bootstrap registry. False means this wallet has never completed identity verification, so the network would reject its transactions anyway.',
    fix: { command: 'cast wallet address --account <keystore-name>   # then verify that address at https://access.redbelly.network', link: ACCESS },
    docsPage: '/concepts/identity-gate/',
    topic: 'wallet-verification',
    status: 'measured',
    measured: 'Scaffolder integration test, 12 September 2026: a deployer the mocked permission contract denies reverts here; the same read passes for the known allowed address on the real testnet.',
    match: [{ type: 'text', value: 'deployer fails permission\\.isAllowed' }],
  },
  {
    kind: 'deploy-not-redbelly',
    group: 'deploy-script',
    title: 'This RPC is not a Redbelly network',
    plainWords: 'The deploy script found no bootstrap registry at the recorded address, so the RPC it was given is not chain 151 or 153.',
    cause: "The script only checks identity when `block.chainid` is 151 or 153. It got one of those ids but the registry has no code, which happens with a plain Anvil started with `--chain-id 153` and no fork. `npm run dev` runs as chain 31337 for exactly this reason.",
    fix: { command: `cast chain-id --rpc-url <rpc> && cast code ${BOOTSTRAP_REGISTRY} --rpc-url <rpc>`, link: vine('environments/') },
    docsPage: '/start/',
    topic: 'chain-ids',
    status: 'measured',
    measured: 'Scaffolder integration test, 12 September 2026: chain 153 on Anvil without the mocked registry reverts here.',
    match: [{ type: 'text', value: 'bootstrap registry has no code' }, { type: 'text', value: "registry did not resolve 'permission'" }],
  },
  {
    kind: 'deploy-mainnet-no-verifier',
    group: 'deploy-script',
    title: 'Mainnet without VERIFIER',
    plainWords: 'The deploy script refused chain 151 because no verifier address is set.',
    cause: "On testnet and local chains the script deploys a `ReceptorMock` when `VERIFIER` is empty so the first deploy works. Mainnet never gets a mock: every wallet would start ineligible and the admin's `setStatus` would decide eligibility by hand.",
    fix: { command: 'VERIFIER=<your verifier contract> forge script script/Deploy.s.sol --rpc-url redbelly_mainnet --ledger --broadcast', link: docs('methods/proof-by-query/') },
    docsPage: '/review/',
    topic: 'verifier-contract',
    status: 'measured',
    measured: 'Scaffolder integration test, 12 September 2026: the gated-erc20 script reverts with this message on the mainnet path when VERIFIER is unset.',
    match: [{ type: 'text', value: 'VERIFIER is not set' }],
  },
  {
    kind: 'deploy-verifier-not-contract',
    group: 'deploy-script',
    title: 'VERIFIER has no code',
    plainWords: 'The deploy script refused because the verifier address set in the environment has no contract behind it on this chain.',
    cause: 'A verifier from another chain, a typo, or a mock address from an earlier local run. The gate would revert on every call.',
    fix: { command: 'cast code $VERIFIER --rpc-url <rpc>   # 0x means no contract on this chain', link: docs('methods/proof-by-query/') },
    docsPage: '/start/',
    topic: 'verifier-contract',
    status: 'measured',
    measured: 'Scaffolder cheatcode test, 12 September 2026.',
    match: [{ type: 'text', value: 'VERIFIER is not a contract' }],
  },

  {
    kind: 'deploy-no-ship-report',
    group: 'deploy-script',
    title: 'No ship report dated today for chain 151',
    plainWords: "The deploy script refused to broadcast on mainnet because `deployments/ship-151-<today>.md` isn't there.",
    cause: "Mainnet is gated by the ship report (PLAN.md 18.3): `redbelly ship` runs pre-flight, the Slither check, the five-state tests and the gas report, and writes the file only when every check passed. The script looks for today's date in UTC, so yesterday's report doesn't count. A dry run without `--broadcast` says so and continues; 153 warns instead.",
    fix: { command: 'redbelly ship --chain 151 --account <keystore-name> --admin <safe>   # in a scaffold: npm run ship -- --chain 151 --account <keystore-name> --admin <safe>' },
    docsPage: '/review/',
    status: 'measured',
    measured: "Scaffold `test/DeployPreflight.t.sol` and the scaffolder's Anvil chain-151 test with the real Safe 1.4.1 bytecode, 14 September 2026: `no ship report dated today for chain 151: run redbelly ship first`.",
    match: [{ type: 'text', value: 'no ship report dated today for chain 151' }],
  },
  // ---- redbelly-preflight, one entry per check id ----
  {
    kind: 'preflight-chain-id',
    group: 'preflight',
    title: 'chain-id',
    plainWords: "The project's config names one chain and the RPC reports another, or the RPC reports a chain that isn't 151 or 153.",
    cause: 'A `--rpc` that points at the wrong network, a Foundry profile whose `chain_id` was edited by hand, or a local Anvil that forked one chain under another id. Pre-flight refuses to guess which one you meant.',
    fix: { command: 'cast chain-id --rpc-url <rpc>   # compare with chain_id in foundry.toml or CHAIN_ID in .env', link: vine('environments/') },
    docsPage: '/review/',
    topic: 'chain-ids',
    status: 'measured',
    measured: 'Pre-flight tests, 12 September 2026: a profile pinned to 153 against an Anvil on 151 fails with the two ids in the line.',
    match: [{ type: 'preflight', id: 'chain-id' }],
  },
  {
    kind: 'preflight-deployer-verified',
    group: 'preflight',
    title: 'deployer-verified',
    plainWords: "The deployer wallet fails `permission.isAllowed` on this chain, or it's one of Anvil's ten default accounts.",
    cause: "Every transaction on Redbelly goes through the network's permission contract. A wallet that has never been through access.redbelly.network fails it; Anvil's default accounts 0 and 1 pass it on both real networks under an identity you don't control (RESEARCH.md question 30), so pre-flight warns on all ten.",
    fix: { command: 'cast wallet address --account <keystore-name>   # verify that address at https://access.redbelly.network; never deploy from an Anvil default account', link: ACCESS },
    docsPage: '/concepts/identity-gate/',
    topic: 'is-allowed',
    status: 'measured',
    measured: 'Read-only run against the real testnet, 12 and 14 September 2026: the known allowed address passes; the zero address fails; Anvil account 0 warns.',
    match: [{ type: 'preflight', id: 'deployer-verified' }],
  },
  {
    kind: 'preflight-admin-safe',
    group: 'preflight',
    title: 'admin-safe',
    plainWords: "The admin address isn't a Safe 1.4.1 with a threshold of at least 2, which mainnet requires.",
    cause: 'Pre-flight reads the admin\'s storage slot 0 for the singleton, hashes the singleton\'s code against the Safe 1.4.1 release and calls `getThreshold()`. On 153 an EOA or a threshold of 1 is a warning; on 151 it fails, and the deploy script refuses the same thing.',
    fix: { command: 'redbelly-preflight --project contracts --chain 151 --address <deployer> --admin <safe>   # after creating the Safe with two or more owners', link: vine('environments/') },
    docsPage: '/review/',
    topic: 'safe',
    status: 'measured',
    measured: 'Pre-flight tests, 12 September 2026, with the real Safe 1.4.1 bytecode on Anvil at threshold 1 and 2.',
    match: [{ type: 'preflight', id: 'admin-safe' }],
  },
  {
    kind: 'preflight-compiler-pins',
    group: 'preflight',
    title: 'compiler-pins',
    plainWords: "The project doesn't pin solc 0.8.30 and EVM prague, or has no foundry.toml or hardhat config to read them from.",
    cause: 'Both Redbelly networks run Prague. A contract compiled for a later EVM can deploy bytecode the network rejects, and an unpinned solc makes Routescan verification a guess.',
    fix: { command: 'grep -n "solc_version\\|evm_version" contracts/foundry.toml   # want solc_version = "0.8.30" and evm_version = "prague"', link: vine('consensus/evm-compatibility/') },
    docsPage: '/review/',
    topic: 'evm-version',
    status: 'measured',
    measured: 'Pre-flight tests, 12 September 2026: cancun and 0.8.28 fail with the offending setting named.',
    match: [{ type: 'preflight', id: 'compiler-pins' }],
  },
  {
    kind: 'preflight-git-secrets',
    group: 'preflight',
    title: 'git-secrets',
    plainWords: 'Something shaped like a secret was added in this repository\'s git history, or a .env file is tracked.',
    cause: "Pre-flight scans every added line for a 64-hex value, a `PRIVATE_KEY=` style assignment, twelve consecutive BIP-39 words or keystore JSON. A bare 64-hex value is flagged even when it's a hash: on 14 September 2026 a committed `contracts/reports/slither.sources.sha256` was refused for exactly that, which is why the scaffold now ignores `contracts/reports/`.",
    fix: { command: 'git log --all -p -S"<the value in the line>" -- <file>   # if it is a key, rotate it now; if it is a hash, move the file out of git and add it to .gitignore', link: vine('smart-contracts/interaction/') },
    docsPage: '/review/',
    topic: 'keys',
    status: 'measured',
    measured: "Card 1's first attempt, 14 September 2026: the Slither sources hash in git history was refused; reproduced in the wave 7 run.",
    match: [{ type: 'preflight', id: 'git-secrets' }],
  },
  {
    kind: 'preflight-balance',
    group: 'preflight',
    title: 'balance',
    plainWords: "The deployer holds less RBNT than the deployment needs at the current feed price, with pre-flight's 25% margin.",
    cause: 'Gas is priced in US dollars and paid in RBNT through the on-chain price feed, so the RBNT figure moves with the price. Pre-flight prices 3,000,000 gas unless `--gas` says otherwise. On 14 September 2026 the known allowed testnet address held 380.5 RBNT while 3,000,000 gas needed 768.4 RBNT (US$1.43 at the feed price); the measured deploy of `GatedERC20` is 1,899,210 gas, and `--gas 1899210` still needed 486.4 RBNT.',
    fix: { command: 'redbelly-preflight --project contracts --chain 153 --address <deployer> --gas 1899210   # then top up at the faucet if it still fails', link: FAUCET },
    docsPage: '/start/',
    topic: 'faucet',
    status: 'measured',
    measured: 'Read-only run against the real testnet, 14 September 2026, at 3,000,000 gas and again at the measured 1,899,210.',
    match: [{ type: 'preflight', id: 'balance' }],
  },
  {
    kind: 'preflight-slither-report',
    group: 'preflight',
    title: 'slither-report',
    plainWords: 'There is no Slither report, or the one there describes older sources than the ones about to deploy.',
    cause: "Pre-flight looks for `reports/slither.json` and the `slither.sources.sha256` sidecar beside it, and recomputes the hash of every .sol under src/. A changed source with an unchanged report is stale. Without a sidecar it falls back to git commit times, which a clean re-run can't satisfy.",
    fix: { command: 'npm run lint:slither   # writes contracts/reports/slither.json and the sources hash beside it', link: 'https://github.com/crytic/slither' },
    docsPage: '/review/',
    status: 'measured',
    measured: 'Pre-flight tests, 12 September 2026; the sidecar rule was added the same day after the card runs.',
    match: [{ type: 'preflight', id: 'slither-report' }],
  },
  {
    kind: 'secret-in-argument',
    group: 'tooling',
    title: 'An argument looked like a key',
    plainWords: 'The tool refused to run because an argument had the shape of a private key, a seed phrase or a keystore.',
    cause: 'Nothing in this tool takes a key. Pre-flight, the MCP server and the scaffold all sign through a Foundry keystore name (`--account`) or a hardware wallet, and refuse a 64-hex value, a `privateKey` argument or twelve BIP-39 words before anything runs. If a real key was pasted, it has been exposed to a log or a chat.',
    fix: { command: 'cast wallet import <keystore-name> --interactive   # then use --account <keystore-name>; if a real key was pasted, move the funds and retire it', link: vine('smart-contracts/interaction/') },
    docsPage: '/agents/',
    topic: 'keys',
    status: 'measured',
    measured: 'MCP and pre-flight tests, 12 September 2026: five tools and the CLI refuse a 64-hex argument by its name, never its value.',
    match: [{ type: 'text', value: 'looks like a (private key|secret)' }],
  },

  // ---- the network's own gate ----
  {
    kind: 'wallet-not-allowed',
    group: 'network',
    title: 'permission.isAllowed is false',
    plainWords: "This wallet hasn't been verified on this network, so it can't send any transaction here.",
    cause: "Redbelly gates every wallet behind a one-time identity check (a passport and a biometric check, done at access.redbelly.network). Until it's done, `permission.isAllowed(wallet)` is false. The dApp never sees the documents; it only gets this boolean.",
    fix: { command: `cast call ${TESTNET_PERMISSION} "isAllowed(address)(bool)" <wallet> --rpc-url ${TESTNET_RPC}   # send the person to ${ACCESS} with this same wallet`, link: ACCESS },
    docsPage: '/concepts/identity-gate/',
    topic: 'is-allowed',
    status: 'measured',
    measured: 'Read on both real networks, 12 and 14 September 2026: true for the known allowed addresses, false for the zero address and Anvil accounts 2 to 9.',
    match: [{ type: 'text', value: 'fails permission\\.isAllowed' }, { type: 'text', value: 'isAllowed[^\\n]*false' }],
  },
  {
    kind: 'node-rejects-unverified-wallet',
    group: 'network',
    title: 'The node rejected a transaction from an unverified wallet',
    plainWords: 'The network itself refused a transaction from a wallet that fails `permission.isAllowed`, before any contract ran.',
    cause: "Vine says a wallet must have network access before it can write, and access is three things in order: hold the network access credential, fund the account (enabling is itself a transaction that needs gas), and enable the account on THAT network (mainnet and testnet are enabled separately). The governors RPC answers `eth_sendRawTransaction` with a JSON-RPC error, so nothing lands on chain and no receipt exists. We have not captured the error ourselves: a fork and a local Anvil don't enforce the node-level permission map, and no unverified wallet of ours has signed against the real testnet. The wording recognised here was published by a DAO developer with a testnet transaction as evidence.",
    fix: { command: `cast call ${TESTNET_PERMISSION} "isAllowed(address)(bool)" <wallet> --rpc-url ${TESTNET_RPC}`, link: vine('identity/user-access/') },
    docsPage: '/start/',
    topic: 'is-allowed',
    status: 'reported',
    reportedBy: { who: 'Rahman (Rahmandefi), Redbelly troubleshooting wiki, error 21', url: 'https://dev.to/rahmandefi/redbelly-network-troubleshooting-fixes-for-the-21-most-common-developer-errors-17i', date: '2026-07-09' },
    measured: 'Not captured by us. Reported on 9 July 2026 as `Sender not authorised to write transactions`, on a first transaction from a wallet not yet enabled on testnet; added here on 19 September 2026. The first of us to see it on the real network replaces this line with where and when.',
    match: [{ type: 'text', value: 'sender not authori[sz]ed to write' }],
  },

  // ---- wallets and viem in the browser ----
  {
    kind: 'user-rejected',
    group: 'wallet',
    title: 'The person rejected the request in their wallet',
    plainWords: 'The wallet reported that the person declined to sign.',
    cause: 'Nothing was sent. viem raises `UserRejectedRequestError` (EIP-1193 code 4001) and wagmi passes it through.',
    fix: { link: vine('smart-contracts/interaction/') },
    docsPage: '/identity/',
    topic: 'wallet-gas-display',
    status: 'measured',
    measured: 'Frontend kit tests, 14 September 2026, over a mocked transport that raises the viem error.',
    match: [{ type: 'error-name', value: 'UserRejectedRequestError' }, { type: 'text', value: 'User rejected the request' }],
  },
  {
    kind: 'wallet-wrong-chain',
    group: 'wallet',
    title: 'The wallet is on another chain',
    plainWords: "The wallet is connected to a different chain from the one this app is built for, so the request can't go through.",
    cause: 'viem raises `ChainMismatchError` when the wallet\'s current chain differs from the chain the client expects, and `SwitchChainError` when the wallet refuses to switch. Redbelly testnet is chain 153 and mainnet is 151; wallets that don\'t know them need the chain added first.',
    fix: { command: `cast chain-id --rpc-url ${TESTNET_RPC}   # 153; ask the wallet to switch to it`, link: vine('environments/') },
    docsPage: '/start/',
    topic: 'chain-ids',
    status: 'measured',
    measured: 'Frontend kit tests, 14 September 2026, over a mocked transport.',
    match: [{ type: 'error-name', value: 'ChainMismatchError' }, { type: 'error-name', value: 'SwitchChainError' }, { type: 'text', value: 'current chain of the wallet' }],
  },
  {
    kind: 'insufficient-funds',
    group: 'wallet',
    title: 'Not enough RBNT for gas',
    plainWords: "The wallet doesn't hold enough RBNT to pay for this transaction's gas.",
    cause: "Gas is priced in US dollars and converted to RBNT at execution from the price feed, so the amount of RBNT a transaction needs moves with the RBNT price. A 21,000-gas transfer costs about US$0.01. The node answers `Insufficient funds for gas * price + value`; viem raises `InsufficientFundsError`. With an RPC to hand, `gasCostUsd` from @gatedpath/chains prices the shortfall.",
    fix: { command: `cast balance <wallet> --rpc-url ${TESTNET_RPC} --ether   # testnet RBNT comes from the faucet`, link: FAUCET },
    docsPage: '/concepts/gas-model/',
    topic: 'gas',
    status: 'measured',
    measured: 'Anvil, 14 September 2026: `cast send` from an empty account answered error code -32003 with that message.',
    match: [{ type: 'error-name', value: 'InsufficientFundsError' }, { type: 'text', value: 'insufficient funds for gas' }],
  },

  // ---- forge and cast ----
  {
    kind: 'keystore-not-found',
    group: 'cast',
    title: 'No keystore of that name',
    plainWords: "forge or cast found no keystore with the name you gave under ~/.foundry/keystores.",
    cause: "`--account <name>` names a file in the Foundry keystore directory. The name is wrong, the keystore was created under another `$HOME`, or it was never imported. Nothing was signed.",
    fix: { command: 'ls ~/.foundry/keystores && cast wallet import <keystore-name> --interactive   # paste the key into the prompt, never into a file or a command line', link: 'https://getfoundry.sh/cast/reference/cast-wallet-import' },
    docsPage: '/start/',
    status: 'measured',
    measured: 'cast 1.7.1, 14 September 2026: `cast wallet address --account nosuch` answered `Error: Keystore file "…/nosuch" does not exist`.',
    match: [{ type: 'text', value: 'Keystore file [^\\n]* does not exist' }],
  },
  {
    kind: 'keystore-wrong-password',
    group: 'cast',
    title: 'Wrong keystore password',
    plainWords: "forge or cast couldn't decrypt the keystore with the password it was given.",
    cause: 'The password file holds the wrong password, or the keystore was encrypted with another one. The error names the keystore path and ends with `Mac Mismatch`. Nothing was signed.',
    fix: { command: 'cast wallet address --account <keystore-name>   # type the password at the prompt; then check what the --password-file holds', link: 'https://getfoundry.sh/cast/reference/cast-wallet-address' },
    docsPage: '/start/',
    status: 'measured',
    measured: 'cast 1.7.1, 14 September 2026: a wrong `--password-file` answered `Error: Failed to decrypt keystore "…" Context: - Mac Mismatch`.',
    match: [{ type: 'text', value: 'Failed to decrypt keystore' }, { type: 'text', value: 'Mac Mismatch' }],
  },
  {
    kind: 'password-file-not-found',
    group: 'cast',
    title: 'The password file does not exist',
    plainWords: "forge or cast couldn't find the file named by --password-file.",
    cause: 'The path is wrong or relative to another directory. Nothing was signed.',
    fix: { command: 'ls -l <password-file>', link: 'https://getfoundry.sh/cast/reference/cast-wallet-address' },
    docsPage: '/start/',
    status: 'measured',
    measured: 'cast 1.7.1, 14 September 2026: `Error: Keystore password file "…" does not exist`.',
    match: [{ type: 'text', value: 'Keystore password file [^\\n]* does not exist' }],
  },
  {
    kind: 'chain-mismatch',
    group: 'forge',
    title: 'The RPC is not the chain this was meant for',
    plainWords: 'The RPC you pointed at reports a different chain from the one the command, the config or the tool expected.',
    cause: "Redbelly testnet is 153 and mainnet is 151; `npm run dev` runs as 31337 whatever it forks. forge doesn't compare a script's target with the RPC, so the checks that do are pre-flight's `chain-id`, the deploy script's registry read, and `deploy_testnet`, which refuses any RPC reporting 151.",
    fix: { command: 'cast chain-id --rpc-url <rpc>', link: vine('environments/') },
    docsPage: '/start/',
    topic: 'chain-ids',
    status: 'measured',
    measured: 'MCP tests, 12 September 2026: `deploy_testnet` against an Anvil on 151 is refused before pre-flight runs.',
    match: [{ type: 'text', value: 'this RPC reports chain 151' }, { type: 'text', value: 'reports chain \\d+, which is neither' }],
  },
  {
    kind: 'rpc-unreachable',
    group: 'cast',
    title: 'The RPC did not answer',
    plainWords: "forge or cast couldn't reach the RPC URL at all.",
    cause: `Nothing is listening there: Anvil isn't running, the port in the URL is wrong, or the network is down. Redbelly's governors RPCs are ${TESTNET_RPC} and ${MAINNET_RPC}.`,
    fix: { command: 'cast chain-id --rpc-url <rpc>   # for the local loop: npm run dev, then http://127.0.0.1:8545', link: vine('environments/') },
    docsPage: '/start/',
    topic: 'rpc',
    status: 'measured',
    measured: 'cast 1.7.1, 14 September 2026: `Error: error sending request for url (http://127.0.0.1:1/)`.',
    match: [{ type: 'text', value: 'error sending request for url' }, { type: 'text', value: 'ECONNREFUSED' }],
  },
  {
    kind: 'forge-std-missing',
    group: 'forge',
    title: 'forge-std is not installed',
    plainWords: "forge can't find `forge-std`, so nothing under script/ or test/ compiles.",
    cause: 'The scaffold pins forge-std by tag and installs it with `forge install --no-git` from `npm run contracts:install`; a fresh clone or a scaffold that skipped that step has an empty lib/.',
    fix: { command: 'npm run contracts:install', link: 'https://getfoundry.sh/forge/reference/forge-install' },
    docsPage: '/start/',
    status: 'measured',
    measured: 'forge 1.7.1, 14 September 2026: `Error (6275): Source "forge-std/Script.sol" not found: File not found.`',
    match: [{ type: 'text', value: 'Source "forge-std/[^"]*" not found' }, { type: 'text', value: '"forge-std/[^"]*" in "' }],
  },
  {
    kind: 'compile-error',
    group: 'forge',
    title: 'The contracts do not compile',
    plainWords: 'solc reported an error, so forge stopped before building anything.',
    cause: "The line after `Error (<code>):` says what. The scaffold's `deny = \"warnings\"` turns warnings into errors on purpose: an unused variable in a gated contract is worth stopping for.",
    fix: { command: 'cd contracts && forge build', link: vine('consensus/evm-compatibility/') },
    docsPage: '/start/',
    topic: 'solc',
    status: 'measured',
    measured: 'forge 1.7.1, 14 September 2026: `Error: Compiler run failed:` followed by the solc diagnostic.',
    match: [{ type: 'text', value: 'Compiler run failed' }],
  },
  {
    kind: 'solc-version-missing',
    group: 'forge',
    title: 'solc version not available',
    plainWords: "forge couldn't fetch or find the solc version the config pins.",
    cause: 'A typo in `solc_version`, or no network to download the compiler on first use. Redbelly pins 0.8.30.',
    fix: { command: 'grep solc_version contracts/foundry.toml   # 0.8.30; then forge build once with network access', link: vine('consensus/evm-compatibility/') },
    docsPage: '/start/',
    topic: 'solc',
    status: 'measured',
    measured: 'forge 1.7.1, 14 September 2026: `Error: version not found in artifacts for this platform: 0.8.99`.',
    match: [{ type: 'text', value: 'version not found in artifacts' }],
  },
  {
    kind: 'forge-not-found',
    group: 'tooling',
    title: 'forge or cast is not installed',
    plainWords: "The command needs forge, cast or anvil and none was found on PATH.",
    cause: "Foundry isn't installed, or was installed into a directory the current shell doesn't search. Where `foundryup` is blocked, the npm packages carry the same binaries.",
    fix: { command: 'curl -L https://foundry.paradigm.xyz | bash && foundryup   # or: npm install -g @foundry-rs/forge @foundry-rs/anvil @foundry-rs/cast', link: FOUNDRY_INSTALL },
    docsPage: '/start/',
    status: 'measured',
    measured: 'dev.mjs exit 3 and node `spawn forge ENOENT`, both in the scaffolder tests of 14 September 2026.',
    match: [{ type: 'text', value: 'spawn (forge|cast) ENOENT' }, { type: 'text', value: '(forge|cast): command not found' }, { type: 'text', value: 'forge is not installed or not on PATH' }, { type: 'doctor', id: 'forge' }, { type: 'doctor', id: 'cast' }],
  },
  {
    kind: 'anvil-not-found',
    group: 'anvil',
    title: 'anvil is not installed',
    plainWords: '`npm run dev` needs anvil for the local chain and none was found on PATH.',
    cause: "anvil ships with Foundry. `dev.mjs` exits 3 with the install line when forge or anvil is missing.",
    fix: { command: 'foundryup   # or: npm install -g @foundry-rs/anvil', link: FOUNDRY_INSTALL },
    docsPage: '/start/',
    status: 'measured',
    measured: 'Scaffolder test `test/dev.test.mjs`, 14 September 2026: exit 3 with `[dev] … not found on PATH`.',
    match: [{ type: 'text', value: 'spawn anvil ENOENT' }, { type: 'text', value: 'anvil: command not found' }, { type: 'text', value: 'not found on PATH; forge and anvil are needed' }, { type: 'doctor', id: 'anvil' }],
  },
  {
    kind: 'port-in-use',
    group: 'anvil',
    title: 'The port is already in use',
    plainWords: "anvil couldn't bind its port because something else is listening there.",
    cause: 'A previous Anvil is still running, or another program holds 8545. `npm run dev` takes `--port` for a different one.',
    fix: { command: 'lsof -i :8545   # stop it, or: npm run dev -- --port 8546', link: 'https://getfoundry.sh/anvil/reference/anvil' },
    docsPage: '/start/',
    status: 'measured',
    measured: 'anvil 1.7.1, 14 September 2026: `Error: Address already in use (os error 98)`.',
    match: [{ type: 'text', value: 'Address already in use' }, { type: 'text', value: 'EADDRINUSE' }],
  },
  {
    kind: 'dev-already-running',
    group: 'anvil',
    title: 'npm run dev is already running',
    plainWords: 'A second `npm run dev` found the first one still running and stopped.',
    cause: 'The lock in `deployments/local.lock` names the pid and port of the running loop. Exit code 2. A stale lock from a crashed run is ignored.',
    fix: { command: 'cat deployments/local.lock   # Ctrl-C in that shell, or kill <pid>', link: 'https://getfoundry.sh/anvil/reference/anvil' },
    docsPage: '/start/',
    status: 'measured',
    measured: 'Scaffolder test `test/dev.test.mjs`, 14 September 2026: exit 2 on a second run.',
    match: [{ type: 'text', value: 'npm run dev is already running' }],
  },
  {
    kind: 'slither-not-found',
    group: 'tooling',
    title: 'slither is not installed',
    plainWords: "`npm run lint:slither` couldn't run Slither, so no report was written.",
    cause: 'Slither 0.11.6 comes from PyPI. Without it the report pre-flight wants never exists.',
    fix: { command: 'pip install slither-analyzer==0.11.6 && npm run lint:slither', link: 'https://github.com/crytic/slither' },
    docsPage: '/review/',
    status: 'measured',
    measured: "Scaffold `scripts/slither.mjs`, 14 September 2026: `slither wrote no report; is slither 0.11.6 installed`.",
    match: [{ type: 'text', value: 'slither wrote no report' }, { type: 'text', value: 'spawn slither ENOENT' }, { type: 'text', value: 'slither: command not found' }, { type: 'doctor', id: 'slither' }],
  },
  // ---- what redbelly-doctor checks on a machine before the first command ----
  {
    kind: 'node-too-old',
    group: 'doctor',
    title: 'Node is older than 22',
    plainWords: 'The Node on PATH is older than 22, and the scaffold, the MCP server and the web app are built and tested on 22.',
    cause: "Node 22 is the version every package here pins in CI (`actions/setup-node` with 22) and the one the scaffold's `engines` field asks for; older Nodes lack APIs the tools use and are past or near end of life.",
    fix: { command: 'nvm install 22 && nvm use 22   # or install 22 LTS from nodejs.org', link: NODE_INSTALL },
    docsPage: '/start/',
    status: 'measured',
    measured: "redbelly-doctor's own test, 14 September 2026, with a node version of 20.19.0 handed to the check: `fail  node  v20.19.0 is older than 22`.",
    match: [{ type: 'doctor', id: 'node' }],
  },
  {
    kind: 'foundry-exit-code-shim',
    group: 'doctor',
    title: 'forge, anvil or cast is the npm shim that drops the exit code',
    plainWords: 'The forge, anvil or cast on PATH is the `@foundry-rs` npm wrapper (`bin.mjs`), which exits 0 whatever the binary returned, so a failed build, test or deploy reports success.',
    cause: 'The 1.7.1 npm packages install a Node script that spawns the real binary from a platform package and never forwards its exit status. Anything that reads an exit code, `npm run dev`, `status`, CI and pre-flight among them, is fooled. The real binary sits beside the shim in `node_modules/@foundry-rs/<tool>-<os>-<arch>/bin/`.',
    fix: { command: FOUNDRY_SHIM_FIX, link: FOUNDRY_INSTALL },
    docsPage: '/start/',
    status: 'measured',
    measured: 'Wave 7, 14 September 2026: `forge build` with a failed compiler run exited 0 through the shim; the same day `cast --this-flag-does-not-exist` exited 0 through the shim and 2 through the real binary, which is the probe redbelly-doctor runs.',
    match: [{ type: 'doctor', id: 'foundry-exit-code' }],
  },
  {
    kind: 'foundry-version-mismatch',
    group: 'doctor',
    title: 'forge, anvil and cast are not one version',
    plainWords: "forge, anvil and cast on PATH report different versions, so what tests locally isn't what deploys or forks.",
    cause: 'One tool was updated on its own, or two installs (foundryup and the npm packages, say) are both on PATH and each wins for a different tool. Foundry ships the three together and only tests them together.',
    fix: { command: 'foundryup   # one install for all three; then: forge --version && anvil --version && cast --version', link: FOUNDRY_INSTALL },
    docsPage: '/start/',
    status: 'measured',
    measured: "redbelly-doctor's own test, 14 September 2026, with a PATH holding a forge that answers 1.7.1 beside a cast that answers 1.6.0: `fail  foundry-version`.",
    match: [{ type: 'doctor', id: 'foundry-version' }],
  },
  {
    kind: 'git-not-found',
    group: 'doctor',
    title: 'git is not installed',
    plainWords: 'No git on PATH, so nothing here can check what is tracked, forge cannot install forge-std, and pre-flight cannot scan history.',
    cause: "git isn't installed or the shell doesn't search the directory it lives in.",
    fix: { command: 'apt-get install git   # or brew install git; downloads for every platform on git-scm.com', link: GIT_INSTALL },
    docsPage: '/start/',
    status: 'measured',
    measured: "redbelly-doctor's own test, 14 September 2026, with an empty PATH: `fail  git  not found on PATH`.",
    match: [{ type: 'doctor', id: 'git' }, { type: 'text', value: 'git: command not found' }, { type: 'text', value: 'spawn git ENOENT' }],
  },
  {
    kind: 'env-tracked',
    group: 'doctor',
    title: '.env is tracked by git',
    plainWords: 'A `.env` file is tracked by git, so whatever goes into it goes into every clone and every push.',
    cause: "The scaffold's `.gitignore` covers `.env`, but the file was added with `git add -f`, the ignore line was removed, or the project didn't start from the scaffold. The values in `.env` are public addresses today; the habit is what gets a key committed tomorrow.",
    fix: { command: 'git rm --cached .env && echo ".env" >> .gitignore && git commit -m "untrack .env"   # the scaffold ignores .env already; check the line is still there' },
    docsPage: '/review/',
    status: 'measured',
    measured: "redbelly-doctor's own test, 14 September 2026, on a repository with `.env` committed: `fail  env-tracked  .env is tracked`.",
    match: [{ type: 'doctor', id: 'env-tracked' }],
  },
  {
    kind: 'vendor-drift',
    group: 'doctor',
    title: 'vendor/ does not match what the scaffolder shipped',
    plainWords: "The packages under `vendor/` aren't the versions this scaffold was made with, so the rules files, the chain facts or the frontend kit may not match the rest of the project.",
    cause: "`create-redbelly-dapp` records the version of each vendored package in the root `package.json` under `redbelly.vendor`; a copy from another scaffold, a hand edit or a partial update leaves `vendor/<name>/package.json` saying something else.",
    fix: { command: 'npx create-redbelly-dapp@latest fresh-copy --yes && cp -R fresh-copy/vendor/. vendor/   # then npm install and npm run rules:check' },
    docsPage: '/start/',
    status: 'measured',
    measured: "redbelly-doctor's own test, 14 September 2026, on a scaffold whose vendored chains package was edited to 0.0.9 against a record of 0.1.0: `fail  vendor`.",
    match: [{ type: 'doctor', id: 'vendor' }],
  },
  {
    kind: 'aderyn-not-found',
    group: 'doctor',
    title: 'aderyn is not installed (optional)',
    plainWords: "`npm run lint:aderyn` can't run because Aderyn isn't on PATH. It is optional; Slither is the analyser pre-flight requires.",
    cause: 'Aderyn is a separate install. CI runs it through `npx @cyfrin/aderyn@0.6.8`; on a machine behind a proxy that wrapper may fail to fetch its binary, and the Rust install works instead.',
    fix: { command: 'npm install -g @cyfrin/aderyn@0.6.8   # or: cargo install aderyn', link: ADERYN_INSTALL },
    docsPage: '/review/',
    status: 'measured',
    measured: "redbelly-doctor, 14 September 2026, in the build environment where Aderyn's npm wrapper cannot fetch its binary: `warn  aderyn  not found on PATH`.",
    match: [{ type: 'doctor', id: 'aderyn' }, { type: 'text', value: 'aderyn: command not found' }, { type: 'text', value: 'spawn aderyn ENOENT' }],
  },
];

export const FAILURE_KINDS: readonly string[] = failures.map((f) => f.kind);

export function failureByKind(kind: string): FailureEntry | undefined {
  return failures.find((f) => f.kind === kind);
}

/** The entry for a `NotEligible` revert once the verifier has named the credential state. */
export function notEligibleEntry(status?: EligibilityStatusName | number | null): FailureEntry {
  const name = typeof status === 'number' ? ELIGIBILITY_STATUS_NAMES[status] : status ?? undefined;
  const byState: Record<string, string> = {
    NeverIssued: 'not-eligible-never-issued',
    Expired: 'not-eligible-expired',
    Revoked: 'not-eligible-revoked',
    WrongJurisdiction: 'not-eligible-wrong-jurisdiction',
  };
  const kind = name ? byState[name] : undefined;
  return failureByKind(kind ?? 'not-eligible')!;
}

// ---- pure decoding helpers, no dependencies ----

const HEX = /^0x[0-9a-fA-F]*$/;

/** A decoded revert: the selector, and the arguments when the selector is one this table knows. */
export interface DecodedRevert {
  readonly selector: string;
  readonly kind: string | null;
  /** `NotEligible(wallet, requestId)` arguments. */
  readonly notEligible?: { readonly wallet: string; readonly requestId: string };
  /** `Error(string)` text. */
  readonly reason?: string;
  /** `Panic(uint256)` code. */
  readonly panic?: number;
}

function word(hex: string, index: number): string | null {
  const start = 8 + index * 64;
  const w = hex.slice(start, start + 64);
  return w.length === 64 ? w : null;
}

/** Decodes revert data. Unknown selectors return `kind: null` with the selector; malformed input returns null. */
export function decodeRevertData(data: string): DecodedRevert | null {
  const trimmed = data.trim();
  if (!HEX.test(trimmed) || trimmed.length < 10) return null;
  const hex = trimmed.slice(2).toLowerCase();
  const selector = `0x${hex.slice(0, 8)}`;
  if (selector === NOT_ELIGIBLE_SELECTOR) {
    const w0 = word(hex, 0);
    const w1 = word(hex, 1);
    if (!w0 || !w1) return { selector, kind: 'not-eligible' };
    return { selector, kind: 'not-eligible', notEligible: { wallet: `0x${w0.slice(24)}`, requestId: BigInt(`0x${w1}`).toString() } };
  }
  if (selector === ERROR_STRING_SELECTOR) {
    const lenWord = word(hex, 1);
    const len = lenWord ? Number(BigInt(`0x${lenWord}`)) : 0;
    const bytes = hex.slice(8 + 128, 8 + 128 + len * 2);
    let reason = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) reason += String.fromCharCode(parseInt(bytes.slice(i, i + 2), 16));
    const entry = matchText(reason);
    return { selector, kind: entry?.kind ?? null, reason };
  }
  if (selector === PANIC_SELECTOR) {
    const w0 = word(hex, 0);
    return w0 ? { selector, kind: null, panic: Number(BigInt(`0x${w0}`)) } : { selector, kind: null };
  }
  const bySelector = failures.find((f) => f.match.some((m) => m.type === 'selector' && m.value === selector));
  return { selector, kind: bySelector?.kind ?? null };
}

/** Finds revert data inside a message such as cast's `custom error 0x…: …, data: "0x…"` or a node's `execution reverted` text. */
export function revertHexIn(text: string): string | null {
  const quoted = /data:\s*"(0x[0-9a-fA-F]{8,})"/.exec(text);
  if (quoted) return quoted[1]!;
  const custom = /custom error (0x[0-9a-fA-F]{8}):\s*([0-9a-fA-F]{64,})/.exec(text);
  if (custom) return custom[1]! + custom[2]!;
  const bare = /(?<![0-9a-fA-F])(0x[0-9a-fA-F]{8}(?:[0-9a-fA-F]{64})*)(?![0-9a-fA-F])/.exec(text);
  if (bare && bare[1]!.length > 10) return bare[1]!;
  return null;
}

/** The first entry whose text matcher hits, in table order. Pre-flight and doctor lines are matched by id. */
export function matchText(text: string): FailureEntry | undefined {
  // A fail line first; a warn line only when nothing failed (doctor's optional checks warn).
  const pre =
    /(?:^|\n)\s*fail\s+([a-z-]+)\s/m.exec(text) ??
    /"id"\s*:\s*"([a-z-]+)"\s*,\s*"status"\s*:\s*"fail"/.exec(text) ??
    /(?:^|\n)\s*warn\s+([a-z-]+)\s/m.exec(text) ??
    /"id"\s*:\s*"([a-z-]+)"\s*,\s*"status"\s*:\s*"warn"/.exec(text);
  if (pre) {
    const byId = failures.find((f) => f.match.some((m) => (m.type === 'preflight' || m.type === 'doctor') && m.id === pre[1]));
    if (byId) return byId;
  }
  for (const f of failures) {
    for (const m of f.match) {
      if (m.type === 'text' && new RegExp(m.value, 'i').test(text)) return f;
    }
  }
  return undefined;
}

/** The entry for a viem or wagmi error class name, when the table knows it. */
export function matchErrorName(name: string): FailureEntry | undefined {
  return failures.find((f) => f.match.some((m) => m.type === 'error-name' && m.value === name));
}
