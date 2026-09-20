# Golden path, 2026-09-14: the /start page followed literally, with `npm run dev` as the local loop

Date: 2026-09-14T19:58:24.123Z (start).
Page: `site/src/content/docs/start.mdx` as rewritten for wave 6 (PLAN.md 18.1), read as a first-time builder would.
Scaffolder: create-redbelly-dapp 0.1.0, `--yes` (gated-erc20, npm, Hardhat, web app).
Toolchain: forge Version: 1.7.1 from the @foundry-rs npm packages, Node v22.22.2, npm 10.9.7, Slither 0.11.6, Playwright chromium for the browser steps.
Keys: none. This session held no wallet, no keystore and no key. The real networks were only read (`eth_call`, `eth_chainId`, a balance, Routescan's endpoint form); every transaction below landed on the local Anvil that `npm run dev` started. Anvil's accounts 0 and 1 were never used.

The previous run of this page (12 September 2026, `golden-path-foundry.md`) took nineteen minutes wall, including two scaffolder fixes and the re-runs they caused, and its local loop was six commands across two shells. This run follows the rewritten page, where the local loop is one command. The timings table at the end is the measurement; the total is the whole script's wall time, tool time and waiting included, with no human reading time in it.

### Step 1: the isAllowed read against the real testnet RPC (read-only), the known allowed address

```
$ cast call 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690 "isAllowed(address)(bool)" 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 --rpc-url https://governors.testnet.redbelly.network
true
```

exit 0, 1.99 s wall.

### Step 1: the same read for the zero address

```
$ cast call 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690 "isAllowed(address)(bool)" 0x0000000000000000000000000000000000000000 --rpc-url https://governors.testnet.redbelly.network
false
```

exit 0, 1.24 s wall.

### Step 3: the toolchain (Foundry from the @foundry-rs npm packages); the keystore import is not run, no key here

```
$ forge --version && anvil --version | head -1
forge Version: 1.7.1
Commit SHA: 4072e48705af9d93e3c0f6e29e93b5e9a40caed8
Build Timestamp: 2026-05-08T07:50:55.527285345Z (1778226655)
Build Profile: dist
anvil Version: 1.7.1
```

exit 0, 0.01 s wall.

### Step 4: scaffold with the defaults

```
$ node packages/create-redbelly-dapp/bin/index.js my-app --yes
writing project files
  vendoring @gatedpath/chains and @gatedpath/agent-rules
  vendoring @gatedpath/frontend-kit for the web app
  copying receptor-mock into contracts/lib
  copying the contract kit (GatedERC20, IssuerRegistry and their tests) into contracts/
  generating contracts/script/Redbelly.sol from @gatedpath/chains
  writing rules files (CLAUDE.md, AGENTS.md, .cursor/rules/redbelly.mdc, .github/copilot-instructions.md, GEMINI.md)

Scaffolded gated-erc20 into <tmp>/my-app (64 files).

Next steps
  cd <tmp>/my-app
  npm install                 installs the web app and tooling
  npm run contracts:install   forge install of forge-std and OpenZeppelin at the pinned tags
  npm run test                forge build and forge test (unit, fuzz, invariant) in all five credential states
  npm run preflight           the checks the deploy script makes, run offline first

Read README.md for the golden path. Nothing in this project reads a private key; deploys use
`forge script --account <keystore-name>` or a hardware wallet. Mainnet (151) refuses to deploy
unless ADMIN_SAFE is a Safe 1.4.1 with a threshold of two or more and the deployer passes isAllowed.
The hardhat/ folder compiles the same sources with the same pins; see README.md for its commands.
```

exit 0, 0.12 s wall.

### Step 5: npm install at the project root (web app, Hardhat view, vendored packages)

```
$ npm install
added 525 packages in 30s
npm warn deprecated @safe-global/safe-gateway-typescript-sdk@3.23.1: Package no longer supported. Contact Support at https://www.npmjs.com/support for more info.
```

exit 0, 29.99 s wall.

### Step 5: npm run contracts:install (OpenZeppelin from npm, forge-std with forge install --no-git)

```
$ npm run contracts:install
added 1 package, and audited 2 packages in 418ms
    Installed forge-std v1.16.2
```

exit 0, 1.84 s wall.

### Step 6: npm run dev: fork 153, deploy, seed five wallets, start the web app (stdout, the table)

```
$ npm run dev
> dev
> node scripts/dev.mjs

Local loop ready: Anvil chain 31337 (fork of 153 at block 3035484) at http://127.0.0.1:8545
GatedERC20 0x07AF11e412ed7C343603c0F4b35645f7870686Eb   verifier (ReceptorMock) 0x37cA242a94945CdC3d3F155452a82Af6374bebD7   request id 18
deployer and admin: Anvil account 7 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 (accounts 0 and 1 are never used)

Wallet  State              Address                                     Impersonate (cast)
------  -----------------  ------------------------------------------  ------------------------------------------------------------------------------------------------------------
2       NeverIssued        0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC  cast rpc anvil_impersonateAccount 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC --rpc-url http://127.0.0.1:8545
3       Valid              0x90F79bf6EB2c4f870365E785982E1f101E93b906  cast rpc anvil_impersonateAccount 0x90F79bf6EB2c4f870365E785982E1f101E93b906 --rpc-url http://127.0.0.1:8545
4       Expired            0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65  cast rpc anvil_impersonateAccount 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 --rpc-url http://127.0.0.1:8545
5       Revoked            0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc  cast rpc anvil_impersonateAccount 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc --rpc-url http://127.0.0.1:8545
6       WrongJurisdiction  0x976EA74026E726554dB657fA54763abd0C3a0aa9  cast rpc anvil_impersonateAccount 0x976EA74026E726554dB657fA54763abd0C3a0aa9 --rpc-url http://127.0.0.1:8545

States are per request id 18; change one with: cast send 0x37cA242a94945CdC3d3F155452a82Af6374bebD7 "setStatus(address,uint64,uint8)" <wallet> 18 <0-4> --unlocked --from 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 --rpc-url http://127.0.0.1:8545
Record: deployments/local.json (account indices, never a key). Web app with the dev state panel: http://localhost:3000
Ctrl-C stops Anvil and the web app.
```

exit 0, 15.46 s wall.

What the script logged while it worked (stderr):

```
[dev] anvil --port 8545 --chain-id 31337 --silent --fork-url https://governors.testnet.redbelly.network
[dev] anvil ready, forked 153 at block 3035484 (1.9 s)
[dev] forge build (4.2 s)
[dev] permission gate mocked at 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690; deployer and the five wallets allowed (4.7 s)
[dev] deployed GatedERC20 0x07AF11e412ed7C343603c0F4b35645f7870686Eb with ReceptorMock 0x37cA242a94945CdC3d3F155452a82Af6374bebD7, request id 18 (2.7 s)
[dev] subscriptions opened
[dev] seeded five wallets (1.8 s)
[dev] ready in 15.2 s
```

`deployments/local.json` as written (account indices, never a key):

```
{
  "chainId": 31337,
  "forkOf": 153,
  "verifier": "0x37cA242a94945CdC3d3F155452a82Af6374bebD7",
  "contract": "0x07AF11e412ed7C343603c0F4b35645f7870686Eb",
  "requestId": 18,
  "deployer": {
    "index": 7,
    "address": "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955"
  },
  "wallets": [
    {
      "index": 2,
      "state": "NeverIssued",
      "address": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      "note": "Anvil account 2; no credential; every gated call reverts NotEligible"
    },
    {
      "index": 3,
      "state": "Valid",
      "address": "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      "note": "Anvil account 3; passes the gate; the gated action succeeds"
    },
    {
      "index": 4,
      "state": "Expired",
      "address": "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
      "note": "Anvil account 4; credential past its window; reverts NotEligible"
    },
    {
      "index": 5,
      "state": "Revoked",
      "address": "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
      "note": "Anvil account 5; issuer revoked the credential; reverts NotEligible"
    },
    {
      "index": 6,
      "state": "WrongJurisdiction",
      "address": "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
      "note": "Anvil account 6; credential doesn't satisfy the query; reverts NotEligible"
    }
  ],
  "startedAt": "2026-09-14T19:58:59.874Z"
}
```

### Step 6: the web app answers on /eligibility (Next.js dev server, first compile included)

```
$ curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/eligibility
200
```

exit 0, 7.53 s wall.

### Step 6: the dev state panel on /eligibility (browser): five wallets in enum order

```
$ open http://localhost:3000/eligibility
panel rows: 5
wallet 2: NeverIssued (no credential)
wallet 3: Valid (passes the gate)
wallet 4: Expired (credential past its window)
wallet 5: Revoked (issuer revoked it)
wallet 6: WrongJurisdiction (credential does not satisfy the query)
```

exit 0, 0.55 s wall.

### Step 6: connect wallet 3 (Valid) with no key: the gate shows Eligible

```
$ click Connect on wallet 3
row: 3 connectedValid (passes the gate)0x90F7…b906Disconnect
gate: Eligible
```

exit 0, 0.11 s wall.

### Step 6: flip the connected wallet to Expired: setStatus as the impersonated deployer, the page re-renders without a reload

```
$ click Expired
panel: 0x90F7…b906 is now Expired (block 3035499)
gate: Not eligible for this action
page loads since open: 1
```

exit 0, 0.35 s wall.

### Step 6: and back to Valid

```
$ click Valid
gate: Eligible
page loads since open: 1
browser errors: none
```

exit 0, 3.84 s wall.

### Step 6: break it: wallet 2 (NeverIssued) calls subscribe() and the contract refuses

```
$ cast send --unlocked --from 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 0x07AF11e412ed7C343603c0F4b35645f7870686Eb "subscribe()" --rpc-url http://127.0.0.1:8545
Error: Failed to estimate gas: server returned an error response: error code 3: execution reverted: custom error 0x879342fb: 0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000012, data: "0x879342fb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000012": NotEligible(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 18)
```

exit 1, 0.24 s wall.

### Step 6: wallet 3 (Valid) calls subscribe() and it goes through

```
$ cast send --unlocked --from 0x90F79bf6EB2c4f870365E785982E1f101E93b906 0x07AF11e412ed7C343603c0F4b35645f7870686Eb "subscribe()" --rpc-url http://127.0.0.1:8545
blockNumber          3035501
logs                 [{"address":"0x07af11e412ed7c343603c0f4b35645f7870686eb","topics":["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef","0x0000000000000000000000000000000000000000000000000000000000000000","0x00000000000000000000000090f79bf6eb2c4f870365e785982e1f101e93b906"],"data":"0x0000000000000000000000000000000000000000000000056bc75e2d63100000","blockHash":"0x84012fbaae01db156392c9e3d6b10ac8ab6781bb393bb237c4499a4380e2357b","blockNumber":"0x2e516d","blockTimestamp":"0x6aa851a7","transactionHash":"0x075d846078f9ad73ef8bd12fdf8046060549713b3e5b6c26124313b30f805329","transactionIndex":"0x0","logIndex":"0x0","removed":false},{"address":"0x07af11e412ed7c343603c0f4b35645f7870686eb","topics":["0x4b90d6788928d63c1821907a6a8b95f40d26562d8fe41b105f7489db9966dfcb","0x00000000000000000000000090f79bf6eb2c4f870365e785982e1f101e93b906"],"data":"0x0000000000000000000000000000000000000000000000056bc75e2d63100000","blockHash":"0x84012fbaae01db156392c9e3d6b10ac8ab6781bb393bb237c4499a4380e2357b","blockNumber":"0x2e516d","blockTimestamp":"0x6aa851a7","transactionHash":"0x075d846078f9ad73ef8bd12fdf8046060549713b3e5b6c26124313b30f805329","transactionIndex":"0x0","logIndex":"0x1","removed":false}]
status               1 (success)
transactionHash      0x075d846078f9ad73ef8bd12fdf8046060549713b3e5b6c26124313b30f805329
```

exit 0, 0.29 s wall.

### Step 6: its balance afterwards

```
$ cast call 0x07AF11e412ed7C343603c0F4b35645f7870686Eb "balanceOf(address)(uint256)" 0x90F79bf6EB2c4f870365E785982E1f101E93b906 --rpc-url http://127.0.0.1:8545
100000000000000000000 [1e20]
```

exit 0, 0.02 s wall.

### Step 6: the same flip from the shell: wallet 4 (Expired) to Valid, as the table's footer says

```
$ cast send 0x37cA242a94945CdC3d3F155452a82Af6374bebD7 "setStatus(address,uint64,uint8)" 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 18 1 --unlocked --from 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 --rpc-url http://127.0.0.1:8545 && cast call 0x37cA242a94945CdC3d3F155452a82Af6374bebD7 "eligibilityStatus(address,uint64)(uint8)" 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 18 --rpc-url http://127.0.0.1:8545
status               1 (success)
1
```

exit 0, 0.28 s wall.

### Step 6: a second npm run dev while the first runs

```
$ npm run dev
[dev] npm run dev is already running (pid 16509, since 2026-09-14T19:58:59.874Z, Anvil on port 8545). Stop it with Ctrl-C there, or kill 16509.
```

exit 2, 0.07 s wall.

### Step 6: Ctrl-C: Anvil and the web app stop together

```
$ ^C
npm run dev: ended by SIGINT (npm relays Ctrl-C to scripts/dev.mjs, which exits 0; the scaffolder's test/dev.test.mjs asserts that code)
anvil on http://127.0.0.1:8545: stopped
web on http://localhost:3000: stopped
deployments/local.lock: removed
deployments/local.json: kept
```

exit 0, 1.61 s wall.

### Step 7: the rules files have not drifted

```
$ npm run rules:check
ok       CLAUDE.md
ok       AGENTS.md
ok       .cursor/rules/redbelly.mdc
ok       .github/copilot-instructions.md
ok       GEMINI.md
```

exit 0, 0.16 s wall.

### Step 8: forge build (already compiled by npm run dev; a no-op here)

```
$ cd contracts && forge build
No files changed, compilation skipped
```

exit 0, 0.08 s wall.

### Step 8: forge test: every gated function in five states, fuzz and invariants

```
$ npm test
Ran 9 tests for test/DeployPreflight.t.sol:DeployPreflightTest
Suite result: ok. 9 passed; 0 failed; 0 skipped; finished in 1.68ms (997.36µs CPU time)
Ran 7 tests for test/AdminPattern.t.sol:AdminPatternTest
Suite result: ok. 7 passed; 0 failed; 0 skipped; finished in 1.77ms (719.12µs CPU time)
Ran 21 tests for test/GatedERC20.t.sol:GatedERC20Test
Suite result: ok. 21 passed; 0 failed; 0 skipped; finished in 4.92ms (3.88ms CPU time)
Ran 7 tests for test/IssuerRegistry.t.sol:IssuerRegistryTest
Suite result: ok. 7 passed; 0 failed; 0 skipped; finished in 189.60ms (188.90ms CPU time)
Ran 4 tests for test/GatedERC20.fuzz.t.sol:GatedERC20FuzzTest
Suite result: ok. 4 passed; 0 failed; 0 skipped; finished in 385.88ms (381.25ms CPU time)
Ran 6 tests for test/GatedERC20.invariants.t.sol:GatedERC20NoDowngradeInvariants
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
Suite result: ok. 6 passed; 0 failed; 0 skipped; finished in 1.49s (2.13s CPU time)
Ran 6 tests for test/GatedERC20.invariants.t.sol:GatedERC20Invariants
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
Suite result: ok. 6 passed; 0 failed; 0 skipped; finished in 1.49s (1.97s CPU time)
╭---------------------------------+--------+--------+---------╮
╰---------------------------------+--------+--------+---------╯
```

exit 0, 1.59 s wall.

### Step 8: forge fmt --check

```
$ cd contracts && forge fmt --check src script test

```

exit 0, 0.02 s wall.

### Step 9: Slither through the scaffold script (writes the report and the sources hash)

```
$ npm run lint:slither
wrote contracts/reports/slither.json and contracts/reports/slither.sources.sha256
. analyzed (17 contracts with 81 detectors), 3 result(s) found
```

exit 0, 1.18 s wall.

### Step 9: the scaffold pre-flight, read-only against the real testnet with a public address

```
$ DEPLOYER=0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 npm run preflight
> preflight
> node scripts/preflight.mjs

pre-flight for chain 153 (Redbelly Network Testnet)

ok   chain id is a Redbelly network
ok   foundry.toml pins solc 0.8.30 and prague
ok   hardhat.config.ts carries the same pins and no key
ok   no .env or keystore is tracked by git
ok   no .env ever committed in history
ok   no 64-hex-character value (a private key shape) in tracked files
ok   DEPLOYER is a public address
note ADMIN_SAFE is empty: the deployer will hold admin roles on testnet. Put a Safe there before mainnet.
ok   RPC reports the configured chain id: https://governors.testnet.redbelly.network says 153
ok   deployer passes permission.isAllowed
ok   deployer holds at least 1 RBNT: 380.528661255879942432 RBNT

10 of 10 checks passed.
Pre-flight clear. Sign with `forge script ... --account <keystore-name>`; no key is read here.
```

exit 0, 1.16 s wall.

### Step 9: redbelly-preflight, the seven-check CLI, read-only against the real testnet from contracts/

```
$ cd contracts && redbelly-preflight --chain 153 --address 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
redbelly-preflight 0.1.0  project <tmp>/my-app/contracts
chain 153 (testnet) via https://governors.testnet.redbelly.network  deployer 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76

pass  chain-id           --chain says chain 153 and the RPC reports 153.
pass  deployer-verified  0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 (--address) passes permission.isAllowed on chain 153.
skip  admin-safe         No admin given; pass --admin <0x…> with the address that will own the deployed contracts.
pass  compiler-pins      <tmp>/my-app/contracts/foundry.toml (profile default) pins solc 0.8.30 and EVM prague.
skip  git-secrets        Not a git repository, so there is no history to scan.
fail  balance            0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 holds 380.5286 RBNT but 3,000,000 gas needs 768.3796 RBNT with 25% margin (US$1.4286 at the feed price); get testnet RBNT at https://redbelly.faucetme.pro/.
pass  slither-report     reports/slither.json describes the current sources: reports/slither.sources.sha256 matches the hash of 2 .sol file(s) under src.

not ok: 1 check failed. Do not deploy.
```

exit 1, 1.76 s wall.

### Step 9: the mainnet refusal, rehearsed offline

```
$ npm run preflight -- --chain 151 --offline
> preflight
> node scripts/preflight.mjs --chain 151 --offline

pre-flight for chain 151 (Redbelly Network Mainnet)

ok   chain id is a Redbelly network
ok   foundry.toml pins solc 0.8.30 and prague
ok   hardhat.config.ts carries the same pins and no key
ok   no .env or keystore is tracked by git
ok   no .env ever committed in history
ok   no 64-hex-character value (a private key shape) in tracked files
FAIL DEPLOYER is a public address: set DEPLOYER in .env to the wallet you sign with
FAIL ADMIN_SAFE is set (mainnet refuses without a Safe)
FAIL VERIFIER is set (mainnet never deploys a mock verifier)

(offline: chain id, isAllowed, Safe and balance checks skipped)

6 of 9 checks passed.
Mainnet deploy would be refused. Fix the failures above; the deploy script checks the same things.
```

exit 1, 0.19 s wall.

### Step 11: Routescan verification dry run: the standard JSON input forge would send for the token the local loop deployed

```
$ cd contracts && forge verify-contract 0x07AF11e412ed7C343603c0F4b35645f7870686Eb src/GatedERC20.sol:GatedERC20 --verifier-url 'https://api.routescan.io/v2/network/testnet/evm/153/etherscan' --etherscan-api-key verifyContract --compiler-version 0.8.30 --evm-version prague --num-of-optimizations 200 --constructor-args $(cast abi-encode "constructor(string,string,(address,address,address,address),address,uint64,uint256)" "Gated Token" GTOK "(<admin>,<admin>,<admin>,<admin>)" <verifier> 18 100000000000000000000) --show-standard-json-input | wc -c
66741
```

exit 0, 0.49 s wall.

## Timings

Every row is a measured wall time from this run. The total is the whole script, waiting included.

| Step | Wall time | Exit |
|---|---|---|
| Step 1: the isAllowed read against the real testnet RPC (read-only), the known allowed address | 2.0 s | 0 |
| Step 1: the same read for the zero address | 1.2 s | 0 |
| Step 3: the toolchain (Foundry from the @foundry-rs npm packages); the keystore import is not run, no key here | 0.0 s | 0 |
| Step 4: scaffold with the defaults | 0.1 s | 0 |
| Step 5: npm install at the project root (web app, Hardhat view, vendored packages) | 30.0 s | 0 |
| Step 5: npm run contracts:install (OpenZeppelin from npm, forge-std with forge install --no-git) | 1.8 s | 0 |
| Step 6: npm run dev: fork 153, deploy, seed five wallets, start the web app (stdout, the table) | 15.5 s | 0 |
| Step 6: the web app answers on /eligibility (Next.js dev server, first compile included) | 7.5 s | 0 |
| Step 6: the dev state panel on /eligibility (browser): five wallets in enum order | 0.5 s | 0 |
| Step 6: connect wallet 3 (Valid) with no key: the gate shows Eligible | 0.1 s | 0 |
| Step 6: flip the connected wallet to Expired: setStatus as the impersonated deployer, the page re-renders without a reload | 0.4 s | 0 |
| Step 6: and back to Valid | 3.8 s | 0 |
| Step 6: break it: wallet 2 (NeverIssued) calls subscribe() and the contract refuses | 0.2 s | 1 |
| Step 6: wallet 3 (Valid) calls subscribe() and it goes through | 0.3 s | 0 |
| Step 6: its balance afterwards | 0.0 s | 0 |
| Step 6: the same flip from the shell: wallet 4 (Expired) to Valid, as the table's footer says | 0.3 s | 0 |
| Step 6: a second npm run dev while the first runs | 0.1 s | 2 |
| Step 6: Ctrl-C: Anvil and the web app stop together | 1.6 s | 0 |
| Step 7: the rules files have not drifted | 0.2 s | 0 |
| Step 8: forge build (already compiled by npm run dev; a no-op here) | 0.1 s | 0 |
| Step 8: forge test: every gated function in five states, fuzz and invariants | 1.6 s | 0 |
| Step 8: forge fmt --check | 0.0 s | 0 |
| Step 9: Slither through the scaffold script (writes the report and the sources hash) | 1.2 s | 0 |
| Step 9: the scaffold pre-flight, read-only against the real testnet with a public address | 1.2 s | 0 |
| Step 9: redbelly-preflight, the seven-check CLI, read-only against the real testnet from contracts/ | 1.8 s | 1 |
| Step 9: the mainnet refusal, rehearsed offline | 0.2 s | 1 |
| Step 11: Routescan verification dry run: the standard JSON input forge would send for the token the local loop deployed | 0.5 s | 0 |
| **Total, start to end** | **1 min 13 s** | |

`npm run dev` alone, from the command to the table: 15.5 s. The web app's first compile after that: 7.5 s. The panel run: connect, Expired, Valid, no reload, 0 browser errors.

Previous run (12 September 2026, `golden-path-foundry.md`): nineteen minutes wall including two scaffolder fixes; its scaffold-to-fork-deploy tool time was under three minutes across six commands in two shells.

## What did not run

The keystore import (no key in any recorded session), the deploy to the real testnet and the Routescan submission (wallet-signed, not made yet), and the real network's error to an unverified wallet (a fork and a local Anvil do not enforce the node-level permission map). The page marks each as pending.

Finished 2026-09-14T19:59:36.964Z (1 min 13 s).
