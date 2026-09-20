# @gatedpath/mcp

```
For agents
- Fourteen tools over stdio. Read-only: chain_info, is_verified, gas_estimate_usd, preflight,
  five_state_tests, rules_files_check, docs_lookup, status, explain_failure. Signing through forge
  with a keystore name: deploy_testnet (refuses chain 151, refuses when pre-flight fails),
  verify_routescan (dry run by default).
- Call status with the project path before a turn: it returns compiles, tests, slither, rulesFiles,
  deployments and next, the one command to run. No network call unless rpc is given.
- Call explain_failure with a revert (hex or message), a txHash with chain, or a pasted stderr: it
  returns kind, plainWords, cause and fix from the shared failure table, or kind "unknown" with the
  raw text. It never guesses and never signs.
- Never pass a private key, seed phrase or keystore to any tool. Every tool refuses arguments
  shaped like one before running. Use `account: "<keystore-name>"` and let forge sign.
- Mainnet is never deployed from here. There is no faucet tool; docs_lookup("faucet") gives the URL.
- docs_lookup links to Vine and docs.redbelly.network and quotes one consequence line; read the page.
```

The local MCP server from PLAN.md sections 12.1 and 13: the boring Redbelly steps as tools an
agent can call, running on the builder's machine, holding nothing. `@modelcontextprotocol/sdk`
1.30.0 (pinned; the `McpServer.registerTool`, `StdioServerTransport` and `InMemoryTransport`
surfaces were read from that release's `dist/esm/*.d.ts` and README on 2026-09-12), zod 4.6.2,
Node 18 or newer. Stdio only: no port, no hosted variant, no telemetry, no model call, no API key.

## Tools

| Tool | Arguments | Does |
|---|---|---|
| `chain_info` | `chain` | Chain object, every verified address with its date and source, the known allowed test address. No network call. |
| `is_verified` | `address`, `chain`, `rpc?` | `permission.isAllowed(address)` through the bootstrap registry. False means the person has not been through access.redbelly.network. |
| `gas_estimate_usd` | `gas`, `chain`, `rpc?` | RBNT and USD for that gas at the latest base fee and feed price (`gasCostUsd` from `@gatedpath/chains`). |
| `preflight` | `project`, `chain?`, `rpc?`, `address?` or `account?` (+ `passwordFile?`), `admin?`, `gas?`, `profile?`, `skip?` | Runs `redbelly-preflight --json` and returns the report plus the exit code. |
| `five_state_tests` | `project`, `matchContract?` | Finds every test contract that inherits `GatedTest`, runs `forge test --match-contract` with `--json`, returns pass/fail per test. |
| `rules_files_check` | `project` | `redbelly-agent-rules --check` through the package API: which rules files match the render, which drifted, which are missing. |
| `deploy_testnet` | `project`, `script`, `account`, `passwordFile?`, `rpc?`, `admin?`, `gas?`, `sig?`, `skipSimulation?` | Reads `eth_chainId` and refuses 151; runs pre-flight with the same keystore name and refuses on any fail; then `forge script <script> --rpc-url <rpc> --account <name> --broadcast`. Returns the CREATE transactions from `broadcast/…/run-latest.json`. |
| `verify_routescan` | `project`, `address`, `contract`, `chain`, `constructorArgs?`, `profile?`, `dryRun` (default true) | Builds `forge verify-contract … --verifier etherscan --verifier-url <Routescan> --etherscan-api-key verifyContract --compiler-version … --evm-version … --num-of-optimizations …`. Dry run appends `--show-standard-json-input`, which compiles and prints what would be sent and makes no network call. `dryRun: false` appends `--watch` and submits. |
| `docs_lookup` | `topic` | URL on Vine or docs.redbelly.network for one of thirty topics (aliases accepted) plus the one consequence sentence from `@gatedpath/agent-rules`, quoted, so the two cannot drift. Never fetches. |
| `status` | `project`, `rpc?`, `chain?` | `{ compiles, tests: { passed, failed, fiveState }, slither: { present, fresh }, rulesFiles: "match" \| "drifted" \| "missing", deployments: { local, 153, 151 }, next: { step, command, why } }`. Runs `forge build` and `forge test --json` locally, reads the Slither report and its sources hash, checks the five rules files, reads `deployments/local.json`, the `deployments/<chain>-<Name>.json` records and `broadcast/`. `next` is the first step not done in the order compile, tests, five-state tests, Slither, rules files, pre-flight, testnet deploy, verify, ship report, with the exact command; a step that signs says so in `why` and is never run. No network call unless `rpc` is given; with it, pre-flight runs read-only and Routescan is asked about a testnet deployment. |
| `explain_failure` | one of `revert`, `txHash` (+ `chain`), `stderr`; `rpc?` | `{ kind, plainWords, cause, fix: { command?, link? } }` from the failure table in `@gatedpath/agent-rules`. `revert` is hex data or a printed message; `txHash` reads the receipt, replays a status-0 transaction with `eth_call` at its block to recover the revert data, and follows a `NotEligible` with a read of the verifier's `eligibilityStatus` (NeverIssued, Expired, Revoked or WrongJurisdiction on a `ReceptorMock`); `stderr` is a pasted forge, cast, anvil, `npm run dev` or `redbelly-preflight` failure. Unknown input answers `kind: "unknown"` with the raw text. With `rpc`, an RBNT failure carries the current price through `gasCostUsd`. Read-only. |

Every input schema is a strict zod object: an unknown argument is an error (`-32602`), not
something dropped. Before any handler runs, the arguments are walked by the secret scanner from
`@gatedpath/preflight`: a bare 64-hex string, a 0x 64-hex string, an argument named
`privateKey`, `mnemonic`, `password` or similar, twelve consecutive BIP-39 words, or keystore
JSON is refused with a message that names the argument path and not the value. One exemption:
`explain_failure`'s `txHash` may be a 0x 64-hex value, because a transaction hash has a key's
shape and the tool only ever reads a receipt for it; the other rules still apply there.

## The failure table

`explain_failure` reads `packages/agent-rules/src/failures.ts`, the one table of failure kinds the
frontend kit's `explainError` and the site's `/errors` page read as well, so an agent, a page and
the docs show the same words. Each entry says what happened, why, and the next command or link, in
that order; a network fact links to Vine or docs.redbelly.network. Forty kinds on 14 September
2026: the contract's `NotEligible` (and one entry per credential state behind it) and
`ZeroVerifier`, the deploy script's eight refusals, the seven pre-flight check ids, the network's
`isAllowed` gate, the node-level rejection of an unverified wallet (its shape still pending; the
entry says so and gives the best reading), the wallet errors a page sees, and the forge, cast,
anvil and tooling failures captured from real runs. The recorded run of both tools on a fresh
scaffold is `reports/wave-7-run-2026-09-14.md`.

`rpc` overrides exist so a local anvil fork can stand in for testnet. `deploy_testnet` still
asks that RPC for its chain ID and refuses 151 whatever the URL.

The faucet tool from section 12.1 is not registered. `src/tools/faucet.stub.ts` records why
(RESEARCH.md question 16, and FAUCETME's Discord login) and the shape it will take.

## Install

The package is on npm as `@gatedpath/mcp` (since 18 September 2026) and `npx -y @gatedpath/mcp` starts it. The snippets were each checked with a built entry on disk; `npx` with the arguments `-y @gatedpath/mcp` starts the same process.
Build it once (`npm ci && npm run build` in this folder) and substitute the absolute path of
`dist/main.js` for `/path/to/redbelly-mcp/dist/main.js`. Each line was checked against the
tool's current documentation on 2026-09-12; sources at the end.

Claude Code (one command; add `--scope project` to share it through `.mcp.json`):

```
claude mcp add --transport stdio redbelly -- node /path/to/redbelly-mcp/dist/main.js
```

Cursor (`.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` for everywhere):

```json
{ "mcpServers": { "redbelly": { "type": "stdio", "command": "node", "args": ["/path/to/redbelly-mcp/dist/main.js"] } } }
```

Codex CLI (one command; or the same in `~/.codex/config.toml` / `.codex/config.toml`):

```
codex mcp add redbelly -- node /path/to/redbelly-mcp/dist/main.js
```

```toml
[mcp_servers.redbelly]
command = "node"
args = ["/path/to/redbelly-mcp/dist/main.js"]
```

Windsurf (`~/.codeium/windsurf/mcp_config.json`):

```json
{ "mcpServers": { "redbelly": { "command": "node", "args": ["/path/to/redbelly-mcp/dist/main.js"] } } }
```

GitHub Copilot in VS Code (`.vscode/mcp.json` in the repository; the `servers` key, not `mcpServers`):

```json
{ "servers": { "redbelly": { "type": "stdio", "command": "node", "args": ["/path/to/redbelly-mcp/dist/main.js"] } } }
```

Gemini CLI (one command; or `mcpServers` in `settings.json`):

```
gemini mcp add redbelly node /path/to/redbelly-mcp/dist/main.js
```

```json
{ "mcpServers": { "redbelly": { "command": "node", "args": ["/path/to/redbelly-mcp/dist/main.js"] } } }
```

`node dist/main.js --version` prints the version and exits; anything else starts the server
on stdin/stdout and waits for a client.

## Tests

`npm test` builds and runs five files, 31 tests:

- `test/server.test.mjs`, over the SDK's `InMemoryTransport`: the tool list and its
  annotations, strict-schema errors, the key guard on five tools and a seed phrase, every
  read-only tool against an anvil on chain 153 prepared by the pre-flight package's fixture
  (mocked registry, permission and price feed at the recorded addresses), `rules_files_check`
  on a fresh render and on a drifted file, `preflight` through the CLI, and both
  `deploy_testnet` refusals: an RPC that reports 151 (refused before pre-flight runs) and a
  failing pre-flight (refused before forge runs).
- `test/stdio.test.mjs`: the real binary over stdio through `StdioClientTransport`.
- `test/forge.test.mjs` (skipped without forge and cast): `five_state_tests` against
  `packages/receptor-mock` (four suites found, none failing), `verify_routescan` dry run against
  its `GatedCounter` for 153 and 151 (standard JSON input: Prague, 200 runs, seven sources,
  nothing submitted), and `deploy_testnet` end to end on an anvil with chain ID 153: `cast wallet
  new` creates and encrypts a keystore under a temporary `$HOME`, pre-flight passes, `forge script
  --account deployer --password-file … --broadcast` deploys, the tool reads the CREATE from
  `run-latest.json`, and `eth_getCode` confirms the contract. The password never appears in the
  result and the key never leaves the keystore.
- `test/explain.test.mjs`: the selectors in the table against `functionSelector`, every docs topic
  in the table against `docs_lookup`, the `NotEligible` revert from the wave 6 transcript as hex
  and as cast's message, the pre-flight balance line with the measured figures, `Error(string)` data,
  the real cast, forge and anvil texts, unknown input, the key guard with the `txHash` exemption;
  then on an anvil (chain 153) receptor-mock's `GatedCounter` behind a `ReceptorMock`, wallet 8
  seeded Expired, its `increment()` mined with status 0 and explained from its hash as
  `not-eligible-expired` with the verifier read at the failing block, a successful transaction and
  an unknown hash left as `unknown`, and the price attached through `gasCostUsd`.
- `test/status.test.mjs`: the exact shape and the fixed order; a project with nothing to test
  stops at tests; a missing forge-std stops at compile with the table's words; a working copy of
  receptor-mock walked from rules files (missing, then drifted, then matching) through pre-flight
  (with `rpc`, read-only against an anvil; a wrong pin becomes the next step), the testnet deploy
  (the wallet-rule `why`), verify (a record moves past deploy; `verifiedAt` moves past verify) and
  the ship report to done; `deployments/local.json` and a `broadcast/` folder read back; a scaffold
  layout recognised from its root or its `contracts/` folder.

## Routescan recipe status

RESEARCH.md question 28 asked for the exact `forge verify-contract` invocation. Routescan's own
Foundry article gives `--verifier-url 'https://api.routescan.io/v2/network/testnet/evm/<chainId>/etherscan'`
with `--etherscan-api-key "verifyContract"` and `--compiler-version` matching `foundry.toml`, and
Vine's environments page gives the network path and chain IDs, so the URLs are
`…/network/testnet/evm/153/etherscan` and `…/network/mainnet/evm/151/etherscan`. On 2026-09-12
both URL forms (with and without a trailing `/api`) answered a read-only
`checkverifystatus` for chain 153 through `forge verify-check` with `{"status":"0","result":"Verification not found"}`,
which is the Etherscan-shaped answer forge expects. The dry run against `GatedCounter` compiles
and prints the standard JSON input. Later the same day (Phase 2b) the dry run was repeated against
the scaffolder's `GatedERC20` with its constructor encoding, and the exact commands for 153 and
151 are on the site's `/start` page. What has not happened: a real submission from this project,
because no contract of ours is deployed yet. The question stays partial.

## Sources

| What | Where | Checked |
|---|---|---|
| MCP SDK API: `McpServer.registerTool(name, {description, inputSchema, annotations}, cb)`, `StdioServerTransport` from `server/stdio.js`, `InMemoryTransport.createLinkedPair()` from `inMemory.js`, `Client` from `client/index.js`, zod `^3.25 \|\| ^4.0` peer | `@modelcontextprotocol/sdk` 1.30.0 tarball from registry.npmjs.org: `README.md`, `dist/esm/server/mcp.d.ts`, `inMemory.d.ts`, `server/stdio.d.ts`, `client/index.d.ts` | 2026-09-12 |
| Claude Code: `claude mcp add [options] <name> -- <command> [args...]`, `--transport stdio`, `--scope project` writes `.mcp.json`, `claude mcp add-json` | code.claude.com/docs/en/mcp | 2026-09-12 |
| Cursor: `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global), `mcpServers` with `type`, `command`, `args`, `env` | cursor.com/docs/context/mcp | 2026-09-12 |
| Codex CLI: `codex mcp add <name> -- <command>`; `~/.codex/config.toml` or `.codex/config.toml` with `[mcp_servers.<name>]` `command`, `args`, `env` | developers.openai.com/codex/mcp | 2026-09-12 |
| Windsurf: `~/.codeium/windsurf/mcp_config.json`, `mcpServers` with `command`, `args`, `env` | docs.windsurf.com/windsurf/cascade/mcp | 2026-09-12 |
| Copilot in VS Code: `.vscode/mcp.json` with a `servers` object, `type: "stdio"`, `command`, `args`; or user `settings.json` | docs.github.com/en/copilot/how-tos/provide-context/use-mcp/extend-copilot-chat-with-mcp | 2026-09-12 |
| Gemini CLI: `gemini mcp add [options] <name> <command> [args...]`; `mcpServers` in `settings.json` with `command`, `args`, `cwd`, `env` | geminicli.com/docs/tools/mcp-server/ | 2026-09-12 |
| Routescan Foundry recipe: `--verifier-url 'https://api.routescan.io/v2/network/testnet/evm/<id>/etherscan' --etherscan-api-key "verifyContract" --compiler-version <toml>`; constructor args via `cast abi-encode` | info.routescan.io/en/articles/11992459-deploying-and-verifying-contracts-foundry (updated 3 March 2026) | 2026-09-12 |
| `forge verify-contract` flags `--verifier`, `--verifier-url`, `--etherscan-api-key`, `--chain`, `--compiler-version`, `--evm-version`, `--num-of-optimizations`, `--constructor-args`, `--show-standard-json-input`, `--watch` | getfoundry.sh/forge/reference/forge-verify-contract and `forge verify-contract --help` (forge 1.5.1) | 2026-09-12 |
| `forge script --account <name>` and `--password-file <path>`; `cast wallet address --account`; keystores under `$HOME/.foundry/keystores` | `forge script --help`, `cast wallet address --help`, `cast wallet new --help` (forge 1.5.1) | 2026-09-12 |
| Routescan API answers `checkverifystatus` for 153 at `…/evm/153/etherscan` and `…/evm/153/etherscan/api` | `forge verify-check` and curl against api.routescan.io | 2026-09-12 |

## Last verified

2026-09-14. `npm test`: 31 passed, 0 failed, 0 skipped, with forge 1.7.1 and anvil on the
path (the `@foundry-rs` npm packages). On 2026-09-12: 15 passed with forge 1.5.1.
