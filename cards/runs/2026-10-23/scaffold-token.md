# The scaffold's token on testnet: run of 2026-10-23

Not a card. This is step 10 and step 11 of the start page done for real: the `GatedERC20` that
`npm create redbelly-dapp` scaffolds, deployed to chain 153 by the owner from her own Terminal and
verified on Routescan. It is the second contract of ours on a real network, after card 13's guard on
17 October, and the one every project on the grid now follows.

## Verdict

**Deployed on testnet and verified on Routescan.** From `~/code/first-153` (the scaffold made on 17
October from the published packages; its vendored pre-flight reports itself as 0.2.1), the owner ran
the three commands of `setup/testnet-153-first-deploy-draft.md` Part 5 in order, signing with the
keystore `rbn-testnet` in her own Terminal; the key was never in a file or the chat, and the session
saw only the public address `0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59`.

| | |
|---|---|
| `GatedERC20` ("Gated Token", GTOK) | `0x26ab267769C249a007e2f1869272bf30fd169BaC` |
| its transaction | `0xcb49c398ff671cb5566521f256825984b6d89b371caba0551d86eabde326f4a1`, 1,972,293 gas, 601.27 test RBNT |
| `ReceptorMock` (the verifier, because `VERIFIER` was unset, as intended on 153) | `0x2E652B946DC303d8f53bC92D0787e13B109003e5` |
| its transaction | `0x5b394dc1f4ba9bdb361c087bda11a5f2b77b730a9fa8fd096c9d06d4651d29f9`, 702,804 gas, 214.26 test RBNT |
| block | 3,055,910, 2026-10-23 15:04:05 UTC, both transactions in the one block |
| base fee | 304,859.46 gwei, no priority fee; RBNT US$0.001562 on the feed, so about US$1.27 in all |
| balance on 153 | 41,499.30 before, 40,683.77 after, read from chain: 815.53 spent, which is the two receipts summed |
| balance on 151 | 81.64 RBNT before and after; never touched |
| Routescan | both "Pass - Verified" after one "Pending in queue" each; v0.8.30, Prague, optimizer 200 runs |

Read back live after the deploy, read-only: `name()` Gated Token, `symbol()` GTOK, `requestId()` 18,
`verifier()` the mock above, `totalSupply()` 0, `paused()` false, the deployer holds `DEFAULT_ADMIN_ROLE`,
and `canSubscribe(deployer)` is false, which is right: on the mock every wallet starts ineligible until
`setStatus()` says otherwise. Nothing has been subscribed, minted or flipped yet; that is the live-use
step, hers to sign when she wants it.

## What ran, in order

1. `DEPLOYER=<her address> npm run preflight`: 9 of 9, `isAllowed` true, 41,499.30 RBNT.
2. `npm run ship -- --chain 153 --account rbn-testnet`: every check passed (gas 35 rows at block
   3,055,909, chain id, deployer verified, compiler pins, git secrets, balance with the 25% margin,
   Slither report fresh, 86 tests, four five-state suites); one warning, no `VERIFIER`, which is the
   testnet case; `admin-safe` skipped because none was given. Report
   `contracts/deployments/ship-153-2026-10-23.md`, copied beside this file as written before the deploy.
3. `forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account rbn-testnet --sender <her
   address> --broadcast` from `contracts/`: the script's own pre-flight printed `chain id: 153`,
   `permission.isAllowed(deployer): true`, found the day's ship report, said in capitals that it was
   deploying the mock, and broadcast two transactions. Receipts in seconds, as the network promises.
4. Verification, by the session, no key involved: `forge verify-contract <token> src/GatedERC20.sol:GatedERC20
   --verifier etherscan --verifier-url https://api.routescan.io/v2/network/testnet/evm/153/etherscan
   --etherscan-api-key verifyContract --chain 153 --compiler-version 0.8.30 --evm-version prague
   --num-of-optimizations 200 --constructor-args <from deployments/153-GatedERC20.json> --watch`, and the
   same for `lib/receptor-mock/src/ReceptorMock.sol:ReceptorMock` without constructor arguments.

Files beside this record: `token/deployment-153-GatedERC20.json` (the record the deploy script wrote,
with the constructor signature and encoded arguments), `token/broadcast-153-run-latest.json` (Forge's
broadcast, both receipts), `token/ship-153-2026-10-23-pre-deploy.md`, `token/ship-153-2026-10-23-post-deploy.md`.

## Findings

- **The ship report's verify command is stale when the report is written before the deploy.** It takes
  the address and arguments from whatever `deployments/153-GatedERC20.json` holds at the time, which
  today was the 17 October dry run (address `0x0801…`, verifier `0x017b…`). Part 5.4 of the draft
  re-runs `ship` after the deploy for this reason; until that is run, build the verify command from the
  fresh record, as done here. For 0.2.3: the report could say plainly which record it read and when,
  or omit the verify command when the record's address holds no code.
- **Forge's closing "Total Paid" line is wrong**: it printed 3.87 RBNT against two line items of 601.27
  and 214.26, which sum to 815.53, the figure the balance confirms. Cosmetic, and Foundry's, not ours;
  worth a sentence on the errors page so a builder trusts the receipts, not the summary.
- **The dry-run record is indistinguishable from a real one** until the address is checked for code.
  A `--broadcast`-less run writes `deployments/153-GatedERC20.json` with simulated addresses. The
  scaffold's record could carry a `broadcast: false` field or a different file name for a dry run.
- Nothing new on the network side: the first-try CORS miss seen in browsers did not occur over `cast`;
  the block arrived on demand; the base fee was within 0.01% of the figure read ninety minutes earlier.

## Not done

**Part 5.4 done later the same hour:** she re-ran `npm run ship -- --chain 153 --account rbn-testnet`; every
check passed again at block 3,055,914 with the balance read as 40,683.77, and the rewritten report names the
live token, its verifier and request id 18 and carries a verify command with the right address
(`token/ship-153-2026-10-23-post-deploy.md`). Still not done: the first subscription and transfer through the live token, which are her signatures
(the token has no supply yet); the `/start/` pills, proposed as a diff in
`research/start-pills-2026-10-23-draft.md` and not applied. Nothing committed.
