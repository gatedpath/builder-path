# Golden path, 2026-09-14: the /start page followed literally, with `npm run dev` as the local loop

Date: 2026-09-14T22:36:43.349Z (start).
Page: `site/src/content/docs/start.mdx` as rewritten for wave 6 (PLAN.md 18.1), read as a first-time builder would.
Scaffolder: create-redbelly-dapp 0.1.0, `--yes` (gated-erc20, npm, web app; Foundry only, the wave 8 default, no Hardhat view).
Toolchain: forge Version: 1.7.1 from the @foundry-rs npm packages, Node v22.22.2, npm 10.9.7, Slither 0.11.6, Playwright chromium for the browser steps.
Keys: none. This session held no wallet, no keystore and no key. The real networks were only read (`eth_call`, `eth_chainId`, a balance, Routescan's endpoint form); every transaction below landed on the local Anvil that `npm run dev` started. Anvil's accounts 0 and 1 were never used.

The previous run of this page (12 September 2026, `golden-path-foundry.md`) took nineteen minutes wall, including two scaffolder fixes and the re-runs they caused, and its local loop was six commands across two shells. This run follows the rewritten page, where the local loop is one command. The timings table at the end is the measurement; the total is the whole script's wall time, tool time and waiting included, with no human reading time in it.

### Step 1: the isAllowed read against the real testnet RPC (read-only), the known allowed address

```
$ cast call 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690 "isAllowed(address)(bool)" 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 --rpc-url https://governors.testnet.redbelly.network
true
```

exit 0, 2.38 s wall.

### Step 1: the same read for the zero address

```
$ cast call 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690 "isAllowed(address)(bool)" 0x0000000000000000000000000000000000000000 --rpc-url https://governors.testnet.redbelly.network
false
```

exit 0, 1.43 s wall.

### Step 3: the toolchain (Foundry from the @foundry-rs npm packages); the keystore import is not run, no key here

```
$ forge --version && anvil --version | head -1
forge Version: 1.7.1
Commit SHA: 4072e48705af9d93e3c0f6e29e93b5e9a40caed8
Build Timestamp: 2026-05-08T07:50:55.527285345Z (1778226655)
Build Profile: dist
anvil Version: 1.7.1
```

exit 0, 0.02 s wall.

### Step 4: scaffold with the defaults

```
$ node packages/create-redbelly-dapp/bin/index.js my-app --yes
writing project files
  vendoring @gatedpath/chains, @gatedpath/agent-rules and @gatedpath/preflight (npm run doctor, gas and ship)
  vendoring @gatedpath/frontend-kit for the web app
  copying receptor-mock into contracts/lib
  copying the contract kit (GatedERC20, IssuerRegistry and their tests) into contracts/
  generating contracts/script/Redbelly.sol from @gatedpath/chains
  writing rules files (CLAUDE.md, AGENTS.md, .cursor/rules/redbelly.mdc, .github/copilot-instructions.md, GEMINI.md)

Scaffolded gated-erc20 into <tmp>/my-app (59 files).

Next steps
  cd <tmp>/my-app
  npm install                 installs the web app and tooling
  npm run contracts:install   forge install of forge-std and OpenZeppelin at the pinned tags
  npm run test                forge build and forge test (unit, fuzz, invariant) in all five credential states
  npm run preflight           the checks the deploy script makes, run offline first

Read README.md for the golden path. Nothing in this project reads a private key; deploys use
`forge script --account <keystore-name>` or a hardware wallet. Mainnet (151) refuses to deploy
unless ADMIN_SAFE is a Safe 1.4.1 with a threshold of two or more and the deployer passes isAllowed.
```

exit 0, 0.11 s wall.

### Step 5: npm run doctor on the bare scaffold: the machine before the first command (Node, git, forge, anvil, cast, one version, real binaries, slither, aderyn, .env, vendor/)

```
$ npm run doctor
> doctor
> node vendor/redbelly-preflight/dist/doctor-cli.js --project .

redbelly-doctor 0.1.0  project <tmp>/my-app  (scaffold)

pass  node               v22.22.2 (22 or later)
pass  git                2.43.0 at /usr/bin/git
pass  forge              1.7.1 at /usr/local/bin/forge
pass  anvil              1.7.1 at /usr/local/bin/anvil
pass  cast               1.7.1 at /usr/local/bin/cast
pass  foundry-version    forge, anvil and cast are all 1.7.1.
pass  foundry-exit-code  forge, anvil, cast hand back their exit codes (--this-flag-does-not-exist exits non-zero, non-zero, non-zero).
pass  slither            0.11.6 at /usr/local/bin/slither
warn  aderyn             not found on PATH (optional).  Fix: npm install -g @cyfrin/aderyn@0.6.8   # or: cargo install aderyn
pass  env-tracked        not a git repository, so nothing is tracked.
pass  vendor             vendor/ matches the record: redbelly-frontend-kit 0.1.0, redbelly-chains 0.1.0, redbelly-agent-rules 0.1.0, redbelly-preflight 0.1.0.

ok: every required check passed (1 warning, optional). Next: npm run dev in a scaffold, or create-redbelly-dapp my-app --yes to make one.
```

exit 0, 0.89 s wall.

### Step 5: npm install at the project root (web app, vendored packages)

```
$ npm install
added 331 packages, and removed 2 packages in 42s
npm warn deprecated @safe-global/safe-gateway-typescript-sdk@3.23.1: Package no longer supported. Contact Support at https://www.npmjs.com/support for more info.
```

exit 0, 42.63 s wall.

### Step 5: npm run contracts:install (OpenZeppelin from npm, forge-std with forge install --no-git)

```
$ npm run contracts:install
added 1 package, and audited 2 packages in 767ms
    Installed forge-std v1.16.2
```

exit 0, 3.27 s wall.

### Step 6: npm run dev: fork 153, deploy, seed five wallets, start the web app (stdout, the table)

```
$ npm run dev
> dev
> node scripts/dev.mjs

Local loop ready: Anvil chain 31337 (fork of 153 at block 3035539) at http://127.0.0.1:8545
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

exit 0, 17.88 s wall.

What the script logged while it worked (stderr):

```
[dev] anvil --port 8545 --chain-id 31337 --silent --fork-url https://governors.testnet.redbelly.network
[dev] anvil ready, forked 153 at block 3035539 (1.9 s)
[dev] forge build (6.5 s)
[dev] permission gate mocked at 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690; deployer and the five wallets allowed (4.6 s)
[dev] deployed GatedERC20 0x07AF11e412ed7C343603c0F4b35645f7870686Eb with ReceptorMock 0x37cA242a94945CdC3d3F155452a82Af6374bebD7, request id 18 (the deploy script's default) (2.7 s)
[dev] subscriptions opened
[dev] seeded five wallets (1.8 s)
[dev] ready in 17.6 s
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
  "startedAt": "2026-09-14T22:37:34.851Z"
}
```

### Step 6: the web app answers on /eligibility (Next.js dev server, first compile included)

```
$ curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/eligibility
200
```

exit 0, 11.23 s wall.

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

exit 0, 0.77 s wall.

### Step 6: connect wallet 3 (Valid) with no key: the gate shows Eligible

```
$ click Connect on wallet 3
row: 3 connectedValid (passes the gate)0x90F7…b906Disconnect
gate: Eligible
```

exit 0, 0.17 s wall.

### Step 6: flip the connected wallet to Expired: setStatus as the impersonated deployer, the page re-renders without a reload

```
$ click Expired
panel: 0x90F7…b906 is now Expired (block 3035554)
gate: Not eligible for this action
page loads since open: 1
```

exit 0, 4.42 s wall.

### Step 6: and back to Valid

```
$ click Valid
gate: Eligible
page loads since open: 1
browser errors: none
```

exit 0, 0.35 s wall.

### Step 6: break it: wallet 2 (NeverIssued) calls subscribe() and the contract refuses

```
$ cast send --unlocked --from 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC 0x07AF11e412ed7C343603c0F4b35645f7870686Eb "subscribe()" --rpc-url http://127.0.0.1:8545
Error: Failed to estimate gas: server returned an error response: error code 3: execution reverted: custom error 0x879342fb: 0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000012, data: "0x879342fb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000000012": NotEligible(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 18)
```

exit 1, 0.25 s wall.

### Step 6: wallet 3 (Valid) calls subscribe() and it goes through

```
$ cast send --unlocked --from 0x90F79bf6EB2c4f870365E785982E1f101E93b906 0x07AF11e412ed7C343603c0F4b35645f7870686Eb "subscribe()" --rpc-url http://127.0.0.1:8545
blockNumber          3035556
logs                 [{"address":"0x07af11e412ed7c343603c0f4b35645f7870686eb","topics":["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef","0x0000000000000000000000000000000000000000000000000000000000000000","0x00000000000000000000000090f79bf6eb2c4f870365e785982e1f101e93b906"],"data":"0x0000000000000000000000000000000000000000000000056bc75e2d63100000","blockHash":"0x6c15c0dd710ce4033be70552a8e56fb00ff47b3cb4bcaffdc7689d30b2ac2949","blockNumber":"0x2e51a4","blockTimestamp":"0x6aa876d3","transactionHash":"0xdede86ce83a573212126d165ae2b243abb561d0526b244978e1d99c660b6f585","transactionIndex":"0x0","logIndex":"0x0","removed":false},{"address":"0x07af11e412ed7c343603c0f4b35645f7870686eb","topics":["0x4b90d6788928d63c1821907a6a8b95f40d26562d8fe41b105f7489db9966dfcb","0x00000000000000000000000090f79bf6eb2c4f870365e785982e1f101e93b906"],"data":"0x0000000000000000000000000000000000000000000000056bc75e2d63100000","blockHash":"0x6c15c0dd710ce4033be70552a8e56fb00ff47b3cb4bcaffdc7689d30b2ac2949","blockNumber":"0x2e51a4","blockTimestamp":"0x6aa876d3","transactionHash":"0xdede86ce83a573212126d165ae2b243abb561d0526b244978e1d99c660b6f585","transactionIndex":"0x0","logIndex":"0x1","removed":false}]
status               1 (success)
transactionHash      0xdede86ce83a573212126d165ae2b243abb561d0526b244978e1d99c660b6f585
```

exit 0, 0.02 s wall.

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

exit 0, 0.29 s wall.

### Step 6: a second npm run dev while the first runs

```
$ npm run dev
[dev] npm run dev is already running (pid 19334, since 2026-09-14T22:37:34.851Z, Anvil on port 8545). Stop it with Ctrl-C there, or kill 19334.
```

exit 2, 0.09 s wall.

### Step 6: Ctrl-C: Anvil and the web app stop together

```
$ ^C
npm run dev: ended by SIGINT (npm relays Ctrl-C to scripts/dev.mjs, which exits 0; the scaffolder's test/dev.test.mjs asserts that code)
anvil on http://127.0.0.1:8545: stopped
web on http://localhost:3000: stopped
deployments/local.lock: removed
deployments/local.json: kept
```

exit 0, 1.64 s wall.

### Step 7: the rules files have not drifted

```
$ npm run rules:check
ok       CLAUDE.md
ok       AGENTS.md
ok       .cursor/rules/redbelly.mdc
ok       .github/copilot-instructions.md
ok       GEMINI.md
```

exit 0, 0.22 s wall.

### Step 8: forge build (already compiled by npm run dev; a no-op here)

```
$ cd contracts && forge build
No files changed, compilation skipped
```

exit 0, 0.10 s wall.

### Step 8: forge test: every gated function in five states, fuzz and invariants

```
$ npm test
Ran 7 tests for test/AdminPattern.t.sol:AdminPatternTest
Suite result: ok. 7 passed; 0 failed; 0 skipped; finished in 2.46ms (1.10ms CPU time)
Ran 12 tests for test/DeployPreflight.t.sol:DeployPreflightTest
Suite result: ok. 12 passed; 0 failed; 0 skipped; finished in 5.50ms (4.62ms CPU time)
Ran 21 tests for test/GatedERC20.t.sol:GatedERC20Test
Suite result: ok. 21 passed; 0 failed; 0 skipped; finished in 6.66ms (5.32ms CPU time)
Ran 7 tests for test/IssuerRegistry.t.sol:IssuerRegistryTest
Suite result: ok. 7 passed; 0 failed; 0 skipped; finished in 258.85ms (258.51ms CPU time)
Ran 4 tests for test/GatedERC20.fuzz.t.sol:GatedERC20FuzzTest
Suite result: ok. 4 passed; 0 failed; 0 skipped; finished in 433.06ms (555.33ms CPU time)
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
Suite result: ok. 6 passed; 0 failed; 0 skipped; finished in 2.23s (2.90s CPU time)
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
Suite result: ok. 6 passed; 0 failed; 0 skipped; finished in 2.10s (3.15s CPU time)
╭---------------------------------+--------+--------+---------╮
╰---------------------------------+--------+--------+---------╯
```

exit 0, 2.38 s wall.

### Step 8: forge fmt --check

```
$ cd contracts && forge fmt --check src script test

```

exit 0, 0.03 s wall.

### Step 9: Slither through the scaffold script (writes the report and the sources hash)

```
$ npm run lint:slither
wrote contracts/reports/slither.json and contracts/reports/slither.sources.sha256
. analyzed (17 contracts with 81 detectors), 3 result(s) found
```

exit 0, 1.70 s wall.

### Step 9: the scaffold pre-flight, read-only against the real testnet with a public address

```
$ DEPLOYER=0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 npm run preflight
> preflight
> node scripts/preflight.mjs

pre-flight for chain 153 (Redbelly Network Testnet)

ok   chain id is a Redbelly network
ok   foundry.toml pins solc 0.8.30 and prague
ok   no .env or keystore is tracked by git
ok   no .env ever committed in history
ok   no 64-hex-character value (a private key shape) in tracked files
ok   DEPLOYER is a public address
note ADMIN_SAFE is empty: the deployer will hold admin roles on testnet. Put a Safe there before mainnet.
ok   RPC reports the configured chain id: https://governors.testnet.redbelly.network says 153
ok   deployer passes permission.isAllowed
ok   deployer holds at least 1 RBNT: 380.528661255879942432 RBNT

9 of 9 checks passed.
Pre-flight clear. Sign with `forge script ... --account <keystore-name>`; no key is read here.
```

exit 0, 1.24 s wall.

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
fail  balance            0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 holds 380.5286 RBNT but 3,000,000 gas needs 757.9432 RBNT with 25% margin (US$1.4286 at the feed price); get testnet RBNT at https://redbelly.faucetme.pro/.
pass  slither-report     reports/slither.json describes the current sources: reports/slither.sources.sha256 matches the hash of 2 .sol file(s) under src.

not ok: 1 check failed. Do not deploy.
```

exit 1, 1.60 s wall.

### Step 9: the mainnet refusal, rehearsed offline

```
$ npm run preflight -- --chain 151 --offline
> preflight
> node scripts/preflight.mjs --chain 151 --offline

pre-flight for chain 151 (Redbelly Network Mainnet)

ok   chain id is a Redbelly network
ok   foundry.toml pins solc 0.8.30 and prague
ok   no .env or keystore is tracked by git
ok   no .env ever committed in history
ok   no 64-hex-character value (a private key shape) in tracked files
FAIL DEPLOYER is a public address: set DEPLOYER in .env to the wallet you sign with
FAIL ADMIN_SAFE is set (mainnet refuses without a Safe)
FAIL VERIFIER is set (mainnet never deploys a mock verifier)

(offline: chain id, isAllowed, Safe and balance checks skipped)

5 of 8 checks passed.
Mainnet deploy would be refused. Fix the failures above; the deploy script checks the same things.
```

exit 1, 0.24 s wall.

### Step 9: the gas report in RBNT and US cents, read-only against the real testnet (the snapshot forge test wrote, one row per test; --report prices each function)

```
$ npm run snapshot && npm run gas -- --chain 153
redbelly gas 0.1.0  project <tmp>/my-app/contracts  source .gas-snapshot (51 rows, one per test)
chain 153 (testnet) via https://governors.testnet.redbelly.network  block 3,035,539  base fee 202,118.20 gwei  RBNT US$0.002356 (feed at 2026-09-14T22:31:00.000Z)

Item                                                                              Gas          RBNT    US cents
AdminPatternTest:test_delayCannotBeShortenedWithoutTheTimelock()               11,377      2.299499       0.541
AdminPatternTest:test_deployerHoldsNothing()                                   49,204      9.945024       2.343
AdminPatternTest:test_emergencyPath_pauseIsImmediate_unpauseWaits()            90,281     18.247433       4.299
AdminPatternTest:test_slowPath_cancelBeforeExecution()                         50,484     10.203735       2.403
AdminPatternTest:test_slowPath_roleGrant_thenOperationalRoleActsAtOnce()      274,504     55.482254      13.071
AdminPatternTest:test_slowPath_verifierChangeGoesThroughTheTimelock()          78,469     15.860013       3.736
AdminPatternTest:test_strangerCanDoNothing()                                   24,343      4.920163       1.159
DeployPreflightTest:test_mainnet_accepts_safe_with_threshold_two_and_ve…      327,937     66.282036      15.616
DeployPreflightTest:test_mainnet_refuses_eoa_admin()                           62,840     12.701108       2.992
DeployPreflightTest:test_mainnet_refuses_threshold_one()                      255,408     51.622605      12.162
DeployPreflightTest:test_mainnet_refuses_unverified_deployer()                231,045     46.698399      11.002
DeployPreflightTest:test_mainnet_refuses_without_admin_safe()                  55,322     11.181583       2.634
DeployPreflightTest:test_mainnet_refuses_without_todays_ship_report()         326,978     66.088204      15.570
DeployPreflightTest:test_mainnet_refuses_wrong_version_or_singleton()         468,973     94.787978      22.332
DeployPreflightTest:test_other_chain_skips_identity()                          20,254      4.093702       0.964
DeployPreflightTest:test_redbelly_refuses_when_registry_missing()              17,618      3.560918       0.838
DeployPreflightTest:test_ship_report_path_is_todays_utc_date()                 41,704      8.429137       1.985
DeployPreflightTest:test_testnet_allows_eoa_admin_but_still_checks_iden…       82,488     16.672326       3.927
DeployPreflightTest:test_testnet_warns_without_ship_report_and_accepts_…      141,406     28.580726       6.733
GatedERC20FuzzTest:testFuzz_distribute_mintsExactlyTheEligibleSubset(ui…      335,592     67.829251      15.980
GatedERC20FuzzTest:testFuzz_forceTransfer_needsHashAndEligibleRecipient…      170,342     34.429218       8.111
GatedERC20FuzzTest:testFuzz_subscribe_onlyValidOnce(address,uint8)             70,143     14.177177       3.340
GatedERC20FuzzTest:testFuzz_transfer_requiresBothValid(address,address,…      168,949     34.147668       8.045
GatedERC20Test:test_burn_revertsInAllInvalidStates()                          194,226     39.256609       9.248
GatedERC20Test:test_canTransfer_mirrorsTheGate()                              203,110     41.052227       9.671
GatedERC20Test:test_distribute_everyoneIneligibleMintsNothingButStillNe…       54,157     10.946115       2.578
GatedERC20Test:test_distribute_lengthMismatch()                                12,601      2.546891       0.600
GatedERC20Test:test_distribute_skipsIneligibleAndRecordsDenial()              204,128     41.257984       9.720
GatedERC20Test:test_forceTransfer_doesNotLeakTheForcingFlag()                 197,058     39.829008       9.383
GatedERC20Test:test_forceTransfer_movesFromRevokedHolder_withJustificat…      188,560     38.111408       8.979
GatedERC20Test:test_forceTransfer_recipientRevertsInAllInvalidStates()        237,649     48.033188      11.316
GatedERC20Test:test_forceTransfer_requiresJustification_andRole()             168,052     33.966368       8.002
GatedERC20Test:test_mint_needsAnActiveIssuer()                                 64,009     12.937384       3.048
GatedERC20Test:test_mint_revertsForIneligibleRecipient()                      177,294     35.834344       8.442
GatedERC20Test:test_pause_blocksEverythingButUnpause_andRolesSplit()          271,102     54.794648      12.909
GatedERC20Test:test_requestIdChange_movesTheGate()                            169,268     34.212143       8.060
GatedERC20Test:test_roles_fallBackToAdmin()                                 1,743,385    352.369836      83.018
GatedERC20Test:test_roles_separatedWhenGiven()                                 33,617      6.794607       1.600
GatedERC20Test:test_setVerifierAndRequestId_onlyAdmin()                        40,959      8.278559       1.950
GatedERC20Test:test_subscribe_revertsInAllInvalidStates()                     181,420     36.668284       8.639
GatedERC20Test:test_subscribe_valid_once_and_closed()                         177,450     35.865874       8.449
GatedERC20Test:test_transferFrom_checksRealPartiesNotTheSpender()             322,456     65.174226      15.355
GatedERC20Test:test_transfer_bothPartiesInAllFiveStates()                     351,635     71.071833      16.744
GatedERC20Test:test_zeroAdminRefused()                                        119,201     24.092691       5.676
IssuerRegistryTest:testFuzz_mintsNeverExceedAllowanceInsideWindow(uint6…      241,918     48.896030      11.519
IssuerRegistryTest:test_allowanceIsSpentAndBounded()                          177,976     35.972189       8.475
IssuerRegistryTest:test_beforeWindow_insideWindow_afterWindow()               176,625     35.699127       8.410
IssuerRegistryTest:test_onlyIssuerAdminSets()                                  24,313      4.914100       1.157
IssuerRegistryTest:test_replacingResetsMinted_andRevokeStops()                136,936     27.677258       6.520
IssuerRegistryTest:test_windowValidation()                                     34,857      7.045234       1.659
IssuerRegistryTest:test_zeroValidFromMeansNow_andEventCarriesIt()              81,901     16.553683       3.900

Gas is priced in US dollars and converted to RBNT at execution from the feed, so the cents column is the stable one; the RBNT column moves with the price. Base fee only: the chain charges no priority fee.
```

exit 0, 9.60 s wall.

### Step 11: Routescan verification dry run: the standard JSON input forge would send for the token the local loop deployed

```
$ cd contracts && forge verify-contract 0x07AF11e412ed7C343603c0F4b35645f7870686Eb src/GatedERC20.sol:GatedERC20 --verifier-url 'https://api.routescan.io/v2/network/testnet/evm/153/etherscan' --etherscan-api-key verifyContract --compiler-version 0.8.30 --evm-version prague --num-of-optimizations 200 --constructor-args $(cast abi-encode "constructor(string,string,(address,address,address,address),address,uint64,uint256)" "Gated Token" GTOK "(<admin>,<admin>,<admin>,<admin>)" <verifier> 18 100000000000000000000) --show-standard-json-input | wc -c
66741
```

exit 0, 0.72 s wall.

## Timings

Every row is a measured wall time from this run. The total is the whole script, waiting included.

| Step | Wall time | Exit |
|---|---|---|
| Step 1: the isAllowed read against the real testnet RPC (read-only), the known allowed address | 2.4 s | 0 |
| Step 1: the same read for the zero address | 1.4 s | 0 |
| Step 3: the toolchain (Foundry from the @foundry-rs npm packages); the keystore import is not run, no key here | 0.0 s | 0 |
| Step 4: scaffold with the defaults | 0.1 s | 0 |
| Step 5: npm run doctor on the bare scaffold: the machine before the first command (Node, git, forge, anvil, cast, one version, real binaries, slither, aderyn, .env, vendor/) | 0.9 s | 0 |
| Step 5: npm install at the project root (web app, vendored packages) | 42.6 s | 0 |
| Step 5: npm run contracts:install (OpenZeppelin from npm, forge-std with forge install --no-git) | 3.3 s | 0 |
| Step 6: npm run dev: fork 153, deploy, seed five wallets, start the web app (stdout, the table) | 17.9 s | 0 |
| Step 6: the web app answers on /eligibility (Next.js dev server, first compile included) | 11.2 s | 0 |
| Step 6: the dev state panel on /eligibility (browser): five wallets in enum order | 0.8 s | 0 |
| Step 6: connect wallet 3 (Valid) with no key: the gate shows Eligible | 0.2 s | 0 |
| Step 6: flip the connected wallet to Expired: setStatus as the impersonated deployer, the page re-renders without a reload | 4.4 s | 0 |
| Step 6: and back to Valid | 0.3 s | 0 |
| Step 6: break it: wallet 2 (NeverIssued) calls subscribe() and the contract refuses | 0.2 s | 1 |
| Step 6: wallet 3 (Valid) calls subscribe() and it goes through | 0.0 s | 0 |
| Step 6: its balance afterwards | 0.0 s | 0 |
| Step 6: the same flip from the shell: wallet 4 (Expired) to Valid, as the table's footer says | 0.3 s | 0 |
| Step 6: a second npm run dev while the first runs | 0.1 s | 2 |
| Step 6: Ctrl-C: Anvil and the web app stop together | 1.6 s | 0 |
| Step 7: the rules files have not drifted | 0.2 s | 0 |
| Step 8: forge build (already compiled by npm run dev; a no-op here) | 0.1 s | 0 |
| Step 8: forge test: every gated function in five states, fuzz and invariants | 2.4 s | 0 |
| Step 8: forge fmt --check | 0.0 s | 0 |
| Step 9: Slither through the scaffold script (writes the report and the sources hash) | 1.7 s | 0 |
| Step 9: the scaffold pre-flight, read-only against the real testnet with a public address | 1.2 s | 0 |
| Step 9: redbelly-preflight, the seven-check CLI, read-only against the real testnet from contracts/ | 1.6 s | 1 |
| Step 9: the mainnet refusal, rehearsed offline | 0.2 s | 1 |
| Step 9: the gas report in RBNT and US cents, read-only against the real testnet (the snapshot forge test wrote, one row per test; --report prices each function) | 9.6 s | 0 |
| Step 11: Routescan verification dry run: the standard JSON input forge would send for the token the local loop deployed | 0.7 s | 0 |
| **Total, start to end** | **1 min 47 s** | |

`npm run dev` alone, from the command to the table: 17.9 s. The web app's first compile after that: 11.2 s. The panel run: connect, Expired, Valid, no reload, 0 browser errors.

Previous run (12 September 2026, `golden-path-foundry.md`): nineteen minutes wall including two scaffolder fixes; its scaffold-to-fork-deploy tool time was under three minutes across six commands in two shells.

## What did not run

The keystore import (no key in any recorded session), the deploy to the real testnet and the Routescan submission (wallet-signed, not made yet), and the real network's error to an unverified wallet (a fork and a local Anvil do not enforce the node-level permission map). The page marks each as pending.

Finished 2026-09-14T22:38:30.072Z (1 min 47 s).
