# __PROJECT_NAME__

<!-- for agents -->
> For agents. This is an identity-gated dApp on Redbelly Network, scaffolded by
> create-redbelly-dapp __SCAFFOLDER_VERSION__ (template `__TEMPLATE__`). Rules you follow are in
> `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/redbelly.mdc` and
> `.github/copilot-instructions.md`; they are generated and identical, so read one. Chain 151
> is mainnet, 153 is testnet; chain objects and addresses come from `@gatedpath/chains`
> (vendored in `vendor/`), never typed by hand. Contracts are Foundry in `contracts/`
> (solc 0.8.30, Prague){{#if hardhat}} with a Hardhat 3 view in `hardhat/`{{/if}}. Every gated function has tests in
> five credential states on `GatedTest`; never weaken a `Gated` check to make a test pass.
> No private key is read anywhere: deploys sign with `forge script --account <keystore-name>`
> or a hardware wallet. Chain 151 refuses to deploy unless `ADMIN_SAFE` is a Safe 1.4.1 with
> threshold >= 2, the deployer passes `permission.isAllowed`, and `deployments/ship-151-<today>.md`
> exists, which `__PM_RUN__ ship` writes only when every check passes. Run `__PM_RUN__ doctor` on a
> new machine and `__PM_RUN__ preflight` before any deploy. Network facts live on https://vine.redbelly.network and
> https://docs.redbelly.network; link, don't restate.
<!-- /for agents -->

## What is here

| Path | What |
|---|---|
| `contracts/` | Foundry project: `src/__CONTRACT_NAME__.sol` on the `Gated` base from `receptor-mock`, tests in all five credential states, a fuzz and an invariant suite, `script/Deploy.s.sol` with the mainnet refusals |
{{#if hardhat}}
| `hardhat/` | Hardhat 3 config compiling the same sources with the same pins (`src/` and `lib/` are links into `contracts/`), a keystore-based signer and a deploy script with the same refusals |
{{/if}}
{{#if web}}
| `web/` | Next.js app router with wagmi and viem: connect (WalletConnect and injected), the "verify your wallet" interstitial polling `permission.isAllowed`, one gated action on the contract, and an optional Eligibility SDK integration point |
{{/if}}
| `.github/workflows/ci.yml` | forge build and test (unit, fuzz, invariant), Slither, Aderyn, `forge snapshot --diff` on pull requests, rules-file drift check{{#if web}}, web build{{/if}}; every action pinned |
| `scripts/dev.mjs` | `__PM_RUN__ dev`: fork, deploy, seed five wallets into the five states{{#if web}}, start the web app with the dev state panel{{/if}}; see below |
| `scripts/preflight.mjs` | The deploy script's checks as a command you can run before signing anything, offline where it can |
| `__PM_RUN__ doctor`, `__PM_RUN__ gas`, `__PM_RUN__ ship` | The vendored `@gatedpath/preflight`: the machine before the first command; gas per function in RBNT and US cents at the chain's feed price; the mainnet gate that writes `contracts/deployments/ship-<chain>-<date>.md` when every check passes |
| `scripts/slither.mjs` | `__PM_RUN__ lint:slither`: Slither as CI runs it, writing `contracts/reports/slither.json` and the sources hash beside it that `redbelly-preflight` compares |
| `vendor/` | Built copies of `@gatedpath/chains`, `@gatedpath/agent-rules` and `@gatedpath/preflight`{{#if web}} (and `@gatedpath/frontend-kit` for the web app){{/if}}, installed by path until they are published; the versions are recorded under `redbelly.vendor` in `package.json` and `__PM_RUN__ doctor` compares |
| `SECURITY.md`, `THREAT-MODEL.md`, `.env.example` | The security programme, the threat-model stub with PLAN section 6 headings, and an env file with a comment on every line and no secret |

## The local loop: `__PM_RUN__ dev`

One command does the whole local loop: it forks testnet on Anvil as chain 31337, deploys a
`ReceptorMock` and `__CONTRACT_NAME__` through `script/Deploy.s.sol`, seeds Anvil accounts 2 to 6
into the five credential states (NeverIssued, Valid, Expired, Revoked, WrongJurisdiction, in that
order){{#if web}}, starts the web app with a dev state panel that flips the connected wallet between
those states,{{/if}} and prints a table of wallet, state and the `cast rpc anvil_impersonateAccount`
command beside each. Ctrl-C stops everything.

```
__PM_RUN__ dev                          # after __PM_INSTALL__ and __PM_RUN__ contracts:install
__PM_RUN__ dev -- --no-fork             # plain Anvil, offline
__PM_RUN__ dev -- --request-id 708      # the AU wholesale investor recipe instead of over-18
__PM_RUN__ dev -- --json                # the table as JSON, for an agent
```

Flags: `--chain 153|151` (151 forks mainnet read-only and warns), `--port 8545`, `--web-port 3000`,
`--no-web`, `--no-fork`, `--request-id 18` (without the flag, `REQUEST_ID` in `.env` wins, then the
deploy script's own default; the id is read back from the contract either way), `--json`. Exit codes: 0 running, 1 a step failed (which
one and why on stderr), 2 already running, 3 `forge` or `anvil` missing. It writes
`deployments/local.json` (chain id, fork source, verifier, contract, request id, the deployer and
the five wallets by Anvil account index; never a key). Accounts 0 and 1 are never used: their keys
are public and they pass `permission.isAllowed` on the real networks. On the local chain the
permission gate is the test mock, so the five wallets count as verified there; the real gate on 153
is unchanged and would refuse them.

## The golden path

{{#if hardhat}}
Foundry and Hardhat commands side by side. Foundry is the path; the Hardhat column works on the
same files and exists for teams that also use Hardhat.
{{/if}}
{{#unless hardhat}}
Foundry only. Run `__PM_RUN__ doctor` first on a new machine: it checks Node, git, forge, anvil and
cast (one version, the real binaries), the analysers, that no `.env` is tracked and that `vendor/`
matches what the scaffolder shipped, one line each with the fix.
{{/unless}}

### 1. Install

{{#if hardhat}}
| Foundry | Hardhat |
|---|---|
| `__PM_INSTALL__` then `__PM_RUN__ contracts:install` | `cd hardhat && __PM_INSTALL__` |
{{/if}}
{{#unless hardhat}}
```
__PM_INSTALL__
__PM_RUN__ contracts:install
```
{{/unless}}

`contracts:install` installs OpenZeppelin 5.6.1 from npm into `contracts/node_modules` and
forge-std v1.16.2 with `forge install --no-git`, the same two methods `receptor-mock` uses.
`receptor-mock` itself is already in `contracts/lib/`. Foundry: https://getfoundry.sh.

### 2. Test

{{#if hardhat}}
| Foundry | Hardhat |
|---|---|
| `__PM_RUN__ test` (or `cd contracts && forge test -vvv`) | `cd hardhat && __PM_RUN__ compile` then run the Foundry tests; there are no Hardhat-only tests |
{{/if}}
{{#unless hardhat}}
```
__PM_RUN__ test                    # or: cd contracts && forge test -vvv
__PM_RUN__ gas -- --chain 153      # gas per test in RBNT and US cents at testnet's feed price
```
{{/unless}}

Every gated function is exercised in NeverIssued, Valid, Expired, Revoked and
WrongJurisdiction through `assertRevertsForAllInvalidStates`. `forge test --gas-report`
shows costs in gas; never assert a fee in wei, the network prices gas in US dollars.

### 3. Fork testnet with Anvil

There is no local Redbelly node. Fork chain 153 and mock the identity layer:

```
__PM_RUN__ anvil:fork          # anvil --fork-url https://governors.testnet.redbelly.network --chain-id 153
```

Then in another shell:

{{#if hardhat}}
| Foundry | Hardhat |
|---|---|
| `cd contracts && forge script script/Deploy.s.sol --rpc-url anvil --sender <verified-wallet> --unlocked --broadcast` | `cd hardhat && __PM_EXEC__ hardhat run scripts/deploy.ts --network anvil` |
{{/if}}
{{#unless hardhat}}
```
cd contracts && forge script script/Deploy.s.sol --rpc-url anvil --sender <verified-wallet> --unlocked --broadcast
```
{{/unless}}

The pre-flight runs against the fork's real registry, so an unverified sender is refused
just as it would be on the network. To rehearse a deploy, impersonate a wallet that passes
`isAllowed` (`cast rpc anvil_impersonateAccount <wallet>` and `anvil_setBalance`). Fees on a
fork don't follow the price oracle; don't read anything into them.

### 4. Deploy to testnet

Create a keystore once (`cast wallet import deployer --interactive`), verify that wallet at
https://access.redbelly.network, fund it from https://redbelly.faucetme.pro/, then:

{{#if hardhat}}
| Foundry | Hardhat |
|---|---|
| `__PM_RUN__ preflight` | `__PM_RUN__ preflight` |
| `cd contracts && forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account deployer --broadcast` | `cd hardhat && __PM_RUN__ keystore:set` once, then `__PM_RUN__ deploy:testnet` |
{{/if}}
{{#unless hardhat}}
```
__PM_RUN__ preflight
__PM_RUN__ ship -- --chain 153 --account deployer     # optional on testnet: writes contracts/deployments/ship-153-<date>.md
cd contracts && forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account deployer --broadcast
```
{{/unless}}

Without `VERIFIER` set, the script deploys a `ReceptorMock` as the verifier and says so in
capitals. Every wallet starts ineligible on it; call `setStatus(wallet, 18, Valid)` from the
deployer to let a test wallet through (18 is the request id of the over-18 recipe, the default
`REQUEST_ID`; the AU wholesale investor recipe is 708). Replace it with your own verifier (a
`ZKPVerifier` or `VCVerifierBaseContract` child, see docs.redbelly.network) before anything
real. The deployment record lands in `contracts/deployments/153-__CONTRACT_NAME__.json`.

### 5. Verify on Routescan

{{#if hardhat}}
| Foundry | Hardhat |
|---|---|
| `cd contracts && forge verify-contract <address> src/__CONTRACT_NAME__.sol:__CONTRACT_NAME__ --chain 153 --verifier-url __TESTNET_EXPLORER_API_BASE__ --etherscan-api-key verifyContract --constructor-args $(cast abi-encode ...)` | Use the Foundry command; Hardhat's verify plugin targets Etherscan and Blockscout |
{{/if}}
{{#unless hardhat}}
```
cd contracts && forge verify-contract <address> src/__CONTRACT_NAME__.sol:__CONTRACT_NAME__ --chain 153 --verifier-url __TESTNET_EXPLORER_API_BASE__ --etherscan-api-key verifyContract --constructor-args <from the deployment record>
```

The deployment record carries `constructorArgs` already encoded, and `__PM_RUN__ ship` prints the
whole command with them filled in.
{{/unless}}

The Routescan endpoint answers keyless (the `verifyContract` key is a documented placeholder,
not a secret). The exact recipe is still being confirmed against a live deploy; if it fails,
Routescan's web form takes the standard JSON input from `forge verify-contract --show-standard-json-input`.

{{#if web}}
### 6. Run the web app

```
cd web && cp ../.env.example .env    # set NEXT_PUBLIC_CONTRACT_ADDRESS from the deployment record
__PM_RUN__ dev
```

Connect a wallet. If the network hasn't verified it, the page shows the "verify your
wallet" interstitial and polls `permission.isAllowed` until it flips. Then the one gated
action appears. WalletConnect needs a public project id in `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`;
without it the injected connector alone is offered. Vine warns that most wallets show gas
wrongly on Redbelly; the page prices a transfer itself from the on-chain feed.

`/eligibility` shows the same wallet through the frontend kit
(`@gatedpath/frontend-kit`, vendored in `vendor/`): the five states every Redbelly dApp
has (not connected, not verified on the network, ineligible for this action, eligible,
credential expiring soon), read once per block or thirty seconds from the contract's verifier,
with a refresh button and the gas warning.

{{/if}}
### {{#if web}}7{{/if}}{{#unless web}}6{{/unless}}. Pre-flight before mainnet

```
__PM_RUN__ preflight -- --chain 151
```

This runs what `Deploy.s.sol` will refuse on: chain id from the RPC matches 151, the deployer
passes `permission.isAllowed`, `ADMIN_SAFE` is a Safe 1.4.1 proxy on a canonical singleton
with `getThreshold() >= 2`, `VERIFIER` is set, no `.env` in git history, no key-shaped value in
tracked files, and the balance covers the deploy with margin. Run it before you have a Safe
and you'll see the refusal without spending anything. Mainnet holds real assets under real
regulators; the ship report is the gate, and this project doesn't promise mainnet in an
afternoon. `__PM_RUN__ ship -- --chain 151 --account <keystore-name> --admin <safe>` runs pre-flight,
the Slither check, the five-state tests and the gas report and writes
`contracts/deployments/ship-151-<today>.md` only when every check passes; the deploy script refuses
to broadcast on 151 without that file dated today.

{{#if hardhat}}
| Foundry | Hardhat |
|---|---|
| `cd contracts && forge script script/Deploy.s.sol --rpc-url redbelly_mainnet --ledger --broadcast` | `cd hardhat && __PM_RUN__ deploy:mainnet` |
{{/if}}
{{#unless hardhat}}
```
__PM_RUN__ ship -- --chain 151 --account <keystore-name> --admin <safe>
cd contracts && forge script script/Deploy.s.sol --rpc-url redbelly_mainnet --ledger --broadcast
```
{{/unless}}

## Rules files

`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/redbelly.mdc` and
`.github/copilot-instructions.md` are generated by `@gatedpath/agent-rules`
__RULES_VERSION__ and carry one body. `__PM_RUN__ rules:check` fails when any has drifted; CI
runs it. Add your own project rules in `.claude/rules/` or below the generated block rather
than editing them.

## Where facts come from

Network facts: https://vine.redbelly.network (environments, fees, consensus, identity) and
https://docs.redbelly.network (Receptor, the Eligibility SDK). Addresses and chain objects:
`@gatedpath/chains` __CHAINS_VERSION__, every address verified on __FACTS_VERIFIED_ON__.
Explorer: __TESTNET_EXPLORER__ and __MAINNET_EXPLORER__.
