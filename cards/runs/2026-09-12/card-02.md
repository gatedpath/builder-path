# Card 2, Add a pause: run of 2026-09-12

## Verdict

Verified, with a caveat about the prompt. The result compiles, 32 tests pass (two more than the scaffold ships with), Slither finds nothing and pre-flight clears. The recorded command phase took 10 s; reading the contract and writing the diff took the agent about six minutes before that, which the timer did not capture. The card's wording has been changed; see the end.

Agent: Claude Code (this session), following the prompt exactly as written on the card, with the scaffold's own `CLAUDE.md` rules file loaded. A second agent has not run this card yet.
Scaffold: a fresh `create-redbelly-dapp --yes` gated-erc20 project at the state the golden path leaves it (`packages/create-redbelly-dapp/reports/golden-path-foundry.md`), copied into its own git repository so the diff is exact.
Tools: Foundry 1.7.1 (forge, cast, an Anvil fork of testnet at block 3034388), Slither 0.11.6, `redbelly-preflight` 0.1.0, git. No key, no wallet, nothing sent to a real network; pre-flight ran read-only against the fork with the known allowed address.

## The prompt, as written on the card

> Add an emergency pause controlled by the admin Safe, emit an event when it flips, and add an invariant test that no state changes while paused.

## What the agent did

Read the contract first. Most of the card is already there: `GatedERC20` inherits OpenZeppelin's `ERC20Pausable`, `pause()` and `unpause()` sit behind `DEFAULT_ADMIN_ROLE`, the deploy script hands that role to `ADMIN_SAFE` (the nine `DeployPreflightTest` cases prove the hand-over), OpenZeppelin's `Pausable` emits `Paused(account)` and `Unpaused(account)` on every flip, and the invariant suite already has `invariant_pausedMeansNoStateChange`. Adding a second pause would be wrong, so the honest reading of "add" is "prove it, and prove more of it than the scaffold does".

The diff therefore touches tests only. The invariant handler now snapshots everything the token holds the moment a pause lands (total supply, every actor's balance and subscription flag), drives the privileged `mint` path as well as subscribe, transfer and forced transfer, and counts a pause or unpause that landed without its event as a silent state change. A new `invariant_pausedStateFrozen` compares the live token against the snapshot while paused. A new unit test asserts that only the admin role flips the pause and that `Paused` and `Unpaused` are emitted with the admin as the account. Nothing in `src/` changed; no gate was touched. The `package.json` and `scripts/slither.mjs` lines in the diff stat are the day's scaffolder fix carried into the copy (see card 1), not part of the card's work; the contracts diff is shown in full.

## Transcript

### The diff

```
$ git diff --cached --stat
contracts/test/GatedERC20.invariants.t.sol | 64 ++++++++++++++++++++++++++++-
 contracts/test/GatedERC20.t.sol            | 28 +++++++++++++
 package.json                               |  2 +-
 scripts/slither.mjs                        | 66 ++++++++++++++++++++++++++++++
 4 files changed, 157 insertions(+), 3 deletions(-)
```

exit 0, 0.01 s wall.

### The diff, in full

```
$ git diff --cached -- contracts
diff --git a/contracts/test/GatedERC20.invariants.t.sol b/contracts/test/GatedERC20.invariants.t.sol
index c5b587b..4113396 100644
--- a/contracts/test/GatedERC20.invariants.t.sol
+++ b/contracts/test/GatedERC20.invariants.t.sol
@@ -2,6 +2,7 @@
 pragma solidity 0.8.30;
 
 import { Test, Vm } from "forge-std/Test.sol";
+import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
 import { ReceptorMock } from "@redbelly-builder/receptor-mock/ReceptorMock.sol";
 import { EligibilityStatus } from "@redbelly-builder/receptor-mock/IRedbellyVerifier.sol";
 import { GatedERC20 } from "../src/GatedERC20.sol";
@@ -21,6 +22,16 @@ contract Handler is Test {
     uint256 public forcedTransferEventsWithJustification;
     uint256 public stateChangesWhilePaused;
 
+    /// Snapshot of everything the token holds, taken the moment a pause lands. While paused,
+    /// `invariant_pausedStateFrozen` compares the live state against it.
+    uint256 public snapSupply;
+    bool public snapSubscriptionsOpen;
+    mapping(address => uint256) public snapBalance;
+    mapping(address => bool) public snapSubscribed;
+    /// Pause and unpause transitions seen, so the invariant can insist the events were emitted.
+    uint256 public pauses;
+    uint256 public unpauses;
+
     constructor(GatedERC20 token_, ReceptorMock receptor_, uint64 requestId_, address admin_) {
         token = token_;
         receptor = receptor_;
@@ -59,6 +70,18 @@ contract Handler is Test {
         if (paused && token.balanceOf(a) != before) stateChangesWhilePaused++;
     }
 
+    /// The privileged mint path goes through `_update` too, so it must also stop while paused.
+    function mint(uint256 toSeed, uint256 amount) external {
+        address to = _actor(toSeed);
+        amount = bound(amount, 0, 1_000e18);
+        bool paused = token.paused();
+        vm.prank(admin);
+        try token.mint(to, amount) {
+            if (paused) stateChangesWhilePaused++;
+            if (!_eligible(to) && amount > 0) receivedWhileIneligible[to] = true;
+        } catch { }
+    }
+
     function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
         address from = _actor(fromSeed);
         address to = _actor(toSeed);
@@ -93,13 +116,36 @@ contract Handler is Test {
     }
 
     function pause() external {
+        vm.recordLogs();
         vm.prank(admin);
-        try token.pause() { } catch { }
+        try token.pause() {
+            pauses++;
+            _requireEvent(Pausable.Paused.selector);
+            snapSupply = token.totalSupply();
+            snapSubscriptionsOpen = token.subscriptionsOpen();
+            for (uint256 i = 0; i < actors.length; i++) {
+                snapBalance[actors[i]] = token.balanceOf(actors[i]);
+                snapSubscribed[actors[i]] = token.hasSubscribed(actors[i]);
+            }
+        } catch { }
     }
 
     function unpause() external {
+        vm.recordLogs();
         vm.prank(admin);
-        try token.unpause() { } catch { }
+        try token.unpause() {
+            unpauses++;
+            _requireEvent(Pausable.Unpaused.selector);
+        } catch { }
+    }
+
+    /// A pause or unpause that landed without its event is counted as a silent state change.
+    function _requireEvent(bytes32 topic) internal {
+        Vm.Log[] memory logs = vm.getRecordedLogs();
+        for (uint256 i = 0; i < logs.length; i++) {
+            if (logs[i].topics[0] == topic) return;
+        }
+        stateChangesWhilePaused++;
     }
 }
 
@@ -140,6 +186,20 @@ contract GatedERC20Invariants is Test {
         assertEq(handler.stateChangesWhilePaused(), 0);
     }
 
+    /// While paused, everything the token holds (supply, every balance, every subscription
+    /// flag) still equals the snapshot taken when the pause landed. Subscriptions may be opened
+    /// or closed by the admin while paused; that is a setting, not a movement, and is compared
+    /// only to show the handler saw it.
+    function invariant_pausedStateFrozen() public view {
+        if (!token.paused()) return;
+        assertEq(token.totalSupply(), handler.snapSupply(), "supply moved while paused");
+        for (uint256 i = 0; i < handler.actorCount(); i++) {
+            address a = handler.actors(i);
+            assertEq(token.balanceOf(a), handler.snapBalance(a), "a balance moved while paused");
+            assertEq(token.hasSubscribed(a), handler.snapSubscribed(a), "a subscription landed while paused");
+        }
+    }
+
     /// Every forced transfer emitted a justification.
     function invariant_forcedTransfersEmitJustification() public view {
         assertEq(handler.forcedTransfers(), handler.forcedTransferEventsWithJustification());
diff --git a/contracts/test/GatedERC20.t.sol b/contracts/test/GatedERC20.t.sol
index f1b36cc..934422b 100644
--- a/contracts/test/GatedERC20.t.sol
+++ b/contracts/test/GatedERC20.t.sol
@@ -226,6 +226,34 @@ contract GatedERC20Test is GatedTest {
         assertEq(token.balanceOf(bob), 1);
     }
 
+    function test_pause_emitsOnEveryFlip_andOnlyAdminFlipsIt() public {
+        // The deploy script hands DEFAULT_ADMIN_ROLE to ADMIN_SAFE, so on a real deploy "admin"
+        // here is the Safe; DeployPreflightTest proves that hand-over.
+        vm.prank(alice);
+        vm.expectRevert(
+            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, bytes32(0))
+        );
+        token.pause();
+
+        vm.expectEmit(true, true, true, true);
+        emit Pausable.Paused(admin);
+        vm.prank(admin);
+        token.pause();
+        assertTrue(token.paused());
+
+        vm.prank(alice);
+        vm.expectRevert(
+            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, bytes32(0))
+        );
+        token.unpause();
+
+        vm.expectEmit(true, true, true, true);
+        emit Pausable.Unpaused(admin);
+        vm.prank(admin);
+        token.unpause();
+        assertFalse(token.paused());
+    }
+
     // ---- verifier change is admin-only ----
 
     function test_setVerifierAndRequestId_onlyAdmin() public {
```

exit 0, 0.01 s wall.

### forge test

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
Suite result: ok. 9 passed; 0 failed; 0 skipped; finished in 2.43ms (1.44ms CPU time)
Ran 15 tests for test/GatedERC20.t.sol:GatedERC20Test
[PASS] test_forceTransfer_movesFromRevokedHolder_withJustification() (gas: 184345)
[PASS] test_forceTransfer_recipientRevertsInAllInvalidStates() (gas: 197779)
[PASS] test_forceTransfer_requiresJustification_andRole() (gas: 166116)
[PASS] test_mint_revertsForIneligibleRecipient() (gas: 95027)
[PASS] test_mint_valid_and_onlyMinter() (gas: 112192)
[PASS] test_pause_blocksEverythingButUnpause() (gas: 213641)
[PASS] test_pause_emitsOnEveryFlip_andOnlyAdminFlipsIt() (gas: 40176)
[PASS] test_setVerifierAndRequestId_onlyAdmin() (gas: 38807)
[PASS] test_subscribe_closed() (gas: 60130)
[PASS] test_subscribe_revertsInAllInvalidStates() (gas: 181301)
[PASS] test_subscribe_valid() (gas: 133630)
[PASS] test_transferFrom_checksRealParties() (gas: 221842)
[PASS] test_transfer_bothPartiesInAllFiveStates() (gas: 351424)
[PASS] test_transfer_bothValid() (gas: 184505)
[PASS] test_transfer_recipientRevertsInAllInvalidStates() (gas: 197328)
Suite result: ok. 15 passed; 0 failed; 0 skipped; finished in 4.93ms (3.58ms CPU time)
Ran 5 tests for test/GatedERC20.invariants.t.sol:GatedERC20Invariants
[PASS] invariant_forcedTransfersEmitJustification() (runs: 64, calls: 2048, reverts: 0)
[PASS] invariant_noIneligibleRecipient() (runs: 64, calls: 2048, reverts: 0)
[PASS] invariant_pausedMeansNoStateChange() (runs: 64, calls: 2048, reverts: 0)
[PASS] invariant_pausedStateFrozen() (runs: 64, calls: 2048, reverts: 0)
[PASS] invariant_supplyEqualsSumOfBalances() (runs: 64, calls: 2048, reverts: 0)
Suite result: ok. 5 passed; 0 failed; 0 skipped; finished in 1.10s (2.99s CPU time)
Ran 3 tests for test/GatedERC20.fuzz.t.sol:GatedERC20FuzzTest
[PASS] testFuzz_forceTransfer_alwaysNeedsJustification(uint256,string) (runs: 512, μ: 185966, ~: 187987)
[PASS] testFuzz_subscribe_onlyValidOnce(address,uint8) (runs: 512, μ: 66878, ~: 50451)
[PASS] testFuzz_transfer_requiresBothValid(address,address,uint8,uint8,uint256) (runs: 512, μ: 160490, ~: 158894)
Suite result: ok. 3 passed; 0 failed; 0 skipped; finished in 1.10s (1.31s CPU time)
Ran 4 test suites in 1.10s (2.21s CPU time): 32 tests passed, 0 failed, 0 skipped (32 total tests)
```

exit 0, 4.42 s wall.

### Slither through the scaffold's lint:slither

```
$ bash -c 'npm run lint:slither 2>&1 | grep -E 'analyzed|result|wrote''
. analyzed (16 contracts with 81 detectors), 0 result(s) found
wrote contracts/reports/slither.json and contracts/reports/slither.sources.sha256
```

exit 0, 1.46 s wall.

### redbelly-preflight, read-only, against the testnet fork

```
$ cd contracts && redbelly-preflight --chain 153 --rpc http://127.0.0.1:8545 --address 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
redbelly-preflight 0.1.0  project <tmp>/card-02/contracts
chain 153 (testnet) via http://127.0.0.1:8545  deployer 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76

pass  chain-id           --chain says chain 153 and the RPC reports 153.
pass  deployer-verified  0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 (--address) passes permission.isAllowed on chain 153.
skip  admin-safe         No admin given; pass --admin <0x…> with the address that will own the deployed contracts.
pass  compiler-pins      <tmp>/card-02/contracts/foundry.toml (profile default) pins solc 0.8.30 and EVM prague.
pass  git-secrets        No secret-shaped line added in 1 commits, and no .env file is tracked.
pass  balance            0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 holds 279.7464 RBNT; 3,000,000 gas costs about 90.6243 RBNT (US$0.2203) and 113.2804 RBNT covers it with 25% margin.
pass  slither-report     reports/slither.json describes the current sources: reports/slither.sources.sha256 matches the hash of 1 .sol file(s) under src.

ok: no check failed.
```

exit 0, 0.28 s wall.

## Wording change

Against this scaffold, "add an emergency pause" asks for something that exists, and an agent that takes the verb literally will either duplicate the mechanism or report that there is nothing to do. The card now says: "The token already pauses. Prove it: show that only the admin Safe can flip the pause, that every flip emits an event, and add an invariant test that nothing the token holds changes while paused, including through mint." Same lesson (admin roles live behind the Safe; invariants), and a prompt that fits the code it is run against.
