# Golden path, Hardhat: the /start page's Hardhat tabs followed on a second fresh scaffold

Date: 2026-09-12, 13:12 to 13:25 UTC.
Page version: `site/src/content/docs/start.mdx` at commit e598e92, Hardhat tab on every step that has one.
Scaffolder: create-redbelly-dapp 0.1.0, `--yes`, a second scaffold in its own directory so nothing from the Foundry run carried over.
Toolchain: Hardhat 3.16.0 with `@nomicfoundation/hardhat-toolbox-viem` 5.0.7 (hardhat-verify 3.1.0, hardhat-keystore), solc 0.8.30 downloaded by Hardhat, Node 22.22.2. Foundry 1.7.1 for the tests, which the scaffold's README says are Foundry's.
Fork: the same Anvil fork of testnet on port 8545 that the Foundry run used (the scaffold's `anvil` network points at 127.0.0.1:8545).
Keys: none. `npx hardhat keystore set REDBELLY_DEPLOYER_KEY` was not run, because this session holds no key; the page keeps that step marked not run. `npm run deploy:testnet` against the real network was not run for the same reason.

## Where the page and reality differed

1. `cd hardhat && npm install` (the scaffold README's step 1) installs into the project root's `node_modules`, because `hardhat/` is an npm workspace of the root package. That is fine (Node resolves upwards) but surprising; the page now says where the packages land.
2. `npx hardhat compile` compiled one file, `GatedERC20.sol`, and the deploy script then failed with `HHE1000: Artifact for contract "ReceptorMock" not found`: the Hardhat config compiled `src/` only, and the mock lives in `lib/receptor-mock/src`. Fixed in the scaffolder: `paths.sources` is now `["./src", "./lib/receptor-mock/src"]`. After the fix Hardhat compiled five files and the deploy landed.
3. With `accounts: "remote"` the Hardhat deploy on a fork signs with the node's first unlocked account, Anvil account 0, which passes `isAllowed` on the real network (RESEARCH.md question 30). On a fork that is harmless and unavoidable (Anvil's `eth_accounts` does not list impersonated addresses), so the Hardhat path cannot show the unverified-sender refusal; the Foundry transcript and the nine cheatcode tests cover that refusal, and the page now says so.
4. There was no Hardhat verify command for Routescan. Hardhat 3's verify plugin reads the explorer for a chain from `chainDescriptors`, which the scaffold's config did not carry. Fixed in the scaffolder: the config now declares Routescan's Etherscan-style API for 153 and 151 and the placeholder key, so `npx hardhat verify etherscan --network redbellyTestnet <address> <constructor args>` knows where to post. The config loads and the task's help renders; no submission was made (nothing of ours is on the real network and the task has no dry-run flag).

## Timings

| Step | Wall time |
|---|---|
| Scaffold (`--yes`) | 0.1 s |
| `cd hardhat && npm install` (Hardhat 3.16, toolbox, viem) | 26 s |
| `npx hardhat compile` (first run downloads solc 0.8.30) | 2.9 s |
| `npx hardhat compile` after the config fix | 1.4 s |
| `npx hardhat run scripts/deploy.ts --network anvil` | 3.7 s |
| `npm run contracts:install` then `forge test` | 6.5 s |

## Transcript

### Step 4: scaffold with the defaults (a second fresh scaffold for the Hardhat run)

```
$ node packages/create-redbelly-dapp/bin/index.js my-app --yes
writing project files
  vendoring @redbelly-builder/chains and @redbelly-builder/agent-rules
  copying receptor-mock into contracts/lib
  generating contracts/script/Redbelly.sol from @redbelly-builder/chains
  writing rules files (CLAUDE.md, AGENTS.md, .cursor/rules/redbelly.mdc, .github/copilot-instructions.md, GEMINI.md)

Scaffolded gated-erc20 into <tmp>/my-app (56 files).

Next steps
  cd my-app
  npm install                 installs the web app and tooling
  npm run contracts:install   forge install of forge-std and OpenZeppelin at the pinned tags
  npm run test                forge build and forge test (unit, fuzz, invariant) in all five credential states
  npm run preflight           the checks the deploy script makes, run offline first

Read README.md for the golden path. Nothing in this project reads a private key; deploys use
`forge script --account <keystore-name>` or a hardware wallet. Mainnet (151) refuses to deploy
unless ADMIN_SAFE is a Safe 1.4.1 with a threshold of two or more and the deployer passes isAllowed.
The hardhat/ folder compiles the same sources with the same pins; see README.md for its commands.
```

exit 0, 0.10 s wall.

### Step 3 and 5, Hardhat: install the Hardhat view (the README's 'cd hardhat && npm install')

```
$ npm install --no-audit --no-fund
added 155 packages in 25s
```

exit 0, 25.6 s wall.

### Step 5, Hardhat, as the page says it: npx hardhat compile

```
$ npx hardhat compile
Downloading solc 0.8.30
Downloading solc 0.8.30 (WASM build)

Compiled 1 Solidity file with solc 0.8.30 (evm target: prague)
```

exit 0, 2.89 s wall.

### Step 8, Hardhat, on the fork, as the scaffold README says it: hardhat run scripts/deploy.ts --network anvil (accounts: remote, so the signer is whatever the node's eth_accounts lists first)

```
$ npx hardhat run scripts/deploy.ts --network anvil
chain id (from the RPC): 153
deployer: 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
permission.isAllowed(deployer): true
ADMIN_SAFE not set: the deployer holds the admin roles. Fine on testnet, refused on mainnet.
VERIFIER not set: DEPLOYING RECEPTOR MOCK. Every wallet starts ineligible; setStatus() decides. Not for mainnet.
HHE1000: Artifact for contract "ReceptorMock" not found.
```

exit 1, 2.68 s wall.

### Step 5, Hardhat, after fixing the scaffolder's Hardhat config (it now compiles lib/receptor-mock/src as well, so the mock has an artifact)

```
$ npx hardhat compile
Compiled 5 Solidity files with solc 0.8.30 (evm target: prague)
```

exit 0, 1.36 s wall.

### Step 8, Hardhat, on the fork, again after the fix. Note the signer: with accounts remote, Hardhat signs with the fork's first unlocked account, Anvil account 0, which passes isAllowed on the real network (question 30). Harmless on a fork; never do it anywhere else

```
$ npx hardhat run scripts/deploy.ts --network anvil
chain id (from the RPC): 153
deployer: 0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
permission.isAllowed(deployer): true
ADMIN_SAFE not set: the deployer holds the admin roles. Fine on testnet, refused on mainnet.
VERIFIER not set: DEPLOYING RECEPTOR MOCK. Every wallet starts ineligible; setStatus() decides. Not for mainnet.
GatedERC20: 0x59b670e9fa9d0a427751af201d676719a970857b
verifier: 0xc6e7df5e7b4f2a278906862b61205850344d4e7d
record hash (chain, deployer, admin): 0x283ab247879987af5b9332cabf04610d0318f1c73ee9bc2ede62441bcc167d90
```

exit 0, 3.71 s wall.

### Step 7, Hardhat column: the tests are Foundry's (the README says so), so contracts:install then forge test

```
$ bash -c 'npm run contracts:install 2>&1 | grep -E 'Installed|added|error' ; cd contracts && forge test 2>&1 | grep -E 'Ran |passed|failed|Suite''
added 1 package, and audited 2 packages in 674ms
    Installed forge-std v1.16.2
Ran 9 tests for test/DeployPreflight.t.sol:DeployPreflightTest
Suite result: ok. 9 passed; 0 failed; 0 skipped; finished in 3.24ms (2.30ms CPU time)
Ran 14 tests for test/GatedERC20.t.sol:GatedERC20Test
Suite result: ok. 14 passed; 0 failed; 0 skipped; finished in 4.80ms (3.70ms CPU time)
Ran 3 tests for test/GatedERC20.fuzz.t.sol:GatedERC20FuzzTest
Suite result: ok. 3 passed; 0 failed; 0 skipped; finished in 267.08ms (265.96ms CPU time)
Ran 4 tests for test/GatedERC20.invariants.t.sol:GatedERC20Invariants
Suite result: ok. 4 passed; 0 failed; 0 skipped; finished in 902.98ms (1.87s CPU time)
Ran 4 test suites in 904.88ms (1.18s CPU time): 30 tests passed, 0 failed, 0 skipped (30 total tests)
```

exit 0, 6.53 s wall.

### Step 9, Hardhat: the config now carries Routescan as the Etherscan-style explorer for 153 and 151 (chainDescriptors), so hardhat verify etherscan knows where to post. Config loads and compiles; nothing submitted (no contract of ours is on the real network, and the task has no dry-run flag)

```
$ bash -c 'npx hardhat compile && npx hardhat verify etherscan --help | head -6'
No contracts to compile
Verify a contract on Etherscan

Usage: hardhat [GLOBAL OPTIONS] verify etherscan [--constructor-args-path <FILE_WITHOUT_DEFAULT>] [--contract <STRING_WITHOUT_DEFAULT>] [--force] [--libraries-path <FILE_WITHOUT_DEFAULT>] [--] address [constructorArgs]

OPTIONS:
```

exit 0, 2.11 s wall.
