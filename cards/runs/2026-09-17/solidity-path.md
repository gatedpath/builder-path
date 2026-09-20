# The "Writing Solidity" tutorials: runs of 2026-09-17

Every command and count on `/solidity/*` comes from these runs, on the owner's Mac, Node v24.20.0,
Foundry 1.7.1, solc 0.8.30, EVM Prague. Nothing was signed, broadcast or sent; the two `forge script`
runs had no `--broadcast` and no `--account`, so they simulated with Foundry's default sender.

| Tutorial | Command | Result |
|---|---|---|
| 1 and 2 | `cd packages/receptor-mock && npm run setup` | forge-std 1.16.2, openzeppelin 5.6.1 |
| 1 | `forge test --match-contract GatedCounterTest` | `Suite result: ok. 9 passed; 0 failed; 0 skipped` |
| 1 | `forge test` | 34 passed, 0 failed, 1 skipped, 5 suites (the skipped test needs a live fork) |
| 1, step 5 | a 20-line `GuestBook` written beside `GatedCounter.sol` (`sign(string)` under `gated`), `forge build` | `Compiler run successful!`; file removed afterwards |
| 1, step 5 | the same with `_authorizeVerifierChange` deleted | `Error (3656): Contract "GuestBook" should be marked as abstract.`, pointing at `function _authorizeVerifierChange() internal virtual;` |
| 2 | `forge test --match-test test_incrementAcrossAllFiveStates` | `1 tests passed` |
| 3 | `cd packages/contract-kit && npm run setup && forge test` | 51 tests passed, 0 failed, 6 suites |
| 3 | `forge test --match-path test/GatedERC20.invariants.t.sol` | 12 passed in 2 suites, each `runs: 64, calls: 2048, reverts: 0` |
| 3 | `forge test --match-test test_forceTransfer` | 4 passed |
| 3, step 2 | observed while writing `WholesaleGate.t.sol` (see `card-01-solidity.md`) | a revoked wallet that already subscribed reverts `NotEligible`, not `AlreadySubscribed`: modifiers run first |
| 4 | in a fresh scaffold, `cd contracts && forge script script/Deploy.s.sol --rpc-url redbelly_testnet` | `chain id (from the RPC): 153`, `deployer: 0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38`, `Error: script failed: deployer fails permission.isAllowed` |
| 4 | the same with `--rpc-url redbelly_mainnet` (reads mainnet, nothing else) | `chain id (from the RPC): 151`, the same refusal |
| 4 | `npm run preflight -- --chain 151` | `6 of 9 checks passed`; fails `DEPLOYER is a public address`, `ADMIN_SAFE is set (mainnet refuses without a Safe)`, `VERIFIER is set (mainnet never deploys a mock verifier)`; ends `Mainnet deploy would be refused.` |
| 5 | `cd packages/contract-kit && forge test --match-contract AdminPatternTest` | `Suite result: ok. 7 passed; 0 failed; 0 skipped` |
| 6 | in a fresh scaffold, `npm run gas` | 2 s; chain 153, block 3,037,035, base fee 196,043.84 gwei, RBNT US$0.002429 (feed 2026-09-17T17:59:41Z); `GatedERC20:deployment 1,898,391` gas `372.167853` RBNT `90.399` cents; transfer 32,978 / 1.570; subscribe 48,051 / 2.288; mint 42,760 / 2.036; forceTransfer 36,486 / 1.737; pause 39,117 / 1.862; distribute 73,170 / 3.484 |
| 6 | `npm run snapshot`, commit, `cp contracts/.gas-snapshot /tmp/before.gas-snapshot`, `npm run gas -- --diff /tmp/before.gas-snapshot` | 55 rows, every difference `0` and `0.000` |
| 6 | the same after adding a stored `subscriberCount` incremented in `subscribe` | every test that subscribes `+22,217` gas, `+1.057` or `+1.058` cents; the subscribe fuzz test `+6,054`, `+0.288`; change reverted |
| 6 | `npm run gas -- --diff` with no file | `--diff needs a value` (the first draft of the page had this wrong) |

Not run, and marked so on the pages: a real testnet deploy (wallet-signed, not made yet), Routescan
verification, and the admin pattern with real Safes on testnet.
