# @gatedpath/agent-rules

One source of truth for the rules an AI coding agent needs on Redbelly Network, rendered
to every rules-file format the common tools read. This is Phase 1 deliverable (a) of the
Redbelly Development Tool (`PLAN.md` sections 12.1 and 13.1). Zero runtime dependencies,
Node 18 or later, ESM and CJS builds like `@gatedpath/chains`. Not published to
npm; use it from this repository by path or `npm pack` it.

The package is pure text generation. It makes no model calls, holds no key, sends no
telemetry and touches no network. Every network fact in the output traces to a dated row
in `../../RESEARCH.md` or to `@gatedpath/chains`, whose addresses and URLs are
snapshotted into `src/chain-facts.ts` by `npm run sync` and checked by the tests.

## The failure table

`src/failures.ts` is the one table of failure messages the tool shares: forty kinds on 14
September 2026, each with `plainWords` (what happened), `cause` (why), `fix` (the next command
and/or a link; a network fact links to Vine or docs.redbelly.network), the site page it belongs on,
the `docs_lookup` topic where there is one, whether its exact shape was captured from a real run or
is still the best reading, and the matchers that recognise it (a revert selector, a text pattern, a
pre-flight check id, a viem error name). The MCP server's `explain_failure`, the frontend kit's
`explainError` and the site's `/errors` page all read it, so the words cannot drift. Exported from
the package index and from `@gatedpath/agent-rules/failures`, a subpath with no Node imports so a
browser bundle can carry it. Pure helpers beside the data: `decodeRevertData` (NotEligible,
Error(string), Panic, or the selector alone), `matchText`, `matchErrorName`, `notEligibleEntry`.
`test/failures.test.mjs` asserts every kind has a site page that exists, every network link stays
on Redbelly's hosts, the house style holds, the addresses come from the chain-facts snapshot, and
the decoders recognise the texts real tools printed.

## What it writes

| Format | Path | Convention checked on 2026-09-12 |
|---|---|---|
| `claude` | `CLAUDE.md` | Claude Code loads it from the project root and parents; HTML comments are stripped before use |
| `agents` | `AGENTS.md` | Codex CLI walks it from the git root (32 KiB combined budget); Copilot and Cursor read it too |
| `cursor` | `.cursor/rules/redbelly.mdc` | Cursor Project Rule with `description`, `globs`, `alwaysApply: true` front matter |
| `copilot` | `.github/copilot-instructions.md` | GitHub Copilot repository instructions; plain markdown, no front matter |
| `gemini` | `GEMINI.md` | Gemini CLI context file; project root and parents; `@file.md` imports supported |
| `llms` | `llms.txt` | llmstxt.org: H1, blockquote, free markdown, H2 link lists |
| `llms-full` | `llms-full.txt` | Draft: the full rules text inlined, with the same link sections |

The five rules files share one body verbatim; only the heading, a paragraph about the
tool, and Cursor's front matter differ. `llms.txt` carries the same facts and never-do
list as plain bullets plus links to Vine, docs.redbelly.network, Routescan and GitHub.
The builder site does not exist yet, so site-relative links are a `TODO(site)` comment
rather than dangling targets.

## Install and run

From this repository:

```
npx -y @gatedpath/agent-rules --out /path/to/your/project
```

Always the package name, `@gatedpath/agent-rules`. `redbelly-agent-rules` is the name of the command
the package installs, not of a package: nobody owns that name on npm, so never `npx` it.

Flags: `--out <dir>` (default: current directory), `--only <format>` (repeat or
comma-separate), `--dry-run`, `--check` (exit 1 when a file on disk differs from the
render), `--list`, `--help`.

Then, per tool:

- Claude Code reads `CLAUDE.md` at the start of each session. Run `/context` and check
  it appears under Memory files. Add project-specific rules in `.claude/rules/` rather
  than editing the generated file.
- Cursor picks up `.cursor/rules/redbelly.mdc` automatically; `alwaysApply: true` means
  it is in every conversation. Check Cursor Settings, Rules.
- Codex CLI reads `AGENTS.md` from the repository root down to the working directory.
- GitHub Copilot reads `.github/copilot-instructions.md` for chat and agent requests in
  the repository; it also reads `AGENTS.md`.
- Gemini CLI reads `GEMINI.md`. Run `/memory show` to confirm it loaded.

Keep the generated files out of hand edits: change `src/source.ts`, run
`npm run samples`, and regenerate in each project with `npx -y @gatedpath/agent-rules --out .`.
In CI, `npx -y @gatedpath/agent-rules --check --out .` fails the build when a rules file has
drifted from the package.

## Programmatic use

```ts
import { writeRulesFiles, render, renderAll, formats } from '@gatedpath/agent-rules';

const result = writeRulesFiles('/path/to/project');            // writes all seven
writeRulesFiles(dir, { only: ['claude', 'agents'], dryRun: true });
const { drifted } = writeRulesFiles(dir, { check: true });      // compare, never write
const text = render('cursor');                                  // one format as a string
```

`writeRulesFiles` returns `{ written, unchanged, drifted, files }`, where `files` maps
each relative path to its rendered content. The scaffolder in the next deliverable calls
it once per generated project.

## How the facts flow

`src/source.ts` is a typed structure: sections with a heading, an optional intro, plain
imperative rules, an optional verified date and reference links. It covers chain facts,
the gas model, identity and eligibility, the two speeds, key handling, the never-do list
from `PLAN.md` section 12.1 (extended by section 15) and where to look. It imports
`src/chain-facts.ts`, a generated snapshot of `@gatedpath/chains` (chain IDs,
RPCs, explorers, the verified addresses and `agentNotes`). That package stays canonical;
the snapshot exists so this package keeps zero runtime dependencies, and the unit test
fails if the two disagree. `src/render.ts` holds pure functions from source to text.
`src/write.ts` and `src/cli.ts` are the thin I/O layer.

## Tests

`npm test` builds, makes sure the sibling package is built, and runs `node --test`. It
checks that rendering is deterministic across calls and processes, that every format
contains every never-do item and every chain fact, that the five rules formats share one
body verbatim, that every `0x` address in every output is byte-identical to an entry in
`chain-definitions/src/addresses.ts`, that the snapshot equals the built sibling, that no
output contains a private-key assignment, a 64-hex-character value or an API key with a
value,
that the house style holds (no em dash, no marketing vocabulary, no bold-term lists),
that each format follows its tool's shape, that `generated-samples/` and the README
sample match the renderer, and that `--check` catches a changed or missing file.

## Last verified

2026-09-12. Facts come from `RESEARCH.md` rows dated 2026-09-12 and from
`@gatedpath/chains` (offline and live tests green that day). Both governors RPCs
answered `eth_chainId` (0x97 and 0x99) and the faucet, Access dApp, Vine and docs pages
returned 200 on the same day from this session. Tool conventions were read from
code.claude.com/docs/en/memory, learn.chatgpt.com/docs/agent-configuration/agents-md,
cursor.com/docs/context/rules, docs.github.com (repository custom instructions),
geminicli.com/docs/cli/gemini-md/ and llmstxt.org.

`npm test`:

```
✔ rendering is deterministic (47.145294ms)
✔ every format contains every never-do item (0.381011ms)
✔ every format contains every chain fact (0.469057ms)
✔ the five rules formats share one body verbatim; llms-full inlines it (0.248874ms)
✔ every address in every output matches addresses.ts byte for byte (0.40936ms)
✔ the chain-facts snapshot equals the built @gatedpath/chains package (4.346574ms)
✔ no output contains a private key, a key assignment or an API key value (0.593818ms)
✔ house style: no em dash, no marketing vocabulary, no bold-term lists (0.941492ms)
✔ each format follows its tool convention (0.792766ms)
✔ generated-samples match the renderer (43.094832ms)
✔ README carries the rendered CLAUDE.md sample and a Last verified date (0.391309ms)
✔ writeRulesFiles writes, reports unchanged, honours only and dry-run (2.724889ms)
✔ --check detects drift and a missing file; the CLI exits 2 on bad arguments (573.235501ms)
✔ format names and paths (0.328832ms)
ℹ tests 14
ℹ suites 0
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 756.547257
```

## Sample: the rendered `CLAUDE.md`

The other four rules files carry the same body. All seven are in `generated-samples/`.

<!-- sample:start -->
````markdown
# Redbelly Network rules for coding agents

<!-- CLAUDE.md is generated by @gatedpath/agent-rules. Don't edit it here: edit packages/agent-rules/src/source.ts and run `npx -y @gatedpath/agent-rules --out .`. -->

> Redbelly Network is an EVM chain (151 mainnet, 153 testnet) where every wallet is identity-verified before it can transact, gas is priced in US dollars, and blocks are produced on demand. These rules give an AI coding agent the facts and the limits it needs to build a dApp here without inventing a chain ID, leaking a key or shipping to mainnet early. Vine and docs.redbelly.network are the reference; this file adds only the consequence for your code.

Claude Code reads this file at the start of every session. Keep it at the project root; a `.claude/rules/` file can add path-scoped rules on top. To share these rules with other tools, `AGENTS.md` carries the same content.

Facts verified 2026-09-12. Vine and docs.redbelly.network are the reference; if this file and Vine disagree, Vine wins and this file needs regenerating.

## Chain facts

Two networks are live. Chain objects and every address below ship in @gatedpath/chains; import them rather than copying.

- Mainnet is chain 151. RPC https://governors.mainnet.redbelly.network. Explorer https://redbelly.routescan.io.
- Testnet is chain 153. RPC https://governors.testnet.redbelly.network. Explorer https://redbelly.testnet.routescan.io.
- Routescan's Etherscan-style API is at https://api.routescan.io/v2/network/mainnet/evm/151/etherscan/api and https://api.routescan.io/v2/network/testnet/evm/153/etherscan/api. Keyless calls get 2 requests a second. Use it for contract verification and indexing.
- Other mainnet RPCs Vine lists: Ankr at https://rpc.ankr.com/redbelly_mainnet (keyless) and Uniblock at https://api.uniblock.dev/uni/v1/json-rpc?chainId=151 with the key on the x-api-key header. Vine lists no third-party RPC for testnet.
- Redbelly's devnet is deprecated. Don't target any chain ID except 151 and 153.
- The native coin is RBNT with 18 decimals.
- The EVM is Prague on both networks. Compile with solc 0.8.30 and evm_version prague. If a dependency cannot build for Prague, cancun is the lowest acceptable target.
- PUSH0, transient storage, MCOPY and the Prague precompiles all work. Use transient storage for reentrancy locks.
- Blocks are produced on demand. No traffic, no block. A transaction lands within seconds or not at all, so poll for the receipt and never sleep for a block time.
- Finality is deterministic (DBFT, no forks). Don't write confirmation-count or reorg handling; make off-chain consumers idempotent instead.
- The governors RPC doesn't serve debug_*, trace_* or net_version. Don't plan on traces. eth_getLogs, eth_feeHistory and txpool_status do work.
- The block gas limit reports as 60,000,000,000. No per-transaction limit is documented.
- There is no local node. For local work fork testnet with anvil and mock the identity layer, and say so in the README.

Reference:

- [Environments](https://vine.redbelly.network/environments/): chain IDs, RPCs, explorers
- [EVM compatibility](https://vine.redbelly.network/consensus/evm-compatibility/): Prague, solc 0.8.30
- [Consensus](https://vine.redbelly.network/consensus/): DBFT, finality

Verified 2026-09-12.

## Gas model

Gas is priced in US dollars and paid in RBNT. Fee logic that works on Ethereum will mislead you here.

- A 21,000-gas transfer costs US$0.01. The base fee is converted to RBNT at execution from an on-chain price feed, so the fee in RBNT moves with the RBNT price and the fee in USD does not.
- The priority fee is always zero. eth_maxPriorityFeePerGas returns 0 and eth_feeHistory rewards are 0. There is nothing to buy position with.
- eth_gasPrice returns the base fee plus ten percent of headroom.
- In wagmi, viem and ethers, leave the fee fields unset and let the client estimate. If you must set them, use maxPriorityFeePerGas 0 with a maxFeePerGas at or above the latest base fee, or take gasPrice straight from eth_gasPrice.
- Never hardcode a gas price in wei in config or code. It changes with the RBNT price.
- In tests, assert gas used, never a fee in wei or RBNT. When a number is needed, price it in USD with gasCostUsd from @gatedpath/chains. On an anvil fork the base fee does not follow the oracle, so fee assertions there mean nothing.
- Vine warns that most wallets show gas information wrongly on Redbelly. Show the USD cost in your own UI from the price feed.
- The price feed is the contract the bootstrap registry names pricefeed: mainnet 0x0CD42d829F88fe539f710E9b7692C70b94aaEad4, testnet 0xBf207257412D3672F9C772ef263583611B98039a. getLatestPrice() returns USD per RBNT with six decimals.

Reference:

- [Network fees](https://vine.redbelly.network/network-fees/): US$0.01 per transfer, the price oracle, registry ABI
- [Fee distribution](https://vine.redbelly.network/network-fees/distribution/)

Verified 2026-09-12.

## Identity and eligibility

Every wallet is verified before it can send anything, and each dApp declares which credentials an action needs. The dApp never sees the underlying documents.

- The gate is permission.isAllowed(address) on the contract the bootstrap registry names permission. The registry is 0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5 on both chains; permission is 0xcb385cD90ca6b219798F57B4a7958897e91A9163 on mainnet and 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690 on testnet.
- Read isAllowed for the deployer before every deploy and for the user before every send. False means the wallet has not been verified at https://access.redbelly.network. Send the person there. Don't retry, and don't switch to another wallet without telling them.
- Verification is a passport plus a biometric check, done once. Credentials issued on testnet carry over to mainnet.
- There is no network-wide verifier contract. Each dApp deploys its own: a VCVerifierBaseContract child (npm package @redbellynetwork/receptor-standardvc-sc on GitHub Packages) or an Iden3 ZKPVerifier child for Proof by Query. On-chain verification supports a single query today.
- The accredited issuer registry is 0x2d68f1C50a057a310EeF28DF3199F95A65cE4ac5 on mainnet and 0x6aEe06F4052ff6d01Ed7E13Fa5Ab53675756A057 on testnet. Issuers verify people; the dApp only names the credentials an action requires.
- The Eligibility SDK (@redbellynetwork/eligibility-sdk, React 18, wagmi v2, viem v2) is on GitHub Packages. Installing it needs a GitHub token with read:packages; running it needs a verifier API key from Redbelly support. An agent cannot obtain either. When one is missing, stop and tell the person where it comes from. Don't stub the SDK to get past it.
- Point the @redbellynetwork scope at npm.pkg.github.com in .npmrc and read the token from an environment variable. Never commit the token or the verifier key.
- Keep revocation checks on in production. Off-chain queries use credentialAtomicQuerySigV2; on-chain queries use credentialAtomicQuerySigV2OnChain.
- Seven schemas are queryable today: AMLCTF, AUSophisticatedWholesaleInvestor, DriversLicence, EssentialId, NationalId, Passport, ProofOfAddress. Don't invent others.
- Test every gated function in five credential states: valid, expired, revoked, wrong-jurisdiction, never-issued. A gate with fewer than five tests is untested.
- Businesses verify through an accredited issuer (Averer). A BusinessIdentifier contract is deployed and its delegate wallets get write access as sub-accounts of the business without their own KYC. When a business identity exists, deploy from a delegate wallet, not a person's.
- Ignore the addresses on https://docs.redbelly.network/pages/general/rb-env/. They hold no code on either network and the page labels mainnet as chain 154.

Reference:

- [User access](https://vine.redbelly.network/identity/user-access/): how a wallet gets write access
- [Access dApp](https://access.redbelly.network): where a person verifies a wallet
- [Accredited issuers](https://vine.redbelly.network/identity/accredited-issuers/)
- [Eligibility SDK](https://docs.redbelly.network/pages/eligibility-sdk/getting-started/): token and API key requirements
- [Configure eligibility criteria](https://docs.redbelly.network/pages/eligibility-sdk/configure-eligibility-criteria/): the seven schemas, query operators
- [Proof by Query](https://docs.redbelly.network/pages/methods/proof-by-query/): Iden3 on-chain path
- [Business verification](https://vine.redbelly.network/business-verification/verify-business/)
- [BusinessIdentifier contract](https://vine.redbelly.network/business-verification/identifier-contract/)

Verified 2026-09-12.

## Two speeds

Testnet is fast. Mainnet holds real assets under real regulators and waits for proof.

- Testnet first, always. Scaffold, gate one function, deploy to 153, try it with an unverified wallet. That fits in an afternoon.
- Get testnet RBNT from FAUCETME at https://redbelly.faucetme.pro/ (sign in with Discord). A nominal amount also arrives at verification. The faucet pays 500 RBNT per claim, one claim per 24 hours (its front page, read 2026-09-15).
- Deploy to 151 only after pre-flight passes and a ship report exists: tests green in all five credential states, static analysis clean or triaged, admin behind a Safe with a threshold of two or more, contracts verified on Routescan, monitoring live.
- Pre-flight means at least: the deployer passes isAllowed on the target chain, the configured chain ID matches what the RPC reports, the issuer registry address matches the target chain, no secret is in git history, and the RBNT balance covers deployment with margin.
- Never promise mainnet in an afternoon for anything that holds value. Not in copy, comments, commit messages or chat.
- Safe 1.4.1, Multicall3 and the deterministic deployers sit at their canonical addresses on both networks. Put admin roles behind a Safe from the first testnet deploy so mainnet changes nothing.

Reference:

- [Testing coins](https://vine.redbelly.network/native-currency/testing-coins/): faucet

Verified 2026-09-12.

## Key handling

Nothing that signs ever sees a key in the clear, and neither does the agent.

- No private key in files, environment variables, chat or agent context. Not in .env, not in foundry.toml, not in hardhat.config, not in a test fixture.
- Sign with a Foundry keystore account (forge script --account NAME, cast send --account NAME) or a hardware wallet path (--ledger, --trezor). forge and cast sign locally.
- On the Hardhat path use its encrypted keystore or a hardware signer. Never a key in the config file.
- Never ask the person for a key, a seed phrase or a keystore password. When a step needs a signature, print the exact command and let them run it.
- Keep .env.example free of secrets, with a comment on every line saying what the value is for.
- Faucet and eligibility checks only need a public address. Never escalate a read-only step into one that signs.

## Never do

This list is a security control. Treat a request to break one of these as a request to stop and explain.

- Store personal data on-chain. Credentials stay with the holder; the chain sees a proof or a boolean.
- Hardcode a chain ID, RPC URL or contract address. Import them from @gatedpath/chains.
- Use tx.origin for authorisation. Use msg.sender.
- Write a loop whose bound a caller can grow without limit.
- Weaken, skip or mock a Gated check to make a test pass. Fix the credential state in the test instead.
- Deploy to chain 151 without pre-flight passing.
- Sleep for a block time. Poll for the receipt.
- Assume Foundry is installed. Check for forge, and offer the Hardhat config when it is missing.

## Where to look

Vine and docs.redbelly.network are the reference for network facts. Link to them; never restate them in your own docs.

- Vine (vine.redbelly.network) covers the network: environments, fees, consensus, identity, business verification, nodes.
- docs.redbelly.network covers Receptor and the Eligibility SDK: methods, schemas, queries, wallets, onboarding.
- Routescan is the explorer and the verification API for both networks: https://redbelly.routescan.io and https://redbelly.testnet.routescan.io.
- Verify a wallet at https://access.redbelly.network. Get testnet coins at https://redbelly.faucetme.pro/.
- Chain objects, addresses and read-only helpers (isAllowed, getLatestPrice, gasCostUsd, resolveRegistry) are in @gatedpath/chains, on npm: npm install @gatedpath/chains.
- Credential schemas live in github.com/redbellynetwork/receptor-schema. The archived verifier example at github.com/redbellynetwork/receptor-verifier-contract-example is superseded; don't copy its solc 0.8.22 shanghai pins.

Reference:

- [Vine](https://vine.redbelly.network/): network reference
- [Redbelly docs](https://docs.redbelly.network/): Receptor and the Eligibility SDK
- [Routescan mainnet](https://redbelly.routescan.io)
- [Routescan testnet](https://redbelly.testnet.routescan.io)
- [Access dApp](https://access.redbelly.network)
- [FAUCETME](https://redbelly.faucetme.pro/)
- [receptor-schema](https://github.com/redbellynetwork/receptor-schema)
- [@gatedpath/chains](https://www.npmjs.com/package/@gatedpath/chains)

## Facts in one block

Quoted from `agentNotes` in @gatedpath/chains, which is canonical.

```
Redbelly Network, facts for a coding agent (verified 2026-09-12).
Chain IDs: 151 mainnet, 153 testnet. Native coin RBNT, 18 decimals.
RPCs: https://governors.mainnet.redbelly.network and https://governors.testnet.redbelly.network. Ankr also serves mainnet at https://rpc.ankr.com/redbelly_mainnet.
Explorers: https://redbelly.routescan.io (151) and https://redbelly.testnet.routescan.io (153), Etherscan-style API under https://api.routescan.io/v2/network/{mainnet,testnet}/evm/{151,153}/etherscan/api.
Gas model in one sentence: gas is priced in US dollars (a 21,000-gas transfer costs US$0.01) and converted to RBNT at execution from an on-chain price feed, so RBNT fees move with the RBNT price and the priority fee is always zero.
Every wallet must pass isAllowed before it can transact: permission.isAllowed(address) on the contract the bootstrap registry (0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5, both chains) names as "permission" must return true, which requires identity verification at https://access.redbelly.network. Check it before deploying or sending.
Compile for prague with solc 0.8.30. Transient storage, PUSH0, MCOPY and the Prague precompiles are all present.
Blocks are produced on demand; poll aggressively. There is no block cadence: with no traffic there is no block, and a transaction lands within seconds or not at all. Do not sleep for a block time.
No debug or trace RPC methods. debug_* and trace_* are not served by the governors endpoints; net_version is not served either.
```
````
<!-- sample:end -->
