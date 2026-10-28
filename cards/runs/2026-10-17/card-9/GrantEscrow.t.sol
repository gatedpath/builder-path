// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { GrantEscrow } from "../src/GrantEscrow.sol";
import { MockStable } from "./mocks/MockStable.sol";

/// @notice Card 9. The grantee's gate in five credential states at both places it is applied
/// (`accept`, and again at every `release`), the deposit, a release per milestone with its note,
/// the refusals, and where the remainder goes.
contract GrantEscrowTest is GatedTest {
    GrantEscrow internal escrow;
    MockStable internal usd;
    uint64 internal constant REQUEST = 100; // recipes/accredited-issuer
    address internal admin = makeAddr("admin");
    address internal reviewer = makeAddr("reviewer");
    address internal funder = makeAddr("funder");
    address internal grantee = makeAddr("grantee");
    address internal stranger = makeAddr("stranger");

    uint256 internal constant TOTAL = 30_000e6;
    uint256[] internal tranches;

    function setUp() public {
        _deployMock();
        usd = new MockStable();
        escrow = new GrantEscrow(GrantEscrow.Roles({ admin: admin, reviewer: reviewer }), mock, REQUEST);
        tranches = [uint256(10_000e6), 15_000e6, 5_000e6];
        usd.mint(funder, 1_000_000e6);
        vm.prank(funder);
        usd.approve(address(escrow), type(uint256).max);
    }

    function _valid(address who) internal {
        mock.setStatus(who, REQUEST, EligibilityStatus.Valid);
    }

    function _fund() internal returns (uint256 id) {
        vm.prank(funder);
        id = escrow.fund(grantee, IERC20(address(usd)), TOTAL, tranches);
    }

    function _fundAndAccept() internal returns (uint256 id) {
        id = _fund();
        _valid(grantee);
        vm.prank(grantee);
        escrow.accept(id);
    }

    // ---- construction and roles ----

    function test_roles_fallBackToAdmin() public {
        GrantEscrow e = new GrantEscrow(GrantEscrow.Roles({ admin: admin, reviewer: address(0) }), mock, REQUEST);
        assertTrue(e.hasRole(e.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(e.hasRole(e.REVIEWER_ROLE(), admin));
    }

    function test_roles_separatedWhenGiven() public view {
        assertTrue(escrow.hasRole(escrow.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(escrow.hasRole(escrow.REVIEWER_ROLE(), reviewer));
        assertFalse(escrow.hasRole(escrow.REVIEWER_ROLE(), admin));
        assertEq(escrow.requestId(), REQUEST);
    }

    function test_zeroAdminRefused() public {
        vm.expectRevert(GrantEscrow.ZeroAdmin.selector);
        new GrantEscrow(GrantEscrow.Roles({ admin: address(0), reviewer: reviewer }), mock, REQUEST);
    }

    function test_setVerifierAndRequestId_onlyAdmin() public {
        vm.prank(reviewer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, reviewer, bytes32(0))
        );
        escrow.setRequestId(2);
        vm.prank(admin);
        escrow.setRequestId(2);
        assertEq(escrow.requestId(), 2);
    }

    // ---- the deposit ----

    function test_fund_depositsAndRecordsTheTranches() public {
        vm.expectEmit(address(escrow));
        emit GrantEscrow.Funded(1, funder, grantee, address(usd), TOTAL, 3);
        uint256 id = _fund();
        assertEq(id, 1);
        assertEq(usd.balanceOf(address(escrow)), TOTAL);
        assertEq(usd.balanceOf(funder), 1_000_000e6 - TOTAL);
        GrantEscrow.Grant memory g = escrow.grant(id);
        assertEq(g.funder, funder);
        assertEq(g.grantee, grantee);
        assertEq(address(g.token), address(usd));
        assertEq(g.deposited, TOTAL);
        assertEq(g.released, 0);
        assertFalse(g.accepted);
        assertEq(escrow.milestoneCount(id), 3);
        assertEq(escrow.milestone(id, 1).amount, 15_000e6);
        assertEq(escrow.remainder(id), TOTAL);
        assertFalse(escrow.canRelease(id), "not accepted yet");
    }

    function test_fund_isNotGated_butNothingMovesUntilTheGranteeAccepts() public {
        // The funder holds no credential and does not need one.
        assertEq(uint8(mock.eligibilityStatus(funder, REQUEST)), uint8(EligibilityStatus.NeverIssued));
        uint256 id = _fund();
        vm.prank(reviewer);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, grantee, REQUEST));
        escrow.release(id, "milestone 1");
        _valid(grantee);
        vm.prank(reviewer);
        vm.expectRevert(abi.encodeWithSelector(GrantEscrow.NotAccepted.selector, id));
        escrow.release(id, "milestone 1");
        assertEq(usd.balanceOf(grantee), 0);
    }

    function test_fund_refusals() public {
        uint256[] memory none;
        vm.startPrank(funder);
        vm.expectRevert(GrantEscrow.ZeroGrantee.selector);
        escrow.fund(address(0), IERC20(address(usd)), TOTAL, tranches);
        vm.expectRevert(GrantEscrow.ZeroToken.selector);
        escrow.fund(grantee, IERC20(address(0)), TOTAL, tranches);
        vm.expectRevert(GrantEscrow.NoMilestones.selector);
        escrow.fund(grantee, IERC20(address(usd)), TOTAL, none);
        vm.expectRevert(abi.encodeWithSelector(GrantEscrow.TranchesDoNotSum.selector, TOTAL, TOTAL + 1));
        escrow.fund(grantee, IERC20(address(usd)), TOTAL + 1, tranches);

        uint256[] memory withZero = new uint256[](2);
        withZero[0] = TOTAL;
        vm.expectRevert(abi.encodeWithSelector(GrantEscrow.ZeroTranche.selector, 1));
        escrow.fund(grantee, IERC20(address(usd)), TOTAL, withZero);

        uint256[] memory tooMany = new uint256[](escrow.MAX_MILESTONES() + 1);
        for (uint256 i = 0; i < tooMany.length; i++) {
            tooMany[i] = 1;
        }
        vm.expectRevert(
            abi.encodeWithSelector(GrantEscrow.TooManyMilestones.selector, tooMany.length, escrow.MAX_MILESTONES())
        );
        escrow.fund(grantee, IERC20(address(usd)), tooMany.length, tooMany);
        vm.stopPrank();
        assertEq(escrow.grantCount(), 0);
        assertEq(usd.balanceOf(address(escrow)), 0);
    }

    // ---- the gate on the grantee: accept ----

    function test_accept_revertsInAllInvalidStates() public {
        uint256 id = _fund();
        assertRevertsForAllInvalidStates(address(escrow), abi.encodeCall(escrow.accept, (id)), grantee, REQUEST);
        assertTrue(escrow.grant(id).accepted, "only the Valid call should have accepted");
    }

    function test_accept_onlyTheNamedGrantee_andOnce() public {
        uint256 id = _fund();
        _valid(stranger);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(GrantEscrow.NotTheGrantee.selector, id, stranger));
        escrow.accept(id);

        _valid(grantee);
        vm.expectEmit(address(escrow));
        emit GrantEscrow.Accepted(id, grantee);
        vm.prank(grantee);
        escrow.accept(id);
        vm.prank(grantee);
        vm.expectRevert(abi.encodeWithSelector(GrantEscrow.AlreadyAccepted.selector, id));
        escrow.accept(id);

        vm.prank(grantee);
        vm.expectRevert(abi.encodeWithSelector(GrantEscrow.UnknownGrant.selector, 7));
        escrow.accept(7);
    }

    // ---- the gate on the grantee: release, five states ----

    function test_release_granteeInAllFiveStates() public {
        uint256 id = _fundAndAccept();
        EligibilityStatus[4] memory invalid = invalidStates();
        for (uint256 i = 0; i < invalid.length; i++) {
            mock.setStatus(grantee, REQUEST, invalid[i]);
            assertFalse(escrow.canRelease(id), stateName(invalid[i]));
            vm.prank(reviewer);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, grantee, REQUEST));
            escrow.release(id, "milestone 1");
        }
        assertEq(usd.balanceOf(grantee), 0, "nothing left while the credential was not valid");
        _valid(grantee);
        assertTrue(escrow.canRelease(id));
        vm.prank(reviewer);
        escrow.release(id, "milestone 1: repository public, CI green");
        assertEq(usd.balanceOf(grantee), 10_000e6);
    }

    function test_release_expiryIsReadAtTheMomentOfRelease() public {
        uint256 id = _fund();
        mock.setValidUntil(grantee, REQUEST, uint64(block.timestamp + 30 days));
        vm.prank(grantee);
        escrow.accept(id);
        vm.prank(reviewer);
        escrow.release(id, "milestone 1");
        vm.warp(block.timestamp + 31 days);
        assertEq(uint8(mock.eligibilityStatus(grantee, REQUEST)), uint8(EligibilityStatus.Expired));
        vm.prank(reviewer);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, grantee, REQUEST));
        escrow.release(id, "milestone 2");
        assertEq(escrow.remainder(id), 20_000e6, "the remainder waits in the escrow");
    }

    // ---- release per milestone, with its note ----

    function test_release_perMilestone_withNotes_inOrder() public {
        uint256 id = _fundAndAccept();

        vm.expectEmit(address(escrow));
        emit GrantEscrow.Released(id, 0, 10_000e6, "milestone 1: repository public, CI green", reviewer);
        vm.prank(reviewer);
        escrow.release(id, "milestone 1: repository public, CI green");

        vm.expectEmit(address(escrow));
        emit GrantEscrow.Released(id, 1, 15_000e6, "milestone 2: testnet deploy verified on Routescan", reviewer);
        vm.prank(reviewer);
        escrow.release(id, "milestone 2: testnet deploy verified on Routescan");

        assertEq(usd.balanceOf(grantee), 25_000e6);
        assertEq(escrow.remainder(id), 5_000e6);
        GrantEscrow.Milestone memory m0 = escrow.milestone(id, 0);
        assertTrue(m0.released);
        assertEq(m0.note, "milestone 1: repository public, CI green");
        GrantEscrow.Milestone memory m1 = escrow.milestone(id, 1);
        assertTrue(m1.released);
        assertEq(m1.note, "milestone 2: testnet deploy verified on Routescan");
        GrantEscrow.Milestone memory m2 = escrow.milestone(id, 2);
        assertFalse(m2.released);
        assertEq(m2.note, "");
        assertEq(escrow.grant(id).nextMilestone, 2);

        vm.prank(reviewer);
        escrow.release(id, "milestone 3: final report");
        assertEq(usd.balanceOf(grantee), TOTAL);
        assertEq(usd.balanceOf(address(escrow)), 0);
        assertEq(escrow.remainder(id), 0);
        assertFalse(escrow.canRelease(id));
        vm.prank(reviewer);
        vm.expectRevert(abi.encodeWithSelector(GrantEscrow.NothingLeft.selector, id));
        escrow.release(id, "milestone 4");
    }

    function test_release_refusesAnEmptyNote() public {
        uint256 id = _fundAndAccept();
        vm.prank(reviewer);
        vm.expectRevert(GrantEscrow.EmptyNote.selector);
        escrow.release(id, "");
        assertEq(usd.balanceOf(grantee), 0);
    }

    function test_release_byNonReviewer_refused() public {
        uint256 id = _fundAndAccept();
        bytes32 role = escrow.REVIEWER_ROLE();
        address[3] memory notReviewers = [stranger, funder, grantee];
        for (uint256 i = 0; i < notReviewers.length; i++) {
            vm.prank(notReviewers[i]);
            vm.expectRevert(
                abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, notReviewers[i], role)
            );
            escrow.release(id, "milestone 1");
        }
        // The admin holds the slow role, not the reviewer's: it cannot release either.
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, role));
        escrow.release(id, "milestone 1");
        assertEq(usd.balanceOf(grantee), 0);
        assertEq(usd.balanceOf(address(escrow)), TOTAL);
    }

    // ---- the remainder ----

    function test_cancel_returnsTheRemainderToTheFunder_afterSomeReleases() public {
        uint256 id = _fundAndAccept();
        vm.prank(reviewer);
        escrow.release(id, "milestone 1");
        uint256 funderBefore = usd.balanceOf(funder);

        vm.expectEmit(address(escrow));
        emit GrantEscrow.Cancelled(id, 20_000e6, "grantee withdrew from the programme", reviewer);
        vm.prank(reviewer);
        escrow.cancel(id, "grantee withdrew from the programme");

        assertEq(usd.balanceOf(funder), funderBefore + 20_000e6);
        assertEq(usd.balanceOf(grantee), 10_000e6, "released money is never clawed back");
        assertEq(usd.balanceOf(address(escrow)), 0);
        assertEq(escrow.remainder(id), 0);
        assertTrue(escrow.grant(id).cancelled);

        vm.prank(reviewer);
        vm.expectRevert(abi.encodeWithSelector(GrantEscrow.GrantCancelled.selector, id));
        escrow.release(id, "milestone 2");
        vm.prank(reviewer);
        vm.expectRevert(abi.encodeWithSelector(GrantEscrow.GrantCancelled.selector, id));
        escrow.cancel(id, "again");
    }

    function test_cancel_beforeAcceptance_returnsEverything() public {
        uint256 id = _fund();
        vm.prank(reviewer);
        escrow.cancel(id, "grantee never accepted");
        assertEq(usd.balanceOf(funder), 1_000_000e6);
        _valid(grantee);
        vm.prank(grantee);
        vm.expectRevert(abi.encodeWithSelector(GrantEscrow.GrantCancelled.selector, id));
        escrow.accept(id);
    }

    function test_cancel_refusals() public {
        uint256 id = _fundAndAccept();
        bytes32 role = escrow.REVIEWER_ROLE();
        vm.prank(funder);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, funder, role));
        escrow.cancel(id, "I want my money back");
        vm.prank(reviewer);
        vm.expectRevert(GrantEscrow.EmptyNote.selector);
        escrow.cancel(id, "");

        for (uint256 i = 0; i < 3; i++) {
            vm.prank(reviewer);
            escrow.release(id, "done");
        }
        vm.prank(reviewer);
        vm.expectRevert(abi.encodeWithSelector(GrantEscrow.NothingLeft.selector, id));
        escrow.cancel(id, "nothing to return");
    }

    function test_remainder_staysPutWhenTheCredentialLapses_untilTheReviewerDecides() public {
        uint256 id = _fundAndAccept();
        vm.prank(reviewer);
        escrow.release(id, "milestone 1");
        mock.setStatus(grantee, REQUEST, EligibilityStatus.Revoked);

        // Nobody can move the remainder to the grantee while the credential is revoked...
        vm.prank(reviewer);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, grantee, REQUEST));
        escrow.release(id, "milestone 2");
        assertEq(usd.balanceOf(address(escrow)), 20_000e6);

        // ...the reviewer may wait for it to come back...
        _valid(grantee);
        vm.prank(reviewer);
        escrow.release(id, "milestone 2: credential restored, work reviewed");
        assertEq(usd.balanceOf(grantee), 25_000e6);

        // ...or end the grant and send what is left to the funder.
        mock.setStatus(grantee, REQUEST, EligibilityStatus.Revoked);
        vm.prank(reviewer);
        escrow.cancel(id, "credential revoked a second time; programme closed");
        assertEq(usd.balanceOf(funder), 1_000_000e6 - 25_000e6);
        assertEq(usd.balanceOf(address(escrow)), 0);
    }

    function test_twoGrantsDoNotMix() public {
        uint256 a = _fundAndAccept();
        address other = makeAddr("otherGrantee");
        uint256[] memory one = new uint256[](1);
        one[0] = 1_000e6;
        vm.prank(funder);
        uint256 b = escrow.fund(other, IERC20(address(usd)), 1_000e6, one);
        assertEq(b, 2);
        _valid(other);
        vm.prank(other);
        escrow.accept(b);
        vm.prank(reviewer);
        escrow.release(b, "small grant, one tranche");
        assertEq(usd.balanceOf(other), 1_000e6);
        assertEq(escrow.remainder(a), TOTAL);
        assertEq(escrow.remainder(b), 0);
        assertEq(usd.balanceOf(address(escrow)), TOTAL);
    }

    // ---- the admin pattern: timelock as admin, a Safe as reviewer ----

    function test_adminBehindTimelock_reviewerActsAtOnce() public {
        address safe = makeAddr("safe");
        address[] memory proposers = new address[](1);
        proposers[0] = safe;
        TimelockController timelock = new TimelockController(2 days, proposers, proposers, address(0));
        GrantEscrow e = new GrantEscrow(GrantEscrow.Roles({ admin: address(timelock), reviewer: safe }), mock, REQUEST);
        vm.prank(funder);
        usd.approve(address(e), TOTAL);
        vm.prank(funder);
        uint256 id = e.fund(grantee, IERC20(address(usd)), TOTAL, tranches);
        _valid(grantee);
        vm.prank(grantee);
        e.accept(id);

        // The Safe releases without delay.
        vm.prank(safe);
        e.release(id, "milestone 1");
        assertEq(usd.balanceOf(grantee), 10_000e6);

        // The Safe cannot repoint the gate directly; that goes through the timelock and waits.
        vm.prank(safe);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, safe, bytes32(0))
        );
        e.setRequestId(708);
        bytes memory data = abi.encodeCall(e.setRequestId, (708));
        vm.prank(safe);
        timelock.schedule(address(e), 0, data, bytes32(0), bytes32("rid"), 2 days);
        vm.warp(block.timestamp + 2 days);
        vm.prank(safe);
        timelock.execute(address(e), 0, data, bytes32(0), bytes32("rid"));
        assertEq(e.requestId(), 708);
        // Under the new recipe the grantee holds no proof: the next release waits.
        vm.prank(safe);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, grantee, 708));
        e.release(id, "milestone 2");
    }

    // ---- fuzz: every tranche adds up, and the escrow ends empty ----

    function testFuzz_releaseAll_sumsToTheDeposit(uint256[6] memory raw, uint8 countRaw) public {
        uint256 count = bound(countRaw, 1, 6);
        uint256[] memory ts = new uint256[](count);
        uint256 total;
        for (uint256 i = 0; i < count; i++) {
            ts[i] = bound(raw[i], 1, 100_000e6);
            total += ts[i];
        }
        vm.prank(funder);
        uint256 id = escrow.fund(grantee, IERC20(address(usd)), total, ts);
        _valid(grantee);
        vm.prank(grantee);
        escrow.accept(id);
        uint256 granteeBefore = usd.balanceOf(grantee);
        for (uint256 i = 0; i < count; i++) {
            assertEq(escrow.remainder(id), total - escrow.grant(id).released);
            vm.prank(reviewer);
            escrow.release(id, "tranche");
        }
        assertEq(usd.balanceOf(grantee) - granteeBefore, total);
        assertEq(escrow.remainder(id), 0);
        assertEq(usd.balanceOf(address(escrow)), 0);
    }
}
