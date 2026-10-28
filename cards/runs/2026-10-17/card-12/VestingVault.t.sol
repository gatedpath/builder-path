// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { CapTable } from "../src/CapTable.sol";
import { VestingVault } from "../src/VestingVault.sol";

/// @notice Card 12, the vault. A grant through the nominee path, the beneficiary's gate at the
/// grant and at every release, release before and after the cliff, the linear line to the end,
/// revocation, and a fuzz over the schedule's shape.
contract VestingVaultTest is GatedTest {
    CapTable internal register;
    VestingVault internal vault;
    uint64 internal constant ORDINARY = 18;
    uint64 internal constant SERIES_A = 708;
    uint256 internal ordinary;
    uint256 internal seriesA;
    uint64 internal constant YEAR = 365 days;

    address internal admin = makeAddr("admin");
    address internal board = makeAddr("board");
    address internal employee = makeAddr("employee");
    address internal investor = makeAddr("investor");
    address internal stranger = makeAddr("stranger");
    uint64 internal start;

    function setUp() public {
        vm.warp(1_800_000_000);
        start = uint64(block.timestamp);
        _deployMock();
        register = new CapTable(CapTable.Roles({ admin: admin, board: board }), mock);
        vault = new VestingVault(register);
        vm.startPrank(admin);
        ordinary = register.createClass("Ordinary", ORDINARY, 10_000_000);
        seriesA = register.createClass("Series A Preference", SERIES_A, 2_000_000);
        register.grantRole(register.NOMINEE_ROLE(), address(vault));
        vm.stopPrank();
        mock.setStatus(employee, ORDINARY, EligibilityStatus.Valid);
        mock.setStatus(investor, SERIES_A, EligibilityStatus.Valid);
    }

    /// @dev 48,000 ordinary shares over four years with a one-year cliff.
    function _grant() internal returns (uint256 id) {
        vm.prank(board);
        id = vault.grant(ordinary, employee, 48_000, start, YEAR, 4 * YEAR);
    }

    // ---- the grant ----

    function test_grant_issuesToTheVaultForTheBeneficiary() public {
        vm.expectEmit(address(register));
        emit CapTable.IssuedToNominee(ordinary, address(vault), employee, 48_000);
        uint256 id = _grant();
        assertEq(id, 1);
        assertEq(register.balanceOf(ordinary, address(vault)), 48_000);
        assertEq(register.balanceOf(ordinary, employee), 0);
        assertEq(register.shareClass(ordinary).issued, 48_000);
        VestingVault.Schedule memory s = vault.schedule(id);
        assertEq(s.beneficiary, employee);
        assertEq(s.total, 48_000);
        assertEq(s.released, 0);
        assertFalse(s.revoked);
    }

    function test_grant_onlyTheRegistersBoard_andTheShapeChecks() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(VestingVault.NotBoard.selector, stranger));
        vault.grant(ordinary, employee, 1, start, 0, YEAR);
        vm.startPrank(board);
        vm.expectRevert(VestingVault.BadSchedule.selector);
        vault.grant(ordinary, employee, 0, start, 0, YEAR);
        vm.expectRevert(VestingVault.BadSchedule.selector);
        vault.grant(ordinary, employee, 1, start, 0, 0);
        vm.expectRevert(VestingVault.BadSchedule.selector);
        vault.grant(ordinary, employee, 1, start, YEAR + 1, YEAR);
        vm.expectRevert(abi.encodeWithSelector(CapTable.ExceedsAuthorised.selector, ordinary, 10_000_001, 10_000_000));
        vault.grant(ordinary, employee, 10_000_001, start, 0, YEAR);
        vm.stopPrank();
        // A new board member granted by the admin may grant at once: the vault reads the role live.
        bytes32 boardRole = register.BOARD_ROLE();
        vm.prank(admin);
        register.grantRole(boardRole, stranger);
        vm.prank(stranger);
        vault.grant(ordinary, employee, 1, start, 0, YEAR);
    }

    // ---- the beneficiary's gate at the grant: five states, and the wrong class ----

    function test_grant_beneficiaryInFiveStates() public {
        EligibilityStatus[4] memory states = invalidStates();
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(stranger, ORDINARY, states[i]);
            vm.prank(board);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, stranger, ORDINARY));
            vault.grant(ordinary, stranger, 100, start, 0, YEAR);
        }
        mock.setStatus(stranger, ORDINARY, EligibilityStatus.Valid);
        vm.prank(board);
        vault.grant(ordinary, stranger, 100, start, 0, YEAR);
        assertEq(vault.scheduleCount(), 1);
    }

    function test_grant_toAWalletOfTheWrongClass() public {
        // The investor passes the Series A gate and nothing else; an ordinary grant is refused,
        // and an employee cannot be granted preference shares.
        vm.prank(board);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, investor, ORDINARY));
        vault.grant(ordinary, investor, 100, start, 0, YEAR);
        vm.prank(board);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, employee, SERIES_A));
        vault.grant(seriesA, employee, 100, start, 0, YEAR);
        assertEq(register.shareClass(ordinary).issued, 0);
        assertEq(register.shareClass(seriesA).issued, 0);
    }

    // ---- release before and after the cliff ----

    function test_release_beforeTheCliffNothing() public {
        uint256 id = _grant();
        assertEq(vault.releasable(id), 0);
        vm.prank(employee);
        vm.expectRevert(abi.encodeWithSelector(VestingVault.NothingVested.selector, id));
        vault.release(id);
        vm.warp(start + YEAR - 1);
        assertEq(vault.vestedAt(id, block.timestamp), 0);
        vm.prank(employee);
        vm.expectRevert(abi.encodeWithSelector(VestingVault.NothingVested.selector, id));
        vault.release(id);
        assertEq(register.balanceOf(ordinary, employee), 0);
    }

    function test_release_atTheCliffAQuarter_thenLinear_thenAll() public {
        uint256 id = _grant();
        vm.warp(start + YEAR);
        assertEq(vault.releasable(id), 12_000, "a quarter vests at the one-year cliff");
        vm.expectEmit(address(vault));
        emit VestingVault.Released(id, employee, 12_000);
        vm.prank(employee);
        vault.release(id);
        assertEq(register.balanceOf(ordinary, employee), 12_000);
        assertEq(register.balanceOf(ordinary, address(vault)), 36_000);

        vm.warp(start + 2 * YEAR + YEAR / 2);
        assertEq(vault.releasable(id), 30_000 - 12_000);
        vm.prank(employee);
        vault.release(id);
        assertEq(register.balanceOf(ordinary, employee), 30_000);

        vm.warp(start + 10 * YEAR);
        vm.prank(employee);
        vault.release(id);
        assertEq(register.balanceOf(ordinary, employee), 48_000);
        assertEq(register.balanceOf(ordinary, address(vault)), 0);
        assertEq(vault.schedule(id).released, 48_000);
        vm.prank(employee);
        vm.expectRevert(abi.encodeWithSelector(VestingVault.NothingVested.selector, id));
        vault.release(id);
    }

    function test_release_onlyTheBeneficiary() public {
        uint256 id = _grant();
        vm.warp(start + YEAR);
        vm.prank(board);
        vm.expectRevert(abi.encodeWithSelector(VestingVault.NotTheBeneficiary.selector, id, board));
        vault.release(id);
        vm.expectRevert(abi.encodeWithSelector(VestingVault.NoSuchSchedule.selector, 7));
        vault.release(7);
    }

    // ---- the gate again at every release ----

    function test_release_beneficiaryGatedAtRelease_fourInvalidStates() public {
        uint256 id = _grant();
        vm.warp(start + YEAR);
        EligibilityStatus[4] memory states = invalidStates();
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(employee, ORDINARY, states[i]);
            vm.prank(employee);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, employee, ORDINARY));
            vault.release(id);
        }
        assertEq(vault.schedule(id).released, 0, "a refused release counts nothing");
        assertEq(register.balanceOf(ordinary, address(vault)), 48_000, "the shares wait in the vault");
        mock.setStatus(employee, ORDINARY, EligibilityStatus.Valid);
        vm.prank(employee);
        vault.release(id);
        assertEq(register.balanceOf(ordinary, employee), 12_000);
    }

    function test_release_expiryBetweenReleases() public {
        uint256 id = _grant();
        mock.setValidUntil(employee, ORDINARY, start + 2 * YEAR);
        vm.warp(start + YEAR);
        vm.prank(employee);
        vault.release(id);
        vm.warp(start + 2 * YEAR);
        vm.prank(employee);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, employee, ORDINARY));
        vault.release(id);
    }

    // ---- revocation ----

    function test_revoke_keepsWhatVested_cancelsTheRest() public {
        uint256 id = _grant();
        vm.warp(start + 2 * YEAR);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(VestingVault.NotBoard.selector, stranger));
        vault.revoke(id, "left the company");
        vm.prank(board);
        vm.expectRevert(VestingVault.EmptyReason.selector);
        vault.revoke(id, "");
        vm.expectEmit(address(vault));
        emit VestingVault.Revoked(id, 24_000, board, "left the company 2026-10-17");
        vm.prank(board);
        vault.revoke(id, "left the company 2026-10-17");
        assertEq(register.shareClass(ordinary).issued, 24_000, "unvested shares cancelled on the register");
        assertEq(register.balanceOf(ordinary, address(vault)), 24_000);
        assertEq(vault.releasable(id), 24_000);
        vm.warp(start + 10 * YEAR);
        assertEq(vault.releasable(id), 24_000, "nothing more vests after revocation");
        vm.prank(employee);
        vault.release(id);
        assertEq(register.balanceOf(ordinary, employee), 24_000);
        assertEq(register.balanceOf(ordinary, address(vault)), 0);
        vm.prank(board);
        vm.expectRevert(abi.encodeWithSelector(VestingVault.AlreadyRevoked.selector, id));
        vault.revoke(id, "again");
    }

    function test_revoke_beforeTheCliffCancelsEverything() public {
        uint256 id = _grant();
        vm.warp(start + YEAR / 2);
        vm.prank(board);
        vault.revoke(id, "probation failed");
        assertEq(register.shareClass(ordinary).issued, 0);
        assertEq(vault.schedule(id).total, 0);
        vm.warp(start + 10 * YEAR);
        vm.prank(employee);
        vm.expectRevert(abi.encodeWithSelector(VestingVault.NothingVested.selector, id));
        vault.release(id);
    }

    // ---- the vault cannot ask for a transfer: it is a nominee, not a holder ----

    function test_vaultHoldingCannotBeTransferredByAnyone() public {
        _grant();
        vm.prank(address(vault));
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, address(vault), ORDINARY));
        register.requestTransfer(ordinary, stranger, 1);
    }

    // ---- fuzz: the line never goes down, never exceeds the total, and ends at the total ----

    function testFuzz_vesting_isMonotoneAndEndsAtTotal(
        uint256 total,
        uint64 cliff,
        uint64 duration,
        uint64 t1,
        uint64 t2
    ) public {
        total = bound(total, 1, 10_000_000);
        duration = uint64(bound(duration, 1, 20 * YEAR));
        cliff = uint64(bound(cliff, 0, duration));
        t1 = uint64(bound(t1, 0, 30 * YEAR));
        t2 = uint64(bound(t2, t1, 30 * YEAR));
        vm.prank(board);
        uint256 id = vault.grant(ordinary, employee, total, start, cliff, duration);
        uint256 v1 = vault.vestedAt(id, start + t1);
        uint256 v2 = vault.vestedAt(id, start + t2);
        assertLe(v1, v2);
        assertLe(v2, total);
        if (t1 < cliff) assertEq(v1, 0);
        assertEq(vault.vestedAt(id, start + duration), total);
        vm.warp(start + duration);
        vm.prank(employee);
        vault.release(id);
        assertEq(register.balanceOf(ordinary, employee), total);
        assertEq(register.balanceOf(ordinary, address(vault)), 0);
    }
}
