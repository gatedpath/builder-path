# Golden path, Foundry: the /start page followed literally on a fresh gated-erc20 scaffold

Date: 2026-09-12, 13:08 to 13:27 UTC (19 minutes wall, including the two scaffolder fixes and the re-runs they caused).
Page version: `site/src/content/docs/start.mdx` at commit e598e92, read as a first-time builder would.
Scaffolder: create-redbelly-dapp 0.1.0, `--yes` (gated-erc20, npm, Hardhat, web app).
Toolchain: Foundry 1.7.1 from the `@foundry-rs/forge`, `anvil` and `cast` npm packages (`foundryup` is blocked in this environment), Node 22.22.2, npm 10.9.7, Slither 0.11.6 from PyPI.
Fork: `anvil --fork-url https://governors.testnet.redbelly.network --chain-id 153 --port 8545`, forked at block 3034388.
Keys: none. This session held no wallet, no keystore and no key. Every transaction below landed on the local Anvil; the real networks were only read (`eth_call`, `eth_chainId`, balances, Routescan's status endpoint).

This run extends the scaffolder's own `fork-run.md` rather than repeating it: that transcript proves the deploy gate on a fork; this one walks the page step by step, records what a first-time builder sees at each one, and fixes the page or the scaffolder where they disagreed.

## Where the page and reality differed

1. Step 5 says `forge build` straight after the scaffold. On a fresh scaffold that fails: nothing is installed yet. The scaffolder's own "Next steps" has the missing commands (`npm install`, `npm run contracts:install`). Fixed on the page: an install step now sits between "Get the project" and "Compile".
2. The deploy script printed `deployment record not written (grant write access to deployments/ in foundry.toml)` although `foundry.toml` grants it. The folder did not exist and `vm.writeJson` does not create it. Fixed in the scaffolder: `RedbellyDeployScript.recordDeployment` now calls `vm.createDir("deployments", true)` first. The record then landed in `contracts/deployments/153-GatedERC20.json` (shown below).
3. The scaffold's gate was bound to request id 1, which stands for no recipe, while the page's step 7 and card 1 talk about the over-18 recipe. Fixed in the scaffolder: the default `REQUEST_ID` is now 18, the over-18 recipe's id (`recipes/over-18`), named in `Deploy.s.sol`, the Hardhat deploy script, `.env.example` and the README, with 708 (AU wholesale investor) mentioned beside it. The fork steps below were re-run with 18.
4. The Slither freshness check in `redbelly-preflight` could not be satisfied on a project with no findings after any source edit: the re-run report is byte-identical, git records no change, so it is never "newer". Found while running card 1, fixed in `packages/preflight` (a `slither.sources.sha256` sidecar decides by content) and in the scaffolder (`npm run lint:slither` now runs Slither and writes the sidecar). The Slither and pre-flight blocks below are the re-run with that in place.
5. Step 10 asks for the exact error the RPC returns when an unverified wallet sends a write. A fork cannot show it: Anvil does not enforce the node-level permission map, so only the contract's own `NotEligible` revert answers (shown below). The real error still needs a real, unverified wallet on 153 and stays pending on the page.

Nothing else disagreed. `forge build`, `forge test` (30 tests, four suites), `forge fmt --check`, the rules-file drift check, the web build, the fork deploy with the real permission contract refusing Anvil account 2 and accepting an impersonated verified wallet, the gate on the fork, the Routescan dry run and both pre-flight tools ran as the page describes.

## Timings

| Step | Wall time |
|---|---|
| Scaffold (`--yes`) | 0.1 s |
| `npm install` at the project root (web app, Hardhat, vendored packages) | 72 s |
| `npm run contracts:install` (OpenZeppelin, forge-std) | 3 s |
| `forge build` | 4.8 s |
| `forge test` (unit, fuzz at 512 runs, invariants at 64 runs) | 1.1 s after build |
| `npm run web:build` (Next.js) | 24 s |
| Fork deploy, refused sender | 2.3 s |
| Fork deploy, accepted sender | 2.0 s |
| Routescan dry run (`--show-standard-json-input`) | 0.3 s |
| Slither through `npm run lint:slither` | 1.5 s |
| `redbelly-preflight` against the fork | 0.4 s |

## Transcript

### Step 1: the isAllowed read, cast form, against the real testnet RPC (read-only)

```
$ cast call 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690 isAllowed(address)(bool) 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 --rpc-url https://governors.testnet.redbelly.network
true
```

exit 0, 1.75 s wall.

### Step 1: the same read for the zero address

```
$ cast call 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690 isAllowed(address)(bool) 0x0000000000000000000000000000000000000000 --rpc-url https://governors.testnet.redbelly.network
false
```

exit 0, 1.19 s wall.

### Step 3: the toolchain (Foundry from the @foundry-rs npm packages)

```
$ forge --version
forge Version: 1.7.1
Commit SHA: 4072e48705af9d93e3c0f6e29e93b5e9a40caed8
Build Timestamp: 2026-05-08T07:50:55.527285345Z (1778226655)
Build Profile: dist
```

exit 0, 0.02 s wall.

### Step 4: scaffold with the defaults

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

exit 0, 0.11 s wall.

### Step 5 as the page says it: forge build straight after the scaffold (fails: nothing is installed yet)

```
$ forge build
Unable to resolve imports:
      "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol" in "<tmp>/my-app/contracts/src/GatedERC20.sol"
      "forge-std/Script.sol" in "<tmp>/my-app/contracts/script/Deploy.s.sol"
      "forge-std/Script.sol" in "<tmp>/my-app/contracts/script/RedbellyDeployScript.sol"
      "forge-std/Test.sol" in "<tmp>/my-app/contracts/test/DeployPreflight.t.sol"
      "@openzeppelin/contracts/access/IAccessControl.sol" in "<tmp>/my-app/contracts/test/GatedERC20.t.sol"
      "@openzeppelin/contracts/utils/Pausable.sol" in "<tmp>/my-app/contracts/test/GatedERC20.t.sol"

[... 86 lines omitted ...]

Error (6275): Source "node_modules/@openzeppelin/contracts/utils/Pausable.sol" not found: File not found. Searched the following locations: "<tmp>/my-app/contracts".
ParserError: Source "node_modules/@openzeppelin/contracts/utils/Pausable.sol" not found: File not found. Searched the following locations: "<tmp>/my-app/contracts".
 --> test/GatedERC20.t.sol:8:1:
  |
8 | import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
  | ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
```

exit 1, 0.06 s wall.

### Install (the scaffolder's first next step): npm install at the project root

```
$ npm install --no-audit --no-fund
added 467 packages in 1m
npm warn deprecated @safe-global/safe-gateway-typescript-sdk@3.23.1: Package no longer supported. Contact Support at https://www.npmjs.com/support for more info.
```

exit 0, 72.0 s wall.

### Install (the scaffolder's second next step): npm run contracts:install

```
$ npm run contracts:install
> contracts:install
> cd contracts && npm install && npm run install:forge-std


added 1 package, and audited 2 packages in 1s

found 0 vulnerabilities

> install:forge-std
> forge install foundry-rs/forge-std@v1.16.2 --no-git

Installing forge-std in <tmp>/my-app/contracts/lib/forge-std (url: https://github.com/foundry-rs/forge-std, tag: v1.16.2)
    Installed forge-std v1.16.2
Cloning into '<tmp>/my-app/contracts/lib/forge-std'...
```

exit 0, 3.06 s wall.

### Step 5: forge build, after the install

```
$ forge build
Compiling 44 files with Solc 0.8.30
Solc 0.8.30 finished in 4.61s
Compiler run successful!
```

exit 0, 4.76 s wall.

### Step 7: forge test (every gated function in five states, fuzz, invariants, deploy pre-flight)

```
$ forge test
Ran 9 tests for test/DeployPreflight.t.sol:DeployPreflightTest
[PASS] test_mainnet_accepts_safe_with_threshold_two_and_verified_deployer() (gas: 255518)
[PASS] test_mainnet_refuses_eoa_admin() (gas: 62817)
[PASS] test_mainnet_refuses_threshold_one() (gas: 255291)
[PASS] test_mainnet_refuses_unverified_deployer() (gas: 231044)
[PASS] test_mainnet_refuses_without_admin_safe() (gas: 55366)
[PASS] test_mainnet_refuses_wrong_version_or_singleton() (gas: 468805)
[PASS] test_other_chain_skips_identity() (gas: 20188)
[PASS] test_redbelly_refuses_when_registry_missing() (gas: 17649)
[PASS] test_testnet_allows_eoa_admin_but_still_checks_identity() (gas: 71627)
Suite result: ok. 9 passed; 0 failed; 0 skipped; finished in 2.73ms (1.47ms CPU time)
Ran 14 tests for test/GatedERC20.t.sol:GatedERC20Test
[PASS] test_forceTransfer_movesFromRevokedHolder_withJustification() (gas: 184322)
[PASS] test_forceTransfer_recipientRevertsInAllInvalidStates() (gas: 197779)
[PASS] test_forceTransfer_requiresJustification_andRole() (gas: 166116)
[PASS] test_mint_revertsForIneligibleRecipient() (gas: 95004)
[PASS] test_mint_valid_and_onlyMinter() (gas: 112192)
[PASS] test_pause_blocksEverythingButUnpause() (gas: 213641)
[PASS] test_setVerifierAndRequestId_onlyAdmin() (gas: 38807)
[PASS] test_subscribe_closed() (gas: 60130)
[PASS] test_subscribe_revertsInAllInvalidStates() (gas: 181345)
[PASS] test_subscribe_valid() (gas: 133630)
[PASS] test_transferFrom_checksRealParties() (gas: 221842)
[PASS] test_transfer_bothPartiesInAllFiveStates() (gas: 351424)
[PASS] test_transfer_bothValid() (gas: 184549)
[PASS] test_transfer_recipientRevertsInAllInvalidStates() (gas: 197328)
Suite result: ok. 14 passed; 0 failed; 0 skipped; finished in 8.73ms (7.62ms CPU time)
Ran 3 tests for test/GatedERC20.fuzz.t.sol:GatedERC20FuzzTest
[PASS] testFuzz_forceTransfer_alwaysNeedsJustification(uint256,string) (runs: 512, μ: 185981, ~: 187985)
[PASS] testFuzz_subscribe_onlyValidOnce(address,uint8) (runs: 512, μ: 66878, ~: 50451)
[PASS] testFuzz_transfer_requiresBothValid(address,address,uint8,uint8,uint256) (runs: 512, μ: 160490, ~: 158894)
Suite result: ok. 3 passed; 0 failed; 0 skipped; finished in 863.21ms (1.07s CPU time)
Ran 4 tests for test/GatedERC20.invariants.t.sol:GatedERC20Invariants
[PASS] invariant_forcedTransfersEmitJustification() (runs: 64, calls: 2048, reverts: 0)
[PASS] invariant_noIneligibleRecipient() (runs: 64, calls: 2048, reverts: 0)
[PASS] invariant_pausedMeansNoStateChange() (runs: 64, calls: 2048, reverts: 0)
[PASS] invariant_supplyEqualsSumOfBalances() (runs: 64, calls: 2048, reverts: 0)
Suite result: ok. 4 passed; 0 failed; 0 skipped; finished in 955.85ms (2.31s CPU time)
Ran 4 test suites in 957.92ms (1.83s CPU time): 30 tests passed, 0 failed, 0 skipped (30 total tests)
```

exit 0, 1.10 s wall.

### Step 6: the rules files the scaffold wrote, checked for drift against the renderer

```
$ npm run rules:check
> rules:check
> node vendor/redbelly-agent-rules/dist/esm/cli.js --check --out . --only claude,agents,cursor,copilot,gemini

ok       CLAUDE.md
ok       AGENTS.md
ok       .cursor/rules/redbelly.mdc
ok       .github/copilot-instructions.md
ok       GEMINI.md
```

exit 0, 0.22 s wall.

### The web app the default scaffold includes: npm run web:build (Next.js)

```
$ npm run web:build
> web:build
> npm run --workspace web build


> web@0.1.0 build
> next build

▲ Next.js 16.3.5 (Turbopack)
✓ Running next.config.ts took 34ms
Attention: Next.js now collects completely anonymous telemetry regarding usage.
This information is used to shape Next.js' roadmap and prioritize features.
You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:
https://nextjs.org/telemetry


  Creating an optimized production build ...
✓ Compiled successfully in 14.6s
  Running TypeScript ...
  Finished TypeScript in 6.6s ...
  Collecting page data using 3 workers ...
  Generating static pages using 3 workers (0/3) ...
✓ Generating static pages using 3 workers (3/3) in 206ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found


○  (Static)  prerendered as static content
```

exit 0, 23.7 s wall.

### forge fmt --check on the scaffold

```
$ forge fmt --check

```

exit 0, 0.06 s wall.

### Step 8, on the fork: which of Anvil's default accounts the real permission contract allows (accounts 0 and 1 pass, never use them)

```
$ for a in <anvil accounts 0..2>; do cast call $PERMISSION "isAllowed(address)(bool)" $a --rpc-url anvil; done
0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266: true
0x70997970C51812dc3A010C7d01b50e0d17dc79C8: true
0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC: false
```

exit 0, 2.93 s wall.

### Step 8, on the fork: deploy with Anvil account 2 as the sender (unverified): refused by the real permission contract

```
$ forge script script/Deploy.s.sol --rpc-url anvil --sender 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC --unlocked --broadcast
├─ [0] console::log("chain id (from the RPC):", 153) [staticcall]
    ├─ [0] console::log("deployer:", 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC) [staticcall]
    ├─ [20174] 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690::isAllowed(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC) [staticcall]
    │   ├─ [15226] 0x7F31637245B89041173f7FE983705581c8F43685::isAllowed(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC) [delegatecall]
    │   │   ├─ [2699] 0x0E153C090f83e5D8672A47Ec70BC5384778BbDd8::isAllowed(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC) [staticcall]
    ├─ [0] console::log("deployer fails permission.isAllowed. Verify the wallet at https://access.redbelly.network and try again.") [staticcall]
    └─ ← [Revert] deployer fails permission.isAllowed
  chain id (from the RPC): 153
  deployer: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  deployer fails permission.isAllowed. Verify the wallet at https://access.redbelly.network and try again.
Error: script failed: deployer fails permission.isAllowed
```

exit 1, 2.25 s wall.

### Step 8, on the fork: impersonate a wallet that isAllowed on 153 (the known allowed address from chain-definitions) and fund it locally

```
$ cast rpc anvil_impersonateAccount 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 --rpc-url anvil; cast rpc anvil_setBalance 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 0x3635c9adc5dea00000 --rpc-url anvil; cast call $PERMISSION "isAllowed(address)(bool)" 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 --rpc-url anvil
true
```

exit 0, 0.24 s wall.

### Step 8, on the fork: deploy with the impersonated verified wallet (accepted)

```
$ forge script script/Deploy.s.sol --rpc-url anvil --sender 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 --unlocked --broadcast
token: contract GatedERC20 0xA26cdf5a504D9f7A7CdF4F7FeC33e851c0F79aED
  chain id (from the RPC): 153
  deployer: 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
  permission.isAllowed(deployer): true
  ADMIN_SAFE not set: the deployer holds the admin roles. Fine on testnet, refused on mainnet.
  admin: 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
  VERIFIER not set: DEPLOYING RECEPTOR MOCK. Every wallet starts ineligible; setStatus() decides. Not for mainnet.
  GatedERC20: 0xA26cdf5a504D9f7A7CdF4F7FeC33e851c0F79aED
  verifier: 0xCF1049b42750102F6BA28c4d5D48649877Bd55A8
  deployment record not written (grant write access to deployments/ in foundry.toml)
Estimated gas price: 391765.097647451 gwei
Estimated total gas used for script: 2668340
Estimated amount required: 1045.36248065659940134 RBNT
ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
```

exit 0, 2.24 s wall.

### Step 8, on the fork: the same deploy after two scaffolder fixes (the script now creates deployments/ before writing the record, and the default request id is 18, the over-18 recipe)

```
$ forge script script/Deploy.s.sol --rpc-url anvil --sender 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 --unlocked --broadcast
token: contract GatedERC20 0x5949F2aD56ee79BB088fb38272bb4004847A721d
  chain id (from the RPC): 153
  deployer: 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
  permission.isAllowed(deployer): true
  ADMIN_SAFE not set: the deployer holds the admin roles. Fine on testnet, refused on mainnet.
  admin: 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
  VERIFIER not set: DEPLOYING RECEPTOR MOCK. Every wallet starts ineligible; setStatus() decides. Not for mainnet.
  GatedERC20: 0x5949F2aD56ee79BB088fb38272bb4004847A721d
  verifier: 0x2600f1D4AcE4255fE26E02918Bb576eAEBa3bDC8
  deployment record: deployments/153-GatedERC20.json
Estimated gas price: 153847.720781233 gwei
Estimated total gas used for script: 2668325
Estimated amount required: 410.515719553583544725 RBNT
ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
```

exit 0, 1.96 s wall.

### The deployment record

```
$ cat deployments/153-GatedERC20.json
{
  "admin": "0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76",
  "adminIsSafe": false,
  "chainId": 153,
  "contract": "0x5949F2aD56ee79BB088fb38272bb4004847A721d",
  "deployer": "0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76",
  "evmVersion": "prague",
  "solc": "0.8.30"
}
```

exit 0, 0.00 s wall.

### Step 8, the gate on the fork: subscribe() from the verified deployer while the mock says NeverIssued for request 18

```
$ cast send --unlocked --from 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 0x5949F2aD56ee79BB088fb38272bb4004847A721d "subscribe()" --rpc-url anvil
Error: Failed to estimate gas: server returned an error response: error code 3: execution reverted: custom error 0x879342fb: 000000000000000000000000a2c6a3fc1e12df79b9e3d099faa2ffe860450f760000000000000000000000000000000000000000000000000000000000000012, data: "0x879342fb000000000000000000000000a2c6a3fc1e12df79b9e3d099faa2ffe860450f760000000000000000000000000000000000000000000000000000000000000012": NotEligible(0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76, 18)
```

exit 1, 0.25 s wall.

### Step 8, the gate on the fork: mark the wallet Valid for request 18 on the mock, subscribe again, read the balance

```
$ cast send --unlocked --from 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 0x2600f1D4AcE4255fE26E02918Bb576eAEBa3bDC8 "setStatus(address,uint64,uint8)" 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 18 1 --rpc-url anvil; cast send --unlocked --from 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 0x5949F2aD56ee79BB088fb38272bb4004847A721d "subscribe()" --rpc-url anvil; cast call 0x5949F2aD56ee79BB088fb38272bb4004847A721d "balanceOf(address)(uint256)" 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 --rpc-url anvil
status               1 (success)
transactionHash      0x90e74ff1d8ba8cb714f7cccc142fa3999ca352d54de3269546282adad09e6e2e
status               1 (success)
transactionHash      0x6d22c3608b2ed8bc8340187820ec278ca746be1cd11589c8399206bde515147d
balance: 100000000000000000000 [1e20]
```

exit 0, 0.56 s wall.

### Step 10, on the fork: the same write from Anvil account 2, which the network has never verified. A fork does not enforce the node-level permission map, so only the contract's own gate answers here

```
$ cast send --unlocked --from 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 0x5949F2aD56ee79BB088fb38272bb4004847A721d "subscribe()" --rpc-url anvil
Error: Failed to estimate gas: server returned an error response: error code 3: execution reverted: custom error 0x879342fb: 0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000012, data: "0x879342fb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000012": NotEligible(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 18)
```

exit 1, 0.24 s wall.

### Step 9: Routescan verification, dry run only. --show-standard-json-input compiles and prints what forge would send; nothing is submitted

```
$ forge verify-contract 0x5949F2aD56ee79BB088fb38272bb4004847A721d src/GatedERC20.sol:GatedERC20 --verifier-url 'https://api.routescan.io/v2/network/testnet/evm/153/etherscan' --etherscan-api-key verifyContract --compiler-version 0.8.30 --evm-version prague --num-of-optimizations 200 --constructor-args $(cast abi-encode "constructor(string,string,address,address,uint64,uint256)" "Gated Token" GTOK 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 0x2600f1D4AcE4255fE26E02918Bb576eAEBa3bDC8 18 100000000000000000000) --show-standard-json-input > standard-json-input.json
wrote standard-json-input.json, 54864 bytes
language: Solidity
evmVersion: prague  optimizer: {"enabled":true,"runs":200}
sources (14):
  src/GatedERC20.sol
  node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol
  node_modules/@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol
  node_modules/@openzeppelin/contracts/access/AccessControl.sol
  lib/receptor-mock/src/Gated.sol
  lib/receptor-mock/src/IRedbellyVerifier.sol
  node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol
  node_modules/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol
  node_modules/@openzeppelin/contracts/utils/Context.sol
  node_modules/@openzeppelin/contracts/interfaces/draft-IERC6093.sol
  node_modules/@openzeppelin/contracts/utils/Pausable.sol
  node_modules/@openzeppelin/contracts/access/IAccessControl.sol
  node_modules/@openzeppelin/contracts/utils/introspection/ERC165.sol
  node_modules/@openzeppelin/contracts/utils/introspection/IERC165.sol
```

exit 0, 0.31 s wall.

### Step 9: Routescan answers a read-only status query on both networks (forge verify-check with a dummy guid; the Etherscan-shaped 'not found' is the expected answer, and proves the URL form)

```
$ forge verify-check 0 --verifier-url 'https://api.routescan.io/v2/network/testnet/evm/153/etherscan' --etherscan-api-key verifyContract; forge verify-check 0 --verifier-url 'https://api.routescan.io/v2/network/mainnet/evm/151/etherscan' --etherscan-api-key verifyContract
- Contract verification failed:
Status: `0`
Result: `Verification not found`
---
- Contract verification failed:
Status: `0`
Result: `Verification not found`
```

exit 0, 0.58 s wall.

### Step 8: the scaffold's own pre-flight script, offline first (npm run preflight -- --offline), with DEPLOYER set to the impersonated wallet

```
$ DEPLOYER=0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 npm run preflight -- --offline
> preflight
> node scripts/preflight.mjs --offline

pre-flight for chain 153 (Redbelly Network Testnet)

ok   chain id is a Redbelly network
ok   foundry.toml pins solc 0.8.30 and prague
ok   hardhat.config.ts carries the same pins and no key
ok   no .env or keystore is tracked by git
ok   no .env ever committed in history
ok   no 64-hex-character value (a private key shape) in tracked files
ok   DEPLOYER is a public address
note ADMIN_SAFE is empty: the deployer will hold admin roles on testnet. Put a Safe there before mainnet.

(offline: chain id, isAllowed, Safe and balance checks skipped)

7 of 7 checks passed.
Pre-flight clear. Sign with `forge script ... --account <keystore-name>`; no key is read here.
```

exit 0, 0.25 s wall.

### Step 8: the scaffold's own pre-flight script against the fork (npm run preflight -- --rpc http://127.0.0.1:8545)

```
$ DEPLOYER=0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 npm run preflight -- --rpc http://127.0.0.1:8545
> preflight
> node scripts/preflight.mjs --rpc http://127.0.0.1:8545

pre-flight for chain 153 (Redbelly Network Testnet)

ok   chain id is a Redbelly network
ok   foundry.toml pins solc 0.8.30 and prague
ok   hardhat.config.ts carries the same pins and no key
ok   no .env or keystore is tracked by git
ok   no .env ever committed in history
ok   no 64-hex-character value (a private key shape) in tracked files
ok   DEPLOYER is a public address
note ADMIN_SAFE is empty: the deployer will hold admin roles on testnet. Put a Safe there before mainnet.
ok   RPC reports the configured chain id: http://127.0.0.1:8545 says 153
ok   deployer passes permission.isAllowed
ok   deployer holds at least 1 RBNT: 279.7464313832483386 RBNT

10 of 10 checks passed.
Pre-flight clear. Sign with `forge script ... --account <keystore-name>`; no key is read here.
```

exit 0, 0.41 s wall.

### Static analysis: Slither 0.11.6 through the scaffold's lint:slither, which writes the JSON report and the sources hash that pre-flight compares (both new today; see the findings)

```
$ bash -c 'npm run lint:slither 2>&1 | grep -E 'analyzed|result|wrote''
. analyzed (16 contracts with 81 detectors), 0 result(s) found
wrote contracts/reports/slither.json and contracts/reports/slither.sources.sha256
```

exit 0, 1.50 s wall.

### Step 8: redbelly-preflight (the seven-check CLI), read-only with --address, against the fork, from contracts/

```
$ cd contracts && redbelly-preflight --chain 153 --rpc http://127.0.0.1:8545 --address 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
redbelly-preflight 0.1.0  project <tmp>/my-app/contracts
chain 153 (testnet) via http://127.0.0.1:8545  deployer 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76

pass  chain-id           --chain says chain 153 and the RPC reports 153.
pass  deployer-verified  0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 (--address) passes permission.isAllowed on chain 153.
skip  admin-safe         No admin given; pass --admin <0x…> with the address that will own the deployed contracts.
pass  compiler-pins      <tmp>/my-app/contracts/foundry.toml (profile default) pins solc 0.8.30 and EVM prague.
skip  git-secrets        Not a git repository, so there is no history to scan.
pass  balance            0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 holds 279.7464 RBNT; 3,000,000 gas costs about 90.6243 RBNT (US$0.2203) and 113.2804 RBNT covers it with 25% margin.
pass  slither-report     reports/slither.json describes the current sources: reports/slither.sources.sha256 matches the hash of 1 .sol file(s) under src.

ok: no check failed.
```

exit 0, 0.42 s wall.
