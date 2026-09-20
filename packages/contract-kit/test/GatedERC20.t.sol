// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { GatedERC20 } from "../src/GatedERC20.sol";
import { IssuerRegistry } from "../src/IssuerRegistry.sol";

/// @notice Every gated function in five credential states, plus the privileged paths.
/// `assertRevertsForAllInvalidStates` walks NeverIssued, Expired, Revoked and WrongJurisdiction
/// and then proves the Valid call succeeds; `assertGatedPair` does the same for both parties of
/// a transfer. A gate with fewer than five states is untested.
contract GatedERC20Test is GatedTest {
    GatedERC20 internal token;
    uint64 internal constant REQUEST = 1;
    address internal admin = makeAddr("admin");
    address internal pauser = makeAddr("pauser");
    address internal compliance = makeAddr("compliance");
    address internal issuerAdmin = makeAddr("issuerAdmin");
    address internal issuer = makeAddr("issuer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    bytes32 internal constant WHY = keccak256("court order 2026-09-12");

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
    }

    function _valid(address who) internal {
        mock.setStatus(who, REQUEST, EligibilityStatus.Valid);
    }

    function _invalidStates() internal pure returns (EligibilityStatus[4] memory) {
        return [
            EligibilityStatus.NeverIssued,
            EligibilityStatus.Expired,
            EligibilityStatus.Revoked,
            EligibilityStatus.WrongJurisdiction
        ];
    }

    // ---- construction ----

    function test_roles_fallBackToAdmin() public {
        GatedERC20 t = new GatedERC20(
            "Gated",
            "GTOK",
            GatedERC20.Roles({ admin: admin, pauser: address(0), compliance: address(0), issuerAdmin: address(0) }),
            mock,
            REQUEST,
            1e18
        );
        assertTrue(t.hasRole(t.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(t.hasRole(t.PAUSER_ROLE(), admin));
        assertTrue(t.hasRole(t.COMPLIANCE_ROLE(), admin));
        assertTrue(t.hasRole(t.ISSUER_ADMIN_ROLE(), admin));
    }

    function test_roles_separatedWhenGiven() public view {
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(token.hasRole(token.PAUSER_ROLE(), pauser));
        assertFalse(token.hasRole(token.PAUSER_ROLE(), admin));
        assertTrue(token.hasRole(token.COMPLIANCE_ROLE(), compliance));
        assertTrue(token.hasRole(token.ISSUER_ADMIN_ROLE(), issuerAdmin));
    }

    function test_zeroAdminRefused() public {
        vm.expectRevert(GatedERC20.ZeroAdmin.selector);
        new GatedERC20(
            "Gated",
            "GTOK",
            GatedERC20.Roles({ admin: address(0), pauser: pauser, compliance: compliance, issuerAdmin: issuerAdmin }),
            mock,
            REQUEST,
            1e18
        );
    }

    // ---- subscribe ----

    function test_subscribe_revertsInAllInvalidStates() public {
        assertRevertsForAllInvalidStates(address(token), abi.encodeCall(token.subscribe, ()), alice, REQUEST);
        assertEq(token.balanceOf(alice), 100e18, "only the Valid call should have minted");
    }

    function test_subscribe_valid_once_and_closed() public {
        _valid(alice);
        assertTrue(token.canSubscribe(alice));
        vm.prank(alice);
        token.subscribe();
        assertEq(token.balanceOf(alice), 100e18);
        assertFalse(token.canSubscribe(alice));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GatedERC20.AlreadySubscribed.selector, alice));
        token.subscribe();

        vm.prank(admin);
        token.setSubscriptionsOpen(false);
        _valid(bob);
        assertFalse(token.canSubscribe(bob));
        vm.prank(bob);
        vm.expectRevert(GatedERC20.SubscriptionsClosed.selector);
        token.subscribe();
    }

    // ---- burn ----

    function test_burn_revertsInAllInvalidStates() public {
        _valid(alice);
        vm.prank(issuer);
        token.mint(alice, 10e18);
        assertRevertsForAllInvalidStates(address(token), abi.encodeCall(token.burn, (1e18)), alice, REQUEST);
        assertEq(token.balanceOf(alice), 9e18, "only the Valid call should have burned");
        assertEq(token.totalSupply(), 9e18);
    }

    // ---- mint by issuer ----

    function test_mint_revertsForIneligibleRecipient() public {
        EligibilityStatus[4] memory invalid = _invalidStates();
        for (uint256 i = 0; i < invalid.length; i++) {
            mock.setStatus(bob, REQUEST, invalid[i]);
            vm.prank(issuer);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, bob, REQUEST));
            token.mint(bob, 1e18);
        }
        _valid(bob);
        vm.prank(issuer);
        token.mint(bob, 1e18);
        assertEq(token.balanceOf(bob), 1e18);
    }

    function test_mint_needsAnActiveIssuer() public {
        _valid(bob);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IssuerRegistry.IssuerNotActive.selector, alice));
        token.mint(bob, 1e18);
        // The admin is not an issuer either: roles do not imply mint rights.
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IssuerRegistry.IssuerNotActive.selector, admin));
        token.mint(bob, 1e18);
    }

    // ---- distribute: the non-reverting denial path ----

    function test_distribute_skipsIneligibleAndRecordsDenial() public {
        _valid(alice);
        mock.setStatus(bob, REQUEST, EligibilityStatus.Revoked);
        address carol = makeAddr("carol"); // NeverIssued
        address[] memory to = new address[](3);
        to[0] = alice;
        to[1] = bob;
        to[2] = carol;
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 5e18;
        amounts[1] = 7e18;
        amounts[2] = 9e18;

        vm.expectEmit(address(token));
        emit Gated.EligibilityDenied(bob, REQUEST, address(mock));
        vm.expectEmit(address(token));
        emit Gated.EligibilityDenied(carol, REQUEST, address(mock));
        vm.expectEmit(address(token));
        emit GatedERC20.Distributed(issuer, 3, 5e18, 16e18);
        vm.prank(issuer);
        (uint256 minted, uint256 skipped) = token.distribute(to, amounts);
        assertEq(minted, 5e18);
        assertEq(skipped, 16e18);
        assertEq(token.balanceOf(alice), 5e18);
        assertEq(token.balanceOf(bob), 0);
        assertEq(token.balanceOf(carol), 0);
        assertEq(token.totalSupply(), 5e18);
        // Only what landed was charged to the issuer.
        assertEq(token.remainingIssuance(issuer), 1_000_000e18 - 5e18);
    }

    function test_distribute_lengthMismatch() public {
        address[] memory to = new address[](2);
        uint256[] memory amounts = new uint256[](1);
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(GatedERC20.LengthMismatch.selector, 2, 1));
        token.distribute(to, amounts);
    }

    function test_distribute_everyoneIneligibleMintsNothingButStillNeedsAnIssuer() public {
        address[] memory to = new address[](1);
        to[0] = bob;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1e18;
        vm.prank(issuer);
        (uint256 minted, uint256 skipped) = token.distribute(to, amounts);
        assertEq(minted, 0);
        assertEq(skipped, 1e18);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IssuerRegistry.IssuerNotActive.selector, alice));
        token.distribute(to, amounts);
    }

    // ---- transfer: both parties ----

    function test_transfer_bothPartiesInAllFiveStates() public {
        _valid(alice);
        vm.prank(alice);
        token.subscribe();
        assertGatedPair(address(token), abi.encodeCall(token.transfer, (bob, 1e18)), alice, bob, REQUEST);
        assertEq(token.balanceOf(bob), 2e18, "exactly the two both-Valid transfers should have landed");
    }

    function test_transferFrom_checksRealPartiesNotTheSpender() public {
        _valid(alice);
        _valid(bob);
        address spender = makeAddr("spender"); // never eligible, and doesn't need to be
        vm.prank(alice);
        token.subscribe();
        vm.prank(alice);
        token.approve(spender, 50e18);
        vm.prank(spender);
        token.transferFrom(alice, bob, 10e18);
        assertEq(token.balanceOf(bob), 10e18);

        EligibilityStatus[4] memory invalid = _invalidStates();
        for (uint256 i = 0; i < invalid.length; i++) {
            mock.setStatus(alice, REQUEST, invalid[i]);
            vm.prank(spender);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, REQUEST));
            token.transferFrom(alice, bob, 1);
        }
        _valid(alice);
        for (uint256 i = 0; i < invalid.length; i++) {
            mock.setStatus(bob, REQUEST, invalid[i]);
            vm.prank(spender);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, bob, REQUEST));
            token.transferFrom(alice, bob, 1);
        }
    }

    function test_canTransfer_mirrorsTheGate() public {
        _valid(alice);
        _valid(bob);
        vm.prank(alice);
        token.subscribe();
        assertTrue(token.canTransfer(alice, bob, 100e18));
        assertFalse(token.canTransfer(alice, bob, 100e18 + 1), "balance");
        mock.setStatus(bob, REQUEST, EligibilityStatus.Expired);
        assertFalse(token.canTransfer(alice, bob, 1), "recipient");
        _valid(bob);
        vm.prank(pauser);
        token.pause();
        assertFalse(token.canTransfer(alice, bob, 1), "paused");
    }

    // ---- forced transfer ----

    function test_forceTransfer_movesFromRevokedHolder_withJustificationHash() public {
        _valid(alice);
        _valid(bob);
        vm.prank(alice);
        token.subscribe();
        mock.setStatus(alice, REQUEST, EligibilityStatus.Revoked);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, REQUEST));
        token.transfer(bob, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, REQUEST));
        token.burn(1);

        vm.expectEmit(address(token));
        emit GatedERC20.ForcedTransfer(alice, bob, 100e18, WHY, compliance);
        vm.prank(compliance);
        token.forceTransfer(alice, bob, 100e18, WHY);
        assertEq(token.balanceOf(alice), 0);
        assertEq(token.balanceOf(bob), 100e18);
    }

    function test_forceTransfer_recipientRevertsInAllInvalidStates() public {
        _valid(alice);
        vm.prank(alice);
        token.subscribe();
        EligibilityStatus[4] memory invalid = _invalidStates();
        for (uint256 i = 0; i < invalid.length; i++) {
            mock.setStatus(bob, REQUEST, invalid[i]);
            vm.prank(compliance);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, bob, REQUEST));
            token.forceTransfer(alice, bob, 1e18, WHY);
        }
        _valid(bob);
        vm.prank(compliance);
        token.forceTransfer(alice, bob, 1e18, WHY);
        assertEq(token.balanceOf(bob), 1e18);
    }

    /// Audit 2026-09-19, R1. A forced move from the zero address is a mint, and to it a burn: neither
    /// is a seizure, and neither may ride on the compliance role.
    function test_forceTransfer_refusesTheZeroAddressOnEitherSide() public {
        _valid(alice);
        _valid(bob);
        vm.prank(issuer);
        token.mint(alice, 10e18);
        uint256 supply = token.totalSupply();

        vm.prank(compliance);
        vm.expectRevert(GatedERC20.ZeroParty.selector);
        token.forceTransfer(address(0), bob, 1_000_000_000e18, WHY);

        mock.setStatus(address(0), REQUEST, EligibilityStatus.Valid); // even if a verifier says yes
        vm.prank(compliance);
        vm.expectRevert(GatedERC20.ZeroParty.selector);
        token.forceTransfer(alice, address(0), 10e18, WHY);

        assertEq(token.totalSupply(), supply, "supply moved");
        assertEq(token.balanceOf(alice), 10e18, "alice was burned");
    }

    /// Audit 2026-09-19, C5. Only the admin can unpause, so a token with no admin stays paused for
    /// good. The last admin can neither renounce nor be revoked; handing over is grant, then revoke.
    function test_admin_theLastOneCannotLeave_butCanHandOver() public {
        bytes32 adminRole = token.DEFAULT_ADMIN_ROLE(); // read first: expectRevert catches the next call
        vm.startPrank(admin);
        vm.expectRevert(GatedERC20.LastAdmin.selector);
        token.renounceRole(adminRole, admin);
        vm.expectRevert(GatedERC20.LastAdmin.selector);
        token.revokeRole(adminRole, admin);

        address next = makeAddr("nextAdmin");
        token.grantRole(adminRole, next);
        token.renounceRole(adminRole, admin);
        vm.stopPrank();
        assertFalse(token.hasRole(adminRole, admin));

        vm.prank(next);
        vm.expectRevert(GatedERC20.LastAdmin.selector);
        token.renounceRole(adminRole, next);
    }

    function test_forceTransfer_requiresJustification_andRole() public {
        _valid(alice);
        _valid(bob);
        vm.prank(alice);
        token.subscribe();
        vm.prank(compliance);
        vm.expectRevert(GatedERC20.EmptyJustification.selector);
        token.forceTransfer(alice, bob, 1e18, bytes32(0));
        bytes32 role = token.COMPLIANCE_ROLE();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, role));
        token.forceTransfer(alice, bob, 1e18, WHY);
    }

    function test_forceTransfer_doesNotLeakTheForcingFlag() public {
        // After a forced transfer the ordinary gate is back: a second plain transfer from a
        // revoked wallet in the same block still reverts.
        _valid(alice);
        _valid(bob);
        vm.prank(alice);
        token.subscribe();
        mock.setStatus(alice, REQUEST, EligibilityStatus.Revoked);
        vm.prank(compliance);
        token.forceTransfer(alice, bob, 1e18, WHY);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, REQUEST));
        token.transfer(bob, 1);
    }

    // ---- pause ----

    function test_pause_blocksEverythingButUnpause_andRolesSplit() public {
        _valid(alice);
        _valid(bob);
        vm.prank(alice);
        token.subscribe();

        // Only the pauser pauses; the admin cannot.
        bytes32 pauserRole = token.PAUSER_ROLE();
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, pauserRole)
        );
        token.pause();
        vm.prank(pauser);
        token.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.transfer(bob, 1);
        vm.prank(alice);
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
        token.forceTransfer(alice, bob, 1, WHY);
        assertFalse(token.canSubscribe(bob));

        // Only the admin unpauses; the pauser cannot.
        vm.prank(pauser);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, pauser, bytes32(0))
        );
        token.unpause();
        vm.prank(admin);
        token.unpause();
        vm.prank(alice);
        token.transfer(bob, 1);
        assertEq(token.balanceOf(bob), 1);
    }

    // ---- verifier change is admin-only ----

    function test_setVerifierAndRequestId_onlyAdmin() public {
        vm.prank(pauser);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, pauser, bytes32(0))
        );
        token.setRequestId(2);
        vm.prank(compliance);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, compliance, bytes32(0))
        );
        token.setVerifier(mock);
        vm.prank(admin);
        token.setRequestId(2);
        assertEq(token.requestId(), 2);
        vm.prank(admin);
        token.setVerifier(mock);
        assertEq(address(token.verifier()), address(mock));
    }

    function test_requestIdChange_movesTheGate() public {
        _valid(alice);
        vm.prank(admin);
        token.setRequestId(2);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, 2));
        token.subscribe();
        mock.setStatus(alice, 2, EligibilityStatus.Valid);
        vm.prank(alice);
        token.subscribe();
        assertEq(token.balanceOf(alice), 100e18);
    }
}
