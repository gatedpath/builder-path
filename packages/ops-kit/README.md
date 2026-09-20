# @gatedpath/ops-kit

```
For agents
- Read-only operations tooling for a contract-kit GatedERC20 on Redbelly. Nothing here signs,
  holds a key or needs one. The Uniblock key and the webhook URL come from the environment
  (UNIBLOCK_API_KEY, ALERT_WEBHOOK_URL) and are never printed or written.
- Alerts: `node scripts/alert.mjs --contract 0x… --network mainnet` polls eth_getLogs for pause,
  forced transfer, role change, verifier change (critical), issuer permissions (warning) and
  skipped distributions (info) and POSTs JSON to the webhook. `--once` for cron, `--dry-run` to print.
- The network's own contracts: `node scripts/system-watch.mjs --network mainnet` keeps a baseline of
  what the bootstrap registry answers and what sits behind the permission proxy, and POSTs every
  later difference, plus role and upgrade events, to the same webhook. Redbelly does not announce these.
- Routescan: `scripts/routescan-transfers.mjs`, `routescan-holders.mjs`, `routescan-verified.mjs`
  take a token address and `--network`. Keyless, paced at two requests a second.
- RPC: `createFallbackRpc({ network: 'mainnet' })` rotates governors, Ankr and (with a key) Uniblock.
- Goldsky subgraph template in `subgraph/`; Redbelly on Goldsky needs Redbelly's approval first.
- Runbook in `runbook/`; fill in its table before mainnet and run the drill on testnet.
- Tests: `npm test` (local servers and anvil; the alert tests need forge, cast, anvil, the rest do not). `npm run test:live` hits
  Routescan for real.
```

The operations kit from `PLAN.md` section 5.8: what a team needs the week after a deploy. Every
network fact comes from `@gatedpath/chains`; every URL was read on 12 September 2026 and
is in `RESEARCH.md`. Node 20, one dependency (the chains package).

## What is in it

| Path | What |
|---|---|
| `scripts/alert.mjs` | The alerting recipe: polls `eth_getLogs` on a contract for the operator events, decodes them, posts JSON to `ALERT_WEBHOOK_URL`, keeps the last block in a state file. `--once`, `--dry-run`, `--json`, `--min-severity`, `--rpc` for a local or private node |
| `scripts/system-watch.mjs` | The watcher for the network's own contracts: registry answers, code fingerprints, the permission proxy's implementation, proxy admin and the admin's owner, and role and upgrade events. Baseline on the first run, every difference posted after that. `--once`, `--dry-run`, `--json`, `--show`, `--rpc` |
| `scripts/routescan-transfers.mjs` | Transfers of an ERC-20, newest first, table or `--json`; from the Etherscan-compatible `tokentx` module |
| `scripts/routescan-holders.mjs` | Holders largest first with balance and share; from the native `/erc20/<token>/holders` listing |
| `scripts/routescan-verified.mjs` | Whether the source at an address is verified, and `--expect-name`, `--expect-compiler`, `--expect-evm` checks; exit 1 on a mismatch |
| `src/rpc-fallback.mjs` | `createFallbackRpc`: governors, then Ankr, then Uniblock when `UNIBLOCK_API_KEY` is set; timeouts, cooldown, reverts returned not retried |
| `src/routescan.mjs` | The client the scripts share: both Routescan API surfaces, paced at 600 ms between calls, an optional free key |
| `src/system-watch.mjs` | `takeSnapshot`, `diffSnapshots`, `readSystemLogs`, `watchOnce`: the watcher as functions, for a team that wants it inside its own service |
| `src/events.mjs` | The eleven watched events with topic hashes computed from their signatures and one decoder each |
| `subgraph/` | Goldsky subgraph template: manifest, schema, AssemblyScript handlers, the kit's ABI, and the approval note |
| `runbook/INCIDENT-RUNBOOK.md` | What each alert means, the five steps, the commands, the quarterly drill, the fill-in table |
| `runbook/example-2026-09-12-forced-transfer-drill.md` | A filled-in record from a drill on a local anvil, with what it found |
| `reports/` | Output of the three Routescan scripts against a live mainnet token on the date in the file name |

## The alert recipe

```
export ALERT_WEBHOOK_URL=https://hooks.example/…      # Slack, Discord, PagerDuty, your own
node scripts/alert.mjs --contract 0xYourToken --network mainnet --state /var/lib/redbelly-alert/state.json
```

Every 15 seconds (`--interval`) it reads `eth_blockNumber`, and when the head moved, `eth_getLogs`
from the last seen block for the contract's watched topics. Each matching log becomes one POST:

```
{"network":"mainnet","contract":"0x…","event":"ForcedTransfer","severity":"critical",
 "what":"a compliance officer moved tokens out of a wallet; match the hash to a document within the hour",
 "blockNumber":3179600,"transactionHash":"0x…","logIndex":0,
 "args":{"from":"0x…","to":"0x…","justificationHash":"0x…","amount":"50000000000000000000","officer":"0x…"},
 "explorerUrl":"https://redbelly.routescan.io/tx/0x…"}
```

Blocks on Redbelly are produced on demand (RESEARCH.md question 4), so a quiet contract costs one
`eth_blockNumber` per poll and nothing else. There are no reorgs, so a block seen is final and
the state file only ever moves forward. On mainnet the RPC is the fallback helper; `--rpc` pins
one URL (a local anvil in the tests, a private node in production). The webhook URL is read from
the environment so it stays out of shell history and process listings; `--webhook` exists for
one-off runs and is not logged either.

Severities: `critical` for `Paused`, `Unpaused`, `ForcedTransfer`, `RoleGranted`, `RoleRevoked`,
`RoleAdminChanged`, `VerifierChanged`, `RequestIdChanged`; `warning` for `IssuerPermissionSet` and
`IssuerPermissionRevoked`; `info` for `EligibilityDenied`. `--min-severity` defaults to warning.
The runbook says what to do with each.

## Watching the network's own contracts

```
export ALERT_WEBHOOK_URL=https://hooks.example/…
node scripts/system-watch.mjs --network mainnet --state /var/lib/redbelly-alert/system-mainnet.json
```

Redbelly does not announce changes to its permission, registry, price feed or gas fee contracts.
Asked on 12 September 2026, the answer on 17 September was that code becomes source-available
between Q4 2026 and Q1 2027 and builders "monitor themselves" (`RESEARCH.md` question 8). Your
dApp depends on those contracts as much as on its own: the permission contract decides whether
your users can transact at all, and the price feed sets what they pay.

The watcher looks in two ways because neither is enough alone. Every pass it takes a snapshot:
what the bootstrap registry answers for `permission`, `pricefeed` and `gasfees`, a fingerprint
(keccak256) of the code at each address, and for a proxy the EIP-1967 implementation and admin
slots, the implementation's code fingerprint, and the admin's `owner()`. Comparing two snapshots
catches a change even when nothing was emitted. It also reads the logs of the permission proxy and
its proxy admin since the last block seen, in windows of 100 blocks because the governors RPC
refuses wider ones, which catches what a snapshot cannot: `RoleGranted`, `RoleRevoked`,
`RoleAdminChanged`, `Upgraded`, `AdminChanged`, `OwnershipTransferred`, each with its transaction.

| Change | From | Means |
|---|---|---|
| `RegistryEntryChanged` | snapshot | the registry answers a different address for a name: a system contract was swapped |
| `ImplementationChanged` | snapshot | the permission proxy points at new code; carries the new code's fingerprint |
| `ImplementationCodeChanged`, `CodeChanged` | snapshot | code at an unchanged address changed; should be impossible, so treat it as serious |
| `ProxyAdminChanged`, `ProxyAdminOwnerChanged` | snapshot | who can upgrade the permission contract changed |
| `Upgraded`, `AdminChanged`, `OwnershipTransferred` | logs | the same, with the block and transaction it happened in |
| `RoleGranted`, `RoleRevoked`, `RoleAdminChanged` | logs | a role moved on the permission contract; role names other than `DEFAULT_ADMIN_ROLE` show as their hash, because the source is not published |

The first run writes the baseline and posts nothing. A change is posted once; if the webhook
refuses it, the state file is left where it was and the next pass tries again. A watcher that was
off for a month catches up 5,000 blocks per pass rather than in one burst. All alerts are
`critical` and have the same JSON shape as `redbelly-alert`, so one webhook handles both. About a
dozen RPC calls per pass; the default interval is five minutes. `--show` prints the current
snapshot and touches nothing.

Run against both live networks on 17 September 2026, read-only (`reports/system-watch-2026-09-17.md`):
baseline then silence on each, and a replay of the log reader over the previous 6,000 mainnet
blocks found the three events of 14 September that nobody announced, to the second.

## The Routescan scripts

Routescan has two API surfaces for Redbelly and both were exercised read-only on 12 September
2026: the Etherscan-compatible module (`tokentx`, `getLogs`, `getsourcecode`, `getabi`,
`tokenholderlist` all answered) and the native listing (`/erc20`, `/erc20/<token>/holders`
answered; `/erc20/<token>` and `/erc20/<token>/transfers` returned 404). Keyless limits are 2
requests a second and 10,000 a day; the client paces every call at 600 ms so a script cannot
exceed them, and a free key (`--api-key` or `ROUTESCAN_API_KEY`) raises the ceiling.

```
node scripts/routescan-transfers.mjs 0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076 --network mainnet --limit 20
node scripts/routescan-holders.mjs   0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076 --network mainnet
node scripts/routescan-verified.mjs  0xcA11bde05977b3631167028862bE2a173976CA11 --network mainnet --expect-name Multicall3
```

The recorded runs are under `reports/`. A holder list from an explorer is a snapshot of the
`Transfer` events it indexed; for a gated token the on-chain truth is `balanceOf`, and
eligibility is a separate read (`isEligible`), which is why the holders script says so at the
bottom of its table.

## The RPC fallback helper

```js
import { createFallbackRpc } from '@gatedpath/ops-kit/rpc-fallback';
const rpc = createFallbackRpc({ network: 'mainnet' });   // UNIBLOCK_API_KEY from the environment, if set
const head = await rpc('eth_blockNumber');
```

Order: the governors endpoint, then Ankr's public endpoint, then Uniblock, all from
`@gatedpath/chains` (Vine's environments page, read 12 September 2026). Uniblock takes its
key on the `x-api-key` header; without a key the provider is left out rather than tried, so the
helper never sends a keyless request to a keyed endpoint on your behalf. Testnet has one public
RPC, so there the helper retries the one URL. A provider that fails sits out for `cooldownMs`; a
revert comes back from the first provider that answers, because every provider would say the
same. `onEvent` reports each failover with the provider name and the error, never the key.

One observation, for RESEARCH.md: on 12 September 2026 at about 13:00 UTC a keyless
`eth_chainId` to Uniblock answered `0x97` with HTTP 200, where the morning's read (chain-definitions
rows) got 429. The helper still treats the key as required, which is what Vine documents.

## The subgraph

`subgraph/` is a template for Goldsky, the one subgraph host Redbelly lists. It cannot be deployed
until Redbelly approves your project on Goldsky: subgraphs on chains 151 and 153 are a
partner-sponsored product there, and Edge RPC and Mirror are not offered
(docs.goldsky.com/chains/redbelly, 12 September 2026). `subgraph/README.md` has the steps and the
network slugs. Until then, Routescan is the indexing route.

## Tests

`npm test`, four files, run one at a time:

- `rpc-fallback.test.mjs` (5): local HTTP servers that fail, hang and answer; rotation, cooldown,
  timeout, revert passthrough, the key header going only to the keyed URL, and the error listing
  every attempt when all are down.
- `routescan.test.mjs` (7): the client against a local server replaying response shapes recorded
  from the real API on 12 September 2026 (`test/fixtures/`); transfers, holders, verified and
  unverified source, logs, pacing, formatting. `OPS_KIT_LIVE=1` runs the same assertions against
  api.routescan.io.
- `alert.test.mjs` (4): a real `GatedERC20` from `packages/contract-kit` and a `ReceptorMock` on
  anvil; every watched event produced on-chain and decoded in order with its arguments; the
  severity filter; the script itself posting to a local webhook with `--once`, keeping its place
  in the state file, `--dry-run`, and refusing to run without a webhook; the topic hashes
  against `cast sig-event`.

- `system-watch.test.mjs` (10): a scripted chain with no network and no Foundry; the snapshot, an
  unchanged chain, each kind of change named exactly once (a new implementation does not also
  report new code), a registry name that stops resolving, log windows within what the RPC accepts,
  catching up in bounded steps, baseline then changes once, a failed delivery retried, the script
  end to end over HTTP, and both pollers started through a symlink from a folder with a space in
  its name, which is how npm installs a bin and how both used to start and silently do nothing.

Not verified here: the subgraph's `graph codegen` and `graph build` (the CLI fetches
dependencies the build environment restricts), a live webhook receiver (the test's is local), and
any run against a contract on the real networks, since nothing of ours is deployed yet. The
Routescan runs in `reports/` are against a third party's token.
