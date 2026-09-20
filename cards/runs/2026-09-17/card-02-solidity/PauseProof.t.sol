// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { GatedERC20 } from "../src/GatedERC20.sol";

/// @notice What the scaffold's own tests leave unproven about the pause: that each flip emits its
/// event with the account that made it, that a stranger can do neither, and that nothing the token
/// holds changes while it is paused, whoever tries and by whichever path, mint included.
contract PauseProofTest is GatedTest {
    GatedERC20 internal token;
    uint64 internal constant REQUEST = 18;
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

    function test_everyFlipEmits_withTheAccountThatMadeIt() public {
        vm.expectEmit(address(token));
        emit Pausable.Paused(pauser);
        vm.prank(pauser);
        token.pause();

        vm.expectEmit(address(token));
        emit Pausable.Unpaused(admin);
        vm.prank(admin);
        token.unpause();
    }

    function test_strangerCanNeitherPauseNorUnpause() public {
        bytes32 pauserRole = token.PAUSER_ROLE();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, pauserRole)
        );
        token.pause();

        vm.prank(pauser);
        token.pause();
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, bytes32(0))
        );
        token.unpause();
        assertTrue(token.paused());
    }

    /// Take a snapshot at the pause, let everyone try every way of moving a balance, compare.
    function test_nothingTheTokenHoldsChangesWhilePaused_includingThroughMint() public {
        vm.prank(pauser);
        token.pause();
        uint256 supply = token.totalSupply();
        uint256 aliceBalance = token.balanceOf(alice);
        uint256 bobBalance = token.balanceOf(bob);

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.transfer(bob, 1);
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.subscribe();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.burn(1);
        vm.prank(issuer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.mint(bob, 1);
        vm.prank(compliance);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.forceTransfer(alice, bob, 1, keccak256("court order"));

        assertEq(token.totalSupply(), supply, "supply moved while paused");
        assertEq(token.balanceOf(alice), aliceBalance, "alice moved while paused");
        assertEq(token.balanceOf(bob), bobBalance, "bob moved while paused");
        assertFalse(token.hasSubscribed(bob), "a subscription landed while paused");
    }
}
