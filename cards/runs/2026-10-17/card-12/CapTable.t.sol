// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus, IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { CapTable } from "../src/CapTable.sol";

/// @notice Card 12, the register. Each class's gate in five credential states where the holder
/// acts (`requestTransfer`) and where a recipient is checked (`issue`, `approveTransfer`), a grant
/// to a wallet of the wrong class, the transfer flow with and without the board, the authorised
/// cap, and the admin pattern.
contract CapTableTest is GatedTest {
    CapTable internal register;
    uint64 internal constant ORDINARY = 18; // recipes/over-18
    uint64 internal constant SERIES_A = 708; // recipes/au-wholesale-investor
    uint64 internal constant SERIES_B = 100; // recipes/accredited-issuer, a third class in one test
    uint256 internal ordinary;
    uint256 internal seriesA;

    address internal admin = makeAddr("admin");
    address internal board = makeAddr("board");
    address internal founder = makeAddr("founder");
    address internal employee = makeAddr("employee");
    address internal investor = makeAddr("investor");
    address internal investor2 = makeAddr("investor2");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        _deployMock();
        register = new CapTable(CapTable.Roles({ admin: admin, board: board }), mock);
        vm.startPrank(admin);
        ordinary = register.createClass("Ordinary", ORDINARY, 10_000_000);
        seriesA = register.createClass("Series A Preference", SERIES_A, 2_000_000);
        vm.stopPrank();
        mock.setStatus(founder, ORDINARY, EligibilityStatus.Valid);
        mock.setStatus(employee, ORDINARY, EligibilityStatus.Valid);
        mock.setStatus(investor, SERIES_A, EligibilityStatus.Valid);
        mock.setStatus(investor2, SERIES_A, EligibilityStatus.Valid);
    }

    function _issue(uint256 classId, address to, uint256 amount) internal {
        vm.prank(board);
        register.issue(classId, to, amount);
    }

    function _expectAccessDenied(address who, bytes32 role) internal {
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, who, role));
    }

    // ---- construction and classes ----

    function test_roles_andClasses() public view {
        assertTrue(register.hasRole(register.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(register.hasRole(register.BOARD_ROLE(), board));
        assertFalse(register.hasRole(register.BOARD_ROLE(), admin));
        assertEq(register.classCount(), 2);
        CapTable.ShareClass memory c = register.shareClass(seriesA);
        assertEq(c.name, "Series A Preference");
        assertEq(c.requestId, SERIES_A);
        assertEq(c.authorised, 2_000_000);
        assertEq(c.issued, 0);
        assertEq(register.requestId(), ORDINARY, "requestId() answers for class 1, for the local loop");
    }

    function test_roles_boardFallsBackToAdmin_zeroAdminRefused() public {
        CapTable r = new CapTable(CapTable.Roles({ admin: admin, board: address(0) }), mock);
        assertTrue(r.hasRole(r.BOARD_ROLE(), admin));
        vm.expectRevert(CapTable.ZeroAdmin.selector);
        new CapTable(CapTable.Roles({ admin: address(0), board: board }), mock);
    }

    function test_classes_onlyAdminCreatesAndChanges() public {
        _expectAccessDenied(board, bytes32(0));
        vm.prank(board);
        register.createClass("Series B", SERIES_B, 1);
        vm.prank(admin);
        vm.expectRevert(CapTable.EmptyName.selector);
        register.createClass("", SERIES_B, 1);
        vm.expectRevert(abi.encodeWithSelector(CapTable.NoSuchClass.selector, 9));
        register.shareClass(9);
    }

    // ---- the gate, five states per class, where the holder acts ----

    function test_gate_ordinaryHolder_requestTransfer_fiveStates() public {
        _issue(ordinary, founder, 1_000);
        assertRevertsForAllInvalidStates(
            address(register), abi.encodeCall(register.requestTransfer, (ordinary, employee, 10)), founder, ORDINARY
        );
    }

    function test_gate_seriesAHolder_requestTransfer_fiveStates() public {
        _issue(seriesA, investor, 1_000);
        assertRevertsForAllInvalidStates(
            address(register), abi.encodeCall(register.requestTransfer, (seriesA, investor2, 10)), investor, SERIES_A
        );
    }

    // ---- the gate, five states per class, where a recipient is checked ----

    function test_gate_issue_recipientInFiveStates_bothClasses() public {
        EligibilityStatus[4] memory states = invalidStates();
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(stranger, ORDINARY, states[i]);
            vm.prank(board);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, stranger, ORDINARY));
            register.issue(ordinary, stranger, 1);
            mock.setStatus(stranger, SERIES_A, states[i]);
            vm.prank(board);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, stranger, SERIES_A));
            register.issue(seriesA, stranger, 1);
        }
        mock.setStatus(stranger, ORDINARY, EligibilityStatus.Valid);
        _issue(ordinary, stranger, 1);
        mock.setStatus(stranger, SERIES_A, EligibilityStatus.Valid);
        _issue(seriesA, stranger, 1);
        assertEq(register.balanceOf(ordinary, stranger), 1);
        assertEq(register.balanceOf(seriesA, stranger), 1);
    }

    function test_gate_issue_expiryIsReadAtTheMoment() public {
        mock.setValidUntil(stranger, ORDINARY, uint64(block.timestamp + 1 days));
        _issue(ordinary, stranger, 5);
        vm.warp(block.timestamp + 1 days);
        vm.prank(board);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, stranger, ORDINARY));
        register.issue(ordinary, stranger, 5);
    }

    // ---- a grant to a wallet of the wrong class ----

    function test_wrongClass_founderValidOnOrdinaryIsRefusedSeriesA() public {
        assertTrue(register.isEligibleFor(ordinary, founder));
        assertFalse(register.isEligibleFor(seriesA, founder));
        vm.prank(board);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, founder, SERIES_A));
        register.issue(seriesA, founder, 100);
        vm.prank(board);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, investor, ORDINARY));
        register.issue(ordinary, investor, 100);
    }

    function test_wrongClass_aThirdClassOnAThirdRecipe() public {
        vm.prank(admin);
        uint256 seriesB = register.createClass("Series B Preference", SERIES_B, 500_000);
        // Valid for the wholesale recipe says nothing about the accredited-issuer recipe.
        vm.prank(board);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, investor, SERIES_B));
        register.issue(seriesB, investor, 1);
        mock.setStatus(investor, SERIES_B, EligibilityStatus.Valid);
        _issue(seriesB, investor, 1);
        assertEq(register.balanceOf(seriesB, investor), 1);
    }

    function test_wrongClass_rebindingAClassAppliesToTheNextAction() public {
        _issue(ordinary, founder, 100);
        vm.prank(admin);
        register.setClassRequestId(ordinary, SERIES_B);
        assertEq(register.balanceOf(ordinary, founder), 100, "shares stay");
        vm.prank(founder);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, founder, SERIES_B));
        register.requestTransfer(ordinary, employee, 1);
    }

    // ---- issuing and the authorised cap ----

    function test_issue_onlyBoard_withinAuthorised() public {
        _expectAccessDenied(founder, register.BOARD_ROLE());
        vm.prank(founder);
        register.issue(ordinary, founder, 1);
        _issue(seriesA, investor, 2_000_000);
        vm.prank(board);
        vm.expectRevert(abi.encodeWithSelector(CapTable.ExceedsAuthorised.selector, seriesA, 2_000_001, 2_000_000));
        register.issue(seriesA, investor2, 1);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(CapTable.BelowIssued.selector, seriesA, 2_000_000, 1_000));
        register.setAuthorised(seriesA, 1_000);
        vm.prank(admin);
        register.setAuthorised(seriesA, 3_000_000);
        _issue(seriesA, investor2, 1);
        assertEq(register.shareClass(seriesA).issued, 2_000_001);
    }

    // ---- transfers: refused without the board, allowed with it ----

    function test_transfer_refusedWithoutBoardApproval_allowedWithIt() public {
        _issue(seriesA, investor, 1_000);
        vm.prank(investor);
        uint256 id = register.requestTransfer(seriesA, investor2, 400);
        assertEq(id, 1);
        assertEq(register.balanceOf(ordinary, investor), 0, "no other class touched");
        assertEq(register.balanceOf(seriesA, investor), 1_000, "nothing moves on a request");
        assertTrue(register.canApprove(id));

        // The holder, the recipient and a stranger cannot approve; the shares stay put.
        address[3] memory notBoard = [investor, investor2, stranger];
        for (uint256 i = 0; i < notBoard.length; ++i) {
            _expectAccessDenied(notBoard[i], register.BOARD_ROLE());
            vm.prank(notBoard[i]);
            register.approveTransfer(id, "minute 7");
        }
        assertEq(register.balanceOf(seriesA, investor2), 0);

        vm.prank(board);
        vm.expectRevert(CapTable.EmptyResolution.selector);
        register.approveTransfer(id, "");

        vm.expectEmit(address(register));
        emit CapTable.TransferApproved(id, board, "board minute 2026-10-17/7");
        vm.prank(board);
        register.approveTransfer(id, "board minute 2026-10-17/7");
        assertEq(register.balanceOf(seriesA, investor), 600);
        assertEq(register.balanceOf(seriesA, investor2), 400);
        CapTable.TransferRequest memory t = register.transferRequest(id);
        assertEq(uint8(t.status), uint8(CapTable.TransferStatus.Approved));
        assertEq(t.resolution, "board minute 2026-10-17/7");

        vm.prank(board);
        vm.expectRevert(
            abi.encodeWithSelector(
                CapTable.WrongStatus.selector, id, CapTable.TransferStatus.Pending, CapTable.TransferStatus.Approved
            )
        );
        register.approveTransfer(id, "again");
    }

    function test_transfer_recipientCheckedAtApproval_inFourInvalidStates() public {
        _issue(seriesA, investor, 1_000);
        vm.prank(investor);
        uint256 id = register.requestTransfer(seriesA, investor2, 100);
        EligibilityStatus[4] memory states = invalidStates();
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(investor2, SERIES_A, states[i]);
            assertFalse(register.canApprove(id));
            vm.prank(board);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, investor2, SERIES_A));
            register.approveTransfer(id, "minute");
        }
        mock.setStatus(investor2, SERIES_A, EligibilityStatus.Valid);
        vm.prank(board);
        register.approveTransfer(id, "minute");
        assertEq(register.balanceOf(seriesA, investor2), 100);
    }

    function test_transfer_holderIsNotRecheckedAtApproval() public {
        // A holder whose credential lapsed after asking still leaves the register if the board says so.
        _issue(seriesA, investor, 1_000);
        vm.prank(investor);
        uint256 id = register.requestTransfer(seriesA, investor2, 1_000);
        mock.setStatus(investor, SERIES_A, EligibilityStatus.Revoked);
        vm.prank(board);
        register.approveTransfer(id, "exit of a lapsed holder");
        assertEq(register.balanceOf(seriesA, investor), 0);
    }

    function test_transfer_rejectCancel_andTheRefusals() public {
        _issue(ordinary, founder, 100);
        vm.startPrank(founder);
        vm.expectRevert(CapTable.SelfTransfer.selector);
        register.requestTransfer(ordinary, founder, 1);
        vm.expectRevert(abi.encodeWithSelector(CapTable.InsufficientShares.selector, ordinary, founder, 100, 101));
        register.requestTransfer(ordinary, employee, 101);
        vm.expectRevert(CapTable.ZeroAmount.selector);
        register.requestTransfer(ordinary, employee, 0);
        uint256 a = register.requestTransfer(ordinary, employee, 10);
        uint256 b = register.requestTransfer(ordinary, employee, 20);
        vm.stopPrank();

        vm.prank(board);
        register.rejectTransfer(a, "not in the company's interest");
        assertEq(uint8(register.transferRequest(a).status), uint8(CapTable.TransferStatus.Rejected));

        vm.prank(employee);
        vm.expectRevert(abi.encodeWithSelector(CapTable.NotTheHolder.selector, b, employee));
        register.cancelTransfer(b);
        vm.prank(founder);
        register.cancelTransfer(b);
        vm.prank(board);
        vm.expectRevert(
            abi.encodeWithSelector(
                CapTable.WrongStatus.selector, b, CapTable.TransferStatus.Pending, CapTable.TransferStatus.Cancelled
            )
        );
        register.approveTransfer(b, "minute");
        vm.expectRevert(abi.encodeWithSelector(CapTable.NoSuchTransfer.selector, 9));
        register.transferRequest(9);
        assertEq(register.balanceOf(ordinary, founder), 100);
    }

    function test_transfer_approvalFailsWhenTheSharesAreGone() public {
        _issue(ordinary, founder, 100);
        vm.startPrank(founder);
        uint256 a = register.requestTransfer(ordinary, employee, 100);
        uint256 b = register.requestTransfer(ordinary, employee, 100);
        vm.stopPrank();
        vm.startPrank(board);
        register.approveTransfer(a, "minute 1");
        vm.expectRevert(abi.encodeWithSelector(CapTable.InsufficientShares.selector, ordinary, founder, 0, 100));
        register.approveTransfer(b, "minute 2");
        vm.stopPrank();
    }

    // ---- the nominee role is a role, not a door ----

    function test_nominee_onlyAnAppointedContractMayUseThePath() public {
        _expectAccessDenied(board, register.NOMINEE_ROLE());
        vm.prank(board);
        register.issueToNominee(ordinary, employee, 1);
        _expectAccessDenied(stranger, register.NOMINEE_ROLE());
        vm.prank(stranger);
        register.releaseFromNominee(ordinary, stranger, 1);
    }

    // ---- the admin pattern ----

    function test_admin_timelockCreatesAClassAfterTheDelay() public {
        vm.warp(1_800_000_000);
        address safe = makeAddr("safe");
        address[] memory who = new address[](1);
        who[0] = safe;
        TimelockController timelock = new TimelockController(2 days, who, who, address(0));
        CapTable r = new CapTable(CapTable.Roles({ admin: address(timelock), board: safe }), mock);
        bytes memory data = abi.encodeCall(r.createClass, ("Ordinary", ORDINARY, 1_000));
        vm.prank(safe);
        timelock.schedule(address(r), 0, data, bytes32(0), bytes32("c1"), 2 days);
        vm.prank(safe);
        vm.expectRevert();
        timelock.execute(address(r), 0, data, bytes32(0), bytes32("c1"));
        vm.warp(block.timestamp + 2 days);
        vm.prank(safe);
        timelock.execute(address(r), 0, data, bytes32(0), bytes32("c1"));
        assertEq(r.classCount(), 1);
        vm.prank(safe);
        r.issue(1, founder, 10); // the Safe is the board, at once
        assertEq(r.balanceOf(1, founder), 10);
    }

    function test_admin_setVerifier() public {
        vm.prank(board);
        _expectAccessDenied(board, bytes32(0));
        register.setVerifier(mock);
        vm.prank(admin);
        vm.expectRevert(CapTable.ZeroVerifier.selector);
        register.setVerifier(IRedbellyVerifier(address(0)));
    }
}
