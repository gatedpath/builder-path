# create-redbelly-dapp

```
For agents
- Scaffold: `node packages/create-redbelly-dapp/bin/index.js my-app --yes` (published later as
  `npm create redbelly-dapp@latest my-app`). Every prompt has a flag; `--help` lists them.
- Shipped templates: `gated-erc20` and `empty`. `gated-erc721` and `gated-vault` refuse with a
  list of what they are missing; don't work around the refusal.
- Nothing here makes a network call unless `--install` is passed. No key is read or asked for.
- The output is a monorepo: Foundry `contracts/` on `Gated` from receptor-mock, a Next.js `web/`,
  CI, rules files for five agent tools, `npm run doctor`, `gas` and `ship` through the vendored
  preflight package, a preflight script and a deploy script that refuses chain 151 without a Safe
  1.4.1 (threshold >= 2), a verified deployer and a ship report dated today. Foundry only by default
  since wave 8; `--hardhat` adds a Hardhat 3 view of the same sources in `hardhat/`.
- The local loop in a scaffold is `npm run dev` (templates/base/scripts/dev.mjs): fork 153 on
  Anvil as chain 31337, deploy with a ReceptorMock, seed Anvil accounts 2 to 6 into the five
  states in enum order, start the web app with the dev state panel, write deployments/local.json
  (indices, never a key). `--json` for agents; exit 2 already running, 3 forge or anvil missing.
- Tests: `npm run test:unit` (offline), `npm run test:dev` (dev.mjs over a plain Anvil) and
  `npm test` (scaffolds, builds, tests, the browser check on the panel; needs forge, anvil and
  the site's Playwright). `npm run test:fork` records a run against a testnet fork in
  reports/fork-run.md; reports/golden-path-dev-2026-09-14.md is the site's /start page run
  literally on a fresh scaffold with `npm run dev` as the loop, and golden-path-foundry.md and
  golden-path-hardhat.md are the 12 September runs it is measured against.
- The default request id is 18, the over-18 recipe (recipes/over-18); the AU wholesale investor
  recipe is 708. `npm run lint:slither` writes contracts/reports/slither.json and the sources
  hash beside it that redbelly-preflight compares.
```

Phase 1 deliverable (b) of the Redbelly Development Tool (`PLAN.md` section 5.2, sequenced in
section 16 wave 2). One command turns the two landed packages, `@gatedpath/chains` and
`@gatedpath/agent-rules`, plus `@gatedpath/receptor-mock`, into a project a builder
or their coding agent can take to testnet in an afternoon and to mainnet only through the gate.

## Run it

From this repository, after `npm ci && npm run build` in `packages/chain-definitions` and
`packages/agent-rules` (or just `npm run build:siblings` here):

```
node packages/create-redbelly-dapp/bin/index.js my-app            # prompts
node packages/create-redbelly-dapp/bin/index.js my-app --yes      # defaults: gated-erc20, npm, web, Foundry only
node packages/create-redbelly-dapp/bin/index.js my-app --yes --hardhat   # plus a Hardhat 3 view in hardhat/
node packages/create-redbelly-dapp/bin/index.js my-app --template empty --no-web --pm pnpm --yes
node packages/create-redbelly-dapp/bin/index.js --list-templates
```

| Prompt | Flag | Default |
|---|---|---|
| Project name | positional, or `--name` | `redbelly-dapp` |
| Template | `--template gated-erc20 \| gated-erc721 \| gated-vault \| empty` | `gated-erc20` |
| Package manager | `--pm npm \| pnpm \| yarn` | `npm` |
| Hardhat 3 view of the same sources in `hardhat/` | `--hardhat` / `--no-hardhat` | no (Foundry only, since wave 8) |
| Web app | `--web` / `--no-web` | yes |

`--yes` accepts the defaults for whatever the flags didn't give. `--install` runs the package
manager and `forge install` afterwards; those are the only network steps and they are the
builder's own tools. `--force` writes into a non-empty directory.

## What comes out

```
my-app/
  contracts/        Foundry, solc 0.8.30, evm prague, [profile.testnet] 153 and [profile.mainnet] 151
    src/            GatedERC20.sol and IssuerRegistry.sol, copied from packages/contract-kit (or GatedExample.sol)
    test/           the kit's five-state, fuzz, invariant, registry and admin-pattern tests, plus deploy pre-flight tests
    script/         Deploy.s.sol, RedbellyDeployScript.sol (the refusals), Redbelly.sol (generated constants)
    lib/            receptor-mock (vendored src/ and test/); forge-std arrives with forge install
    node_modules/   OpenZeppelin 5.6.1 from npm, the method receptor-mock chose
  hardhat/          Hardhat 3 config with networks 153 and 151, keystore-backed signer, deploy script, Routescan in chainDescriptors for hardhat verify; src/ and lib/ link into contracts/, lib/receptor-mock/src compiled too
  web/              Next.js app router, wagmi 3, viem 2; connect, verify-your-wallet interstitial, one gated action, optional Eligibility SDK point
  vendor/           built copies of @gatedpath/chains and @gatedpath/agent-rules, installed by path
  .github/workflows/ci.yml   forge build and test, Slither, Aderyn, forge snapshot --diff on PRs, rules check, web build; every action pinned
  CLAUDE.md AGENTS.md GEMINI.md .cursor/rules/redbelly.mdc .github/copilot-instructions.md   written by writeRulesFiles
  README.md         starts with a "for agents" block, then the golden path with Foundry and Hardhat side by side
  SECURITY.md THREAT-MODEL.md .env.example .gitignore scripts/preflight.mjs scripts/slither.mjs
```

Facts are never retyped. `contracts/script/Redbelly.sol` and the addresses in
`hardhat/scripts/deploy.ts` are rendered from `@gatedpath/chains` at scaffold time; the
web app imports the chain objects; the rules files come from `writeRulesFiles`. Code is not
retyped either: since 12 September 2026 the `gated-erc20` template holds only its deploy script,
and `contracts/src/`, `contracts/test/` and `web/src/abi/GatedERC20.json` are copied from
`packages/contract-kit` at scaffold time (`vendorContractKit` in `src/generate.mjs`), so the kit's
51 tests run in every project and there is one `GatedERC20` in the repository.

## The deploy gate

`RedbellyDeployScript.preflight()` reads the chain id from the RPC. On 151 and 153 it resolves
the permission contract through the bootstrap registry and refuses when
`permission.isAllowed(deployer)` is false. On 151 it further requires `ADMIN_SAFE` to be a
contract whose `VERSION()` is `1.4.1`, whose `masterCopy()` is a canonical Safe 1.4.1 singleton,
and whose `getThreshold()` is at least 2; and it refuses to deploy a mock verifier there.
`scripts/preflight.mjs` runs the same checks from the shell, offline where it can, so the refusal
shows before anything is signed. Keys are never read: the documentation uses
`forge script --account <keystore-name>`, `--ledger` or `--trezor`, and the Hardhat path uses
`hardhat keystore set`.

## Tests

`npm run test:unit`: argument parsing, template rendering, stub refusal, the Solidity renderer.

`npm test` (`test/integration.test.mjs`, `node --test`): scaffolds `gated-erc20` and `empty`
with `--yes` into a temp directory; checks no placeholder, block tag or key-shaped value
survived; runs `forge build`, `forge test` (unit, fuzz, invariant) and `forge fmt --check` in
each; runs the rules-file `--check` with the vendored CLI and with the source package; installs
and builds the web app for `gated-erc20` and checks the shipped ABI matches the build; compiles
with Hardhat; then starts `anvil --chain-id 151`, plants the bootstrap registry and permission
mocks at the real registry address, and proves the deploy script refuses an EOA admin, refuses
a missing admin, refuses a Safe with threshold 1, accepts a Safe 1.4.1 with threshold 2 (and
hands it the admin role), and refuses an unverified deployer. The Safe is real: the canonical
1.4.1 runtime bytecode (read from both networks with `cast code`, `test/fixtures/safe-1.4.1/`)
is planted with `anvil_setCode` and the proxy is created through `SafeProxyFactory`. The verifier
on the simulated mainnet is an `Iden3VerifierAdapter` over a fake `ZKPVerifier`, because
`ReceptorMock` refuses chain 151 by design, and the test checks that refusal too. Finally the
preflight script is run against the same anvil and agrees.

The integration test also builds the web app for production with a `deployments/local.json`
present and walks `.next/static` and `.next/server` for any trace of the dev state panel (none
may exist), then starts `npm run dev --no-fork` with the web app and drives it in Chromium
(Playwright from `site/node_modules`, the pre-installed browser): the panel lists the five wallets
in enum order, connects wallet 3 with no key, flips it to Expired and back, and the eligibility
gate follows without a page load; then it starts the dev server against 153 with the same file on
disk and finds no panel.

`npm run test:dev` (`test/dev.test.mjs`): the scaffold's `dev.mjs` offline (flags, the table, exit
3 with no forge, exit 1 on an uninstalled scaffold) and over a plain Anvil (`--no-fork --no-web
--json`): the record's shape and that stdout is exactly the file, the five states read back from
the mock in enum order, the mocked permission gate, `subscribe()` succeeding for the Valid wallet
and reverting `NotEligible` for the NeverIssued one, a second run exiting 2, Ctrl-C exiting 0 with
Anvil gone and the lock removed, a stale lock ignored, and `REQUEST_ID` in `.env` as the default.

`npm run test:fork` (`scripts/fork-run.mjs`): scaffolds, forks testnet with anvil, shows the
real permission contract refusing an unverified sender, impersonates a wallet that `isAllowed`
on 153, deploys with a `ReceptorMock` verifier, and exercises the gate. The transcript is
`reports/fork-run.md`. Nothing is sent to the real network.

## Stubs

`gated-erc721` and `gated-vault` exist as entries in `src/options.mjs` with the list of what
each needs before it can ship: the contract on `Gated`, five-state tests, a fuzz and an invariant
suite, and the web action. Choosing one exits 2 with that list and writes nothing.

## The golden path, run

`reports/golden-path-dev-2026-09-14.md` follows the site's `/start` page as rewritten for wave 6
(`scripts/golden-path-dev.mjs` runs it): a fresh scaffold, `npm run dev` against an Anvil fork of
testnet, the dev state panel driven in Chromium, the gate broken from the shell, Slither, both
pre-flights read-only against the real testnet, and the Routescan dry run, every step with its
wall time and the total at the end (1 min 13 s end to end, against nineteen minutes on 12
September). The screenshot beside it is the panel after the flip.

`reports/golden-path-foundry.md` and `reports/golden-path-hardhat.md` (2026-09-12) follow the
site's `/start` page step by step on fresh scaffolds against an Anvil fork of testnet, with
per-step timings. They turned up four faults, all fixed the same day: the page had no install
step before `forge build`; the deploy script could not write `deployments/` because the folder
did not exist; the Hardhat config compiled `src/` only, so its deploy had no `ReceptorMock`
artifact; and the default request id (1) stood for no recipe, so it is now 18 with the recipe
named. Neither transcript signs anything: no key exists in the sessions that produce them.
`scripts/slither.mjs` (`npm run lint:slither`) came out of the card runs the same day: it runs
Slither as CI does and writes `contracts/reports/slither.sources.sha256` beside the report so
`redbelly-preflight` can judge freshness by content.

## Not verified here

The Routescan `forge verify-contract` recipe (RESEARCH.md question 28) is documented in the
generated README as the expected command with the web form as the fallback, and dry-run
(`--show-standard-json-input`) against the scaffolded `GatedERC20` on 2026-09-12; it has not been
submitted, because no contract of ours is on a real network. The Hardhat `verify etherscan` path
is configured and loads but has no dry-run flag, so it has not run at all. Aderyn's npm wrapper downloads its binary from GitHub releases, which the
build session could not reach, so the Aderyn CI job is written and pinned but has not executed
here. Slither 0.11.6 ran locally on the gated-erc20 template.
