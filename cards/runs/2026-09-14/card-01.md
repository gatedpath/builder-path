# Card 1, Change the gate: run of 2026-09-14

## Verdict

Verified, with the switcher. The result compiles, `forge fmt --check` is clean, the five-state tests pass (60 tests in seven suites, unchanged in number), Slither finds nothing new (17 contracts, the three low `timestamp` notes on `IssuerRegistry` that the contract kit triaged), and `npm run dev` with no flag bound the contract to 708: the dev state panel connected wallet 3, the gate read Eligible for request id 708, one press of Revoked put the wallet in that state on the mock and the gate read "Not eligible for this action" without a page load. Wall time 38 s from the first edit to the last pre-flight line. `redbelly-preflight` passed six of its seven checks and failed the balance check, which is about the wallet, not the code: the public stand-in address holds 380.5 RBNT and the CLI wants 768.4 RBNT for a 3,000,000-gas deploy at that moment's feed price, or 486.4 RBNT for the deploy's measured 1,899,210 gas. The same address passed that check on a fork on 12 September at 90.6 RBNT; fork fees did not follow the oracle then, and today's fork read did. The card's wording changed on 14 September, before this run; see the end.

Agent: Claude Code (this session), following the prompt exactly as written on the card, with the scaffold's own `CLAUDE.md` rules file loaded. A second agent has not run this card yet.
Scaffold: a fresh `create-redbelly-dapp --yes` gated-erc20 project (scaffolder at commit a272887, the state `packages/create-redbelly-dapp/reports/golden-path-dev-2026-09-14.md` leaves it in), installed, in its own git repository so the diff is exact.
Tools: Foundry 1.7.1 (forge, cast, Anvil as the local loop's chain 31337 forked from testnet, and a second Anvil fork with chain id 153 for pre-flight), Chromium through Playwright for the panel, Slither 0.11.6, `redbelly-preflight` 0.1.0, git. No key, no wallet, nothing sent to a real network; the forks only read it.

## The prompt, as written on the card

> Switch the gated function from the over-18 recipe (request id 18) to the AU wholesale investor recipe (708). Keep everything else. Run the five-state tests, then run npm run dev and use the dev state panel to show wallet 3 passing the 708 gate and failing it once it is Revoked. Show me the diff.

## What the agent did

Read `contracts/src/GatedERC20.sol`, the deploy scripts, the tests, `scripts/dev.mjs` and `recipes/`. As on 12 September, the gate is `Gated(verifier, requestId)` and which recipe it enforces is the request id the deploy binds: 18 for over-18, 708 for the AU wholesale investor recipe. Nothing in the contract body names a recipe, so the swap is the deploy script's default, the Hardhat deploy script's default, `.env.example`, the README's two mentions (the `npm run dev` example and the `setStatus` line), and one comment on the contract saying what it is bound to. Five files. The kit's unit test keeps its own arbitrary id (`REQUEST = 1`) on purpose: it proves the gate for any id, and the invariant and fuzz suites do the same.

Then the switcher, as the prompt asks. `npm run dev` with no `--request-id`: the scaffold's script reads `REQUEST_ID` from `.env` when there is one, then falls back to the deploy script's own default, and reads the bound id back from the contract, so the table and the record said 708 without a flag (`cast call requestId()` agreed). On `/eligibility` the panel listed the five wallets; Connect on wallet 3 (Valid for 708, seeded by the script) made the gate read Eligible; Revoked sent `setStatus(wallet 3, 708, Revoked)` as the impersonated deployer, the panel reported the block, the mock read 3 (Revoked) for 708, and the gate re-rendered to "Not eligible for this action" with one page load since the tab opened and no browser errors. The screenshot is `card-01-panel.png` beside this file. Ctrl-C stopped Anvil and the web app; the lock was removed.

One thing did not go to plan, on a first attempt that is not this transcript: the baseline commit of that attempt had been made after `npm run lint:slither`, so it carried `contracts/reports/slither.sources.sha256`, a bare 64-hex value, and `redbelly-preflight`'s git-secrets check refused the repository for it. That is a scaffolder gap, not the card's: the template's `.gitignore` ignored two older report paths but not `contracts/reports/`. Fixed the same day (the folder is ignored now), and this transcript is the run on a fresh scaffold from the fixed template.

## Transcript

### The diff

```
$ git add -A && git diff --cached --stat -- .env.example README.md contracts/script/Deploy.s.sol contracts/src/GatedERC20.sol hardhat/scripts/deploy.ts
.env.example                  |  6 +++---
 README.md                     | 10 +++++-----
 contracts/script/Deploy.s.sol |  6 +++---
 contracts/src/GatedERC20.sol  |  1 +
 hardhat/scripts/deploy.ts     |  2 +-
 5 files changed, 13 insertions(+), 12 deletions(-)
```

exit 0, 0.02 s wall. (`git add -A` also staged the two `package-lock.json` files `npm install` had written after the baseline commit; they are install output, not the card's change, and are left out of the diff below.)

### The diff, in full

```
$ git diff --cached -- .env.example README.md contracts/script/Deploy.s.sol contracts/src/GatedERC20.sol hardhat/scripts/deploy.ts
diff --git a/.env.example b/.env.example
index ea1a35d..382b6ba 100644
--- a/.env.example
+++ b/.env.example
@@ -10,9 +10,9 @@ ADMIN_SAFE=
 # child). Required on 151. Leave empty on 153 to deploy a ReceptorMock for the first run.
 VERIFIER=
 
-# The eligibility request id your verifier answers for. 18 is the over-18 recipe
-# (recipes/over-18/), 708 the AU wholesale investor recipe; any uint64 works on the mock.
-REQUEST_ID=18
+# The eligibility request id your verifier answers for. 708 is the AU wholesale investor
+# recipe (recipes/au-wholesale-investor/), 18 the over-18 recipe; any uint64 works on the mock.
+REQUEST_ID=708
 
 # Public address of the wallet you deploy from, used by `npm run preflight` to check
 # permission.isAllowed and the RBNT balance before you sign anything.
diff --git a/README.md b/README.md
index 5f068c0..7ff01db 100644
--- a/README.md
+++ b/README.md
@@ -42,12 +42,12 @@ command beside each. Ctrl-C stops everything.
 ```
 npm run dev                          # after npm install and npm run contracts:install
 npm run dev -- --no-fork             # plain Anvil, offline
-npm run dev -- --request-id 708      # the AU wholesale investor recipe instead of over-18
+npm run dev -- --request-id 18       # the over-18 recipe instead of AU wholesale investor
 npm run dev -- --json                # the table as JSON, for an agent
 ```
 
 Flags: `--chain 153|151` (151 forks mainnet read-only and warns), `--port 8545`, `--web-port 3000`,
-`--no-web`, `--no-fork`, `--request-id 18` (without the flag, `REQUEST_ID` in `.env` wins, then the
+`--no-web`, `--no-fork`, `--request-id 708` (without the flag, `REQUEST_ID` in `.env` wins, then the
 deploy script's own default; the id is read back from the contract either way), `--json`. Exit codes: 0 running, 1 a step failed (which
 one and why on stderr), 2 already running, 3 `forge` or `anvil` missing. It writes
 `deployments/local.json` (chain id, fork source, verifier, contract, request id, the deployer and
@@ -111,9 +111,9 @@ https://access.redbelly.network, fund it from https://redbelly.faucetme.pro/, th
 | `cd contracts && forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account deployer --broadcast` | `cd hardhat && npm run keystore:set` once, then `npm run deploy:testnet` |
 
 Without `VERIFIER` set, the script deploys a `ReceptorMock` as the verifier and says so in
-capitals. Every wallet starts ineligible on it; call `setStatus(wallet, 18, Valid)` from the
-deployer to let a test wallet through (18 is the request id of the over-18 recipe, the default
-`REQUEST_ID`; the AU wholesale investor recipe is 708). Replace it with your own verifier (a
+capitals. Every wallet starts ineligible on it; call `setStatus(wallet, 708, Valid)` from the
+deployer to let a test wallet through (708 is the request id of the AU wholesale investor recipe,
+the default `REQUEST_ID`; the over-18 recipe is 18). Replace it with your own verifier (a
 `ZKPVerifier` or `VCVerifierBaseContract` child, see docs.redbelly.network) before anything
 real. The deployment record lands in `contracts/deployments/153-GatedERC20.json`.
 
diff --git a/contracts/script/Deploy.s.sol b/contracts/script/Deploy.s.sol
index 6e9fb0e..d6a7ca1 100644
--- a/contracts/script/Deploy.s.sol
+++ b/contracts/script/Deploy.s.sol
@@ -15,8 +15,8 @@ import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";
 ///   VERIFIER     Your dApp's verifier contract. Required on 151. On 153 and local chains a
 ///                ReceptorMock is deployed when unset, so the first deploy works before you
 ///                have a real verifier; the log says so in capitals.
-///   REQUEST_ID   The eligibility request id your verifier answers for. Default 18, the
-///                over-18 recipe (recipes/over-18); the AU wholesale recipe is 708.
+///   REQUEST_ID   The eligibility request id your verifier answers for. Default 708, the
+///                AU wholesale investor recipe (recipes/au-wholesale-investor); over-18 is 18.
 ///
 /// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
 ///   forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
@@ -26,7 +26,7 @@ contract Deploy is RedbellyDeployScript {
         Preflight memory p = preflight();
 
         address verifier = optionalEnvAddress("VERIFIER");
-        uint64 requestId = uint64(vm.envOr("REQUEST_ID", uint256(18)));
+        uint64 requestId = uint64(vm.envOr("REQUEST_ID", uint256(708)));
         if (verifier == address(0)) {
             if (p.chainId == Redbelly.MAINNET_CHAIN_ID) {
                 revert("VERIFIER is not set; mainnet never deploys a mock verifier");
diff --git a/contracts/src/GatedERC20.sol b/contracts/src/GatedERC20.sol
index 13602e0..a8f3743 100644
--- a/contracts/src/GatedERC20.sol
+++ b/contracts/src/GatedERC20.sol
@@ -29,6 +29,7 @@ import { IssuerRegistry } from "./IssuerRegistry.sol";
 /// reverting the whole batch, and records each skip with `Gated._recordDenial`, so the
 /// `EligibilityDenied` event is on the log. That matters on Redbelly: the governors RPC serves
 /// no trace methods, so the reason for a reverted transaction is gone once it is mined.
+/// Bound at deploy time to request id 708, the AU wholesale investor recipe (recipes/au-wholesale-investor).
 contract GatedERC20 is ERC20, ERC20Pausable, AccessControl, IssuerRegistry, Gated {
     /// @notice May move tokens out of any wallet with a justification hash.
     bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
diff --git a/hardhat/scripts/deploy.ts b/hardhat/scripts/deploy.ts
index 717915b..7791a10 100644
--- a/hardhat/scripts/deploy.ts
+++ b/hardhat/scripts/deploy.ts
@@ -59,7 +59,7 @@ async function main() {
   }
 
   let verifier = process.env.VERIFIER ? getAddress(process.env.VERIFIER) : undefined;
-  const requestId = BigInt(process.env.REQUEST_ID ?? "18"); // 18 = the over-18 recipe (recipes/over-18); AU wholesale is 708
+  const requestId = BigInt(process.env.REQUEST_ID ?? "708"); // 708 = the AU wholesale investor recipe (recipes/au-wholesale-investor); over-18 is 18
   if (!verifier) {
     if (chainId === MAINNET) throw new Error("VERIFIER is not set; mainnet never deploys a mock verifier");
     console.log("VERIFIER not set: DEPLOYING RECEPTOR MOCK. Every wallet starts ineligible; setStatus() decides. Not for mainnet.");
```

exit 0, 0.01 s wall.

### forge fmt --check

```
$ cd contracts && forge fmt --check src script test

```

exit 0, 0.02 s wall.

### forge test (five-state tests in GatedERC20Test; the registry, admin, fuzz and invariant suites run too)

```
$ cd contracts && forge test --summary
Ran 9 tests for test/DeployPreflight.t.sol:DeployPreflightTest
Suite result: ok. 9 passed; 0 failed; 0 skipped; finished in 1.95ms (1.14ms CPU time)
Ran 7 tests for test/AdminPattern.t.sol:AdminPatternTest
Suite result: ok. 7 passed; 0 failed; 0 skipped; finished in 2.04ms (818.19µs CPU time)
Ran 21 tests for test/GatedERC20.t.sol:GatedERC20Test
Suite result: ok. 21 passed; 0 failed; 0 skipped; finished in 4.92ms (3.93ms CPU time)
Ran 7 tests for test/IssuerRegistry.t.sol:IssuerRegistryTest
Suite result: ok. 7 passed; 0 failed; 0 skipped; finished in 168.53ms (167.65ms CPU time)
Ran 4 tests for test/GatedERC20.fuzz.t.sol:GatedERC20FuzzTest
Suite result: ok. 4 passed; 0 failed; 0 skipped; finished in 285.70ms (375.42ms CPU time)
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
Suite result: ok. 6 passed; 0 failed; 0 skipped; finished in 1.38s (1.81s CPU time)
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
Suite result: ok. 6 passed; 0 failed; 0 skipped; finished in 1.28s (2.10s CPU time)
╭---------------------------------+--------+--------+---------╮
╰---------------------------------+--------+--------+---------╯
```

exit 0, 5.50 s wall.

### npm run dev (no --request-id: the deploy script's default, now 708, is the bound id)

```
$ npm run dev -- --port 32861 --web-port 41409
> dev
> node scripts/dev.mjs --port 32861 --web-port 41409

Local loop ready: Anvil chain 31337 (fork of 153 at block 3035491) at http://127.0.0.1:32861
GatedERC20 0x07AF11e412ed7C343603c0F4b35645f7870686Eb   verifier (ReceptorMock) 0x37cA242a94945CdC3d3F155452a82Af6374bebD7   request id 708
deployer and admin: Anvil account 7 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 (accounts 0 and 1 are never used)

Wallet  State              Address                                     Impersonate (cast)
------  -----------------  ------------------------------------------  -------------------------------------------------------------------------------------------------------------
2       NeverIssued        0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC  cast rpc anvil_impersonateAccount 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC --rpc-url http://127.0.0.1:32861
3       Valid              0x90F79bf6EB2c4f870365E785982E1f101E93b906  cast rpc anvil_impersonateAccount 0x90F79bf6EB2c4f870365E785982E1f101E93b906 --rpc-url http://127.0.0.1:32861
4       Expired            0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65  cast rpc anvil_impersonateAccount 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 --rpc-url http://127.0.0.1:32861
5       Revoked            0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc  cast rpc anvil_impersonateAccount 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc --rpc-url http://127.0.0.1:32861
6       WrongJurisdiction  0x976EA74026E726554dB657fA54763abd0C3a0aa9  cast rpc anvil_impersonateAccount 0x976EA74026E726554dB657fA54763abd0C3a0aa9 --rpc-url http://127.0.0.1:32861

States are per request id 708; change one with: cast send 0x37cA242a94945CdC3d3F155452a82Af6374bebD7 "setStatus(address,uint64,uint8)" <wallet> 708 <0-4> --unlocked --from 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 --rpc-url http://127.0.0.1:32861
Record: deployments/local.json (account indices, never a key). Web app with the dev state panel: http://localhost:41409
Ctrl-C stops Anvil and the web app.


[dev] anvil --port 32861 --chain-id 31337 --silent --fork-url https://governors.testnet.redbelly.network
[dev] anvil ready, forked 153 at block 3035491 (2.3 s)
[dev] forge build (0.9 s)
[dev] permission gate mocked at 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690; deployer and the five wallets allowed (4.9 s)
[dev] deployed GatedERC20 0x07AF11e412ed7C343603c0F4b35645f7870686Eb with ReceptorMock 0x37cA242a94945CdC3d3F155452a82Af6374bebD7, request id 708 (the deploy script's default) (2.8 s)
[dev] subscriptions opened
[dev] seeded five wallets (1.9 s)
[dev] ready in 12.8 s
```

exit 0, 13.07 s wall.

### The bound request id, read from the contract

```
$ cast call 0x07AF11e412ed7C343603c0F4b35645f7870686Eb "requestId()(uint64)" --rpc-url http://127.0.0.1:32861
708
```

exit 0, 0.08 s wall.

### The dev state panel on /eligibility (browser)

```
$ open http://localhost:41409/eligibility
panel: Dev state Anvil chain 31337, fork of 153, request id 708. Dev server only; never on 151 or 153.
rows: 5
```

exit 0, 0.50 s wall.

### Connect wallet 3 (Valid for 708): the gate shows Eligible

```
$ click Connect on wallet 3
row: 3 connectedValid (passes the gate)0x90F7…b906Disconnect
gate: Eligible
```

exit 0, 0.14 s wall.

### Press Revoked: setStatus(wallet 3, 708, Revoked) as the impersonated deployer; the gate follows without a reload

```
$ click Revoked
panel: 0x90F7…b906 is now Revoked (block 3035506)
gate: Not eligible for this actionYour wallet is verified on the network, but it does not hold an accepted proof for this action (request id 708 on GatedERC20). The contract would refuse the transaction, so the button stays off.The check is on-chain and the answer is a plain yes or no; the app cannot tell whether a credential is missing, expired or revoked. Your identity wallet can.
page loads since open: 1
browser errors: none
```

exit 0, 4.35 s wall.

### The mock agrees: wallet 3 reads Revoked (3) for 708

```
$ cast call 0x37cA242a94945CdC3d3F155452a82Af6374bebD7 "eligibilityStatus(address,uint64)(uint8)" 0x90F79bf6EB2c4f870365E785982E1f101E93b906 708 --rpc-url http://127.0.0.1:32861
3
```

exit 0, 0.06 s wall.

### Ctrl-C

```
$ ^C
anvil: stopped
lock: removed
```

exit 0, 0.10 s wall.

### Slither through the scaffold's lint:slither (writes the JSON report and the sources hash pre-flight compares)

```
$ npm run lint:slither
wrote contracts/reports/slither.json and contracts/reports/slither.sources.sha256
. analyzed (17 contracts with 81 detectors), 3 result(s) found
```

exit 0, 1.18 s wall.

### redbelly-preflight, read-only, against a testnet fork (chain id 153)

```
$ cd contracts && redbelly-preflight --chain 153 --rpc http://127.0.0.1:39849 --address 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
redbelly-preflight 0.1.0  project <tmp>/card-01/contracts
chain 153 (testnet) via http://127.0.0.1:39849  deployer 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76

pass  chain-id           --chain says chain 153 and the RPC reports 153.
pass  deployer-verified  0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 (--address) passes permission.isAllowed on chain 153.
skip  admin-safe         No admin given; pass --admin <0x…> with the address that will own the deployed contracts.
pass  compiler-pins      <tmp>/card-01/contracts/foundry.toml (profile default) pins solc 0.8.30 and EVM prague.
pass  git-secrets        No secret-shaped line added in 1 commits, and no .env file is tracked.
fail  balance            0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 holds 380.5286 RBNT but 3,000,000 gas needs 768.3796 RBNT with 25% margin (US$1.4286 at the feed price); get testnet RBNT at https://redbelly.faucetme.pro/.
pass  slither-report     reports/slither.json describes the current sources: reports/slither.sources.sha256 matches the hash of 2 .sol file(s) under src.

not ok: 1 check failed. Do not deploy.
```

exit 1, 4.00 s wall.

### The deploy's measured gas on the local loop (contracts/broadcast/Deploy.s.sol/31337/run-latest.json)

```
$ jq the receipts
ReceptorMock: 702,804 gas
GatedERC20: 1,899,210 gas
```

exit 0, 0.00 s wall.

### redbelly-preflight again with the measured deploy gas

```
$ cd contracts && redbelly-preflight --chain 153 --rpc http://127.0.0.1:39849 --address 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 --gas 1899210
fail  balance            0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 holds 380.5286 RBNT but 1,899,210 gas needs 486.4380 RBNT with 25% margin (US$0.9044 at the feed price); get testnet RBNT at https://redbelly.faucetme.pro/.
not ok: 1 check failed. Do not deploy.
```

exit 1, 0.20 s wall.

Total wall time from the first edit to the last pre-flight line: 0 min 38 s.

## Wording change

The card said, until 14 September: "Switch the gated function from the over-18 recipe (request id 18) to the AU wholesale investor recipe (708). Keep everything else. Run the five-state tests and show me the diff." Wave 6 gave every scaffold `npm run dev` and the dev state panel (PLAN.md 18.1, "card 1 gains the switcher"), so the card now also asks the agent to prove the swap with it: "...Run the five-state tests, then run npm run dev and use the dev state panel to show wallet 3 passing the 708 gate and failing it once it is Revoked. Show me the diff." The change is in `site/src/data/cards.ts` and in PLAN.md section 16's log; the 12 September run and wording stay in `cards/runs/2026-09-12/card-01.md` as history.
