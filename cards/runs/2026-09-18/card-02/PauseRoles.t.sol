// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { GatedERC20 } from "../src/GatedERC20.sol";

/// @notice Card 2, "Prove the pause". The token already pauses; nothing under src/ changes.
/// What this proves, with the two roles held by two different accounts:
///   1. only the pauser can pause (the admin and a stranger are both refused);
///   2. only the admin can unpause (the pauser and a stranger are both refused);
///   3. every flip emits its event, naming the account that made it;
///   4. nothing the token holds changes while paused, including through mint.
contract PauseRolesTest is GatedTest {
    GatedERC20 internal token;
    uint64 internal constant REQUEST = 1;
    address internal admin = makeAddr("admin");
    address internal pauser = makeAddr("pauser");
    address internal compliance = makeAddr("compliance");
    address internal issuerAdmin = makeAddr("issuerAdmin");
    address internal issuer = makeAddr("issuer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        _deployMock();
        token = new GatedERC20(
            "Gated",
            "GTOK",
            GatedERC20.Roles({ admin: admin, pauser: pauser, compliance: compliance, issuerAdmin: issuerAdmin }),
            mock,
            REQUEST,
            100e18
        );
        vm.prank(admin);
        token.setSubscriptionsOpen(true);
        vm.prank(issuerAdmin);
        token.setIssuer(issuer, 0, uint64(block.timestamp + 30 days), 1_000_000e18);
        mock.setStatus(alice, REQUEST, EligibilityStatus.Valid);
        mock.setStatus(bob, REQUEST, EligibilityStatus.Valid);
        vm.prank(alice);
        token.subscribe();
    }

    function _unauthorised(address who, bytes32 role) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, who, role);
    }

    // ---- 1. only the pauser can pause ----

    function test_onlyThePauserCanPause() public {
        bytes32 role = token.PAUSER_ROLE();

        vm.prank(admin);
        vm.expectRevert(_unauthorised(admin, role));
        token.pause();

        vm.prank(stranger);
        vm.expectRevert(_unauthorised(stranger, role));
        token.pause();

        assertFalse(token.paused());
        vm.prank(pauser);
        token.pause();
        assertTrue(token.paused());
    }

    // ---- 2. only the admin can unpause ----

    function test_onlyTheAdminCanUnpause() public {
        bytes32 role = token.DEFAULT_ADMIN_ROLE();
        vm.prank(pauser);
        token.pause();

        // The account that stopped the token cannot restart it: stopping is fast, restarting is slow.
        vm.prank(pauser);
        vm.expectRevert(_unauthorised(pauser, role));
        token.unpause();

        vm.prank(stranger);
        vm.expectRevert(_unauthorised(stranger, role));
        token.unpause();

        assertTrue(token.paused());
        vm.prank(admin);
        token.unpause();
        assertFalse(token.paused());
    }

    // ---- 3. every flip emits, naming who made it ----

    function test_everyFlipEmits_namingTheAccount() public {
        vm.expectEmit(true, true, true, true, address(token));
        emit Pausable.Paused(pauser);
        vm.prank(pauser);
        token.pause();

        vm.expectEmit(true, true, true, true, address(token));
        emit Pausable.Unpaused(admin);
        vm.prank(admin);
        token.unpause();
    }

    // ---- 4. nothing the token holds changes while paused, including through mint ----

    struct Snapshot {
        uint256 supply;
        uint256 aliceBalance;
        uint256 bobBalance;
        bool aliceSubscribed;
        bool bobSubscribed;
        bool subscriptionsOpen;
    }

    function _snapshot() internal view returns (Snapshot memory) {
        return Snapshot({
            supply: token.totalSupply(),
            aliceBalance: token.balanceOf(alice),
            bobBalance: token.balanceOf(bob),
            aliceSubscribed: token.hasSubscribed(alice),
            bobSubscribed: token.hasSubscribed(bob),
            subscriptionsOpen: token.subscriptionsOpen()
        });
    }

    function test_nothingMovesWhilePaused_includingThroughMint() public {
        vm.prank(pauser);
        token.pause();
        Snapshot memory before = _snapshot();

        // a holder transfers
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.transfer(bob, 1e18);

        // a new eligible wallet subscribes
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.subscribe();

        // the issuer mints: the privileged path the card names
        vm.prank(issuer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.mint(bob, 5e18);

        // the compliance officer forces a transfer
        vm.prank(compliance);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.forceTransfer(alice, bob, 1e18, keccak256("order"));

        Snapshot memory afterwards = _snapshot();
        assertEq(afterwards.supply, before.supply, "supply");
        assertEq(afterwards.aliceBalance, before.aliceBalance, "alice");
        assertEq(afterwards.bobBalance, before.bobBalance, "bob");
        assertEq(afterwards.aliceSubscribed, before.aliceSubscribed, "alice subscribed");
        assertEq(afterwards.bobSubscribed, before.bobSubscribed, "bob subscribed");
        assertEq(afterwards.subscriptionsOpen, before.subscriptionsOpen, "subscriptions open");

        // and the token works again once the admin resumes it
        vm.prank(admin);
        token.unpause();
        vm.prank(issuer);
        token.mint(bob, 5e18);
        assertEq(token.balanceOf(bob), before.bobBalance + 5e18);
    }
}
