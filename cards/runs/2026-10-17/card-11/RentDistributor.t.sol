// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { PropertyUnits } from "../src/PropertyUnits.sol";
import { RentDistributor } from "../src/RentDistributor.sol";
import { MockStable } from "./mocks/MockStable.sol";

/// @notice The distributor: the claim gate in five states, the arithmetic (exact shares, dust, a
/// zero holder, a holder who bought after the snapshot), and the refusals.
contract RentDistributorTest is GatedTest {
    uint64 internal constant REQUEST = 708;
    uint256 internal constant PROPERTY = 1;

    PropertyUnits internal units;
    RentDistributor internal rent;
    MockStable internal stable;
    address internal admin = makeAddr("admin");
    address internal issuer = makeAddr("issuer");
    address internal manager = makeAddr("manager");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    function setUp() public {
        _deployMock();
        vm.warp(1_800_000_000);
        units = new PropertyUnits("u", PropertyUnits.Roles({ admin: admin, issuer: issuer }), mock, REQUEST);
        stable = new MockStable();
        rent = new RentDistributor(
            units, stable, RentDistributor.Roles({ admin: admin, manager: manager }), mock, REQUEST
        );
        vm.prank(issuer);
        units.openProperty(PROPERTY, 1_000, keccak256("terms"));
        stable.mint(manager, 1_000_000e6);
        vm.prank(manager);
        stable.approve(address(rent), type(uint256).max);
    }

    function _valid(address who) internal {
        mock.setStatus(who, REQUEST, EligibilityStatus.Valid);
    }

    function _issue(address to, uint256 amount) internal {
        _valid(to);
        vm.prank(issuer);
        units.issue(PROPERTY, to, amount);
    }

    function _deposit(uint256 amount) internal returns (uint256 roundId) {
        vm.warp(block.timestamp + 1); // the snapshot is the second before the deposit; close this one first
        vm.prank(manager);
        roundId = rent.deposit(PROPERTY, amount);
    }

    // ---- construction ----

    function test_constructorRefusals() public {
        vm.expectRevert(RentDistributor.ZeroAdmin.selector);
        new RentDistributor(
            units, stable, RentDistributor.Roles({ admin: address(0), manager: manager }), mock, REQUEST
        );
        vm.expectRevert(RentDistributor.ZeroAddress.selector);
        new RentDistributor(
            PropertyUnits(address(0)), stable, RentDistributor.Roles({ admin: admin, manager: manager }), mock, REQUEST
        );
        RentDistributor r = new RentDistributor(
            units, stable, RentDistributor.Roles({ admin: admin, manager: address(0) }), mock, REQUEST
        );
        assertTrue(r.hasRole(r.MANAGER_ROLE(), admin));
    }

    // ---- the gate on claim, five states ----

    function test_claim_revertsInAllInvalidStates() public {
        _issue(alice, 100);
        uint256 roundId = _deposit(1_000e6);
        assertRevertsForAllInvalidStates(address(rent), abi.encodeCall(rent.claim, (roundId)), alice, REQUEST);
        assertEq(stable.balanceOf(alice), 1_000e6, "only the Valid call should have paid");
    }

    function test_claim_lapsedHolderWaitsThenIsPaid() public {
        _issue(alice, 60);
        _issue(bob, 40);
        uint256 roundId = _deposit(1_000e6);
        mock.setValidUntil(alice, REQUEST, uint64(block.timestamp));
        assertEq(rent.claimable(roundId, alice), 600e6, "claimable does not consult the gate");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, REQUEST));
        rent.claim(roundId);
        _valid(alice);
        vm.prank(alice);
        assertEq(rent.claim(roundId), 600e6);
        assertEq(stable.balanceOf(alice), 600e6);
    }

    // ---- arithmetic ----

    function test_shares_exact() public {
        _issue(alice, 500);
        _issue(bob, 300);
        _issue(carol, 200);
        uint256 roundId = _deposit(10_000e6);
        RentDistributor.Round memory r = rent.round(roundId);
        assertEq(r.totalUnits, 1_000);
        assertEq(r.amount, 10_000e6);
        vm.prank(alice);
        assertEq(rent.claim(roundId), 5_000e6);
        vm.prank(bob);
        assertEq(rent.claim(roundId), 3_000e6);
        vm.prank(carol);
        assertEq(rent.claim(roundId), 2_000e6);
        assertEq(rent.unclaimed(roundId), 0);
        assertEq(stable.balanceOf(address(rent)), 0);
    }

    function test_shares_dustStaysInTheContract() public {
        _issue(alice, 1);
        _issue(bob, 1);
        _issue(carol, 1);
        uint256 roundId = _deposit(100); // 100 smallest units over 3 holders: 33 each, 1 of dust
        vm.prank(alice);
        assertEq(rent.claim(roundId), 33);
        vm.prank(bob);
        assertEq(rent.claim(roundId), 33);
        vm.prank(carol);
        assertEq(rent.claim(roundId), 33);
        assertEq(rent.unclaimed(roundId), 1, "the dust");
        assertEq(stable.balanceOf(address(rent)), 1);
        assertEq(rent.claimable(roundId, alice), 0, "claimed once");
    }

    function test_zeroHolder_refused() public {
        _issue(alice, 100);
        _valid(dave); // eligible, holds nothing
        uint256 roundId = _deposit(1_000e6);
        assertEq(rent.claimable(roundId, dave), 0);
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor.NothingToClaim.selector, roundId, dave));
        rent.claim(roundId);
    }

    function test_buyerAfterSnapshotGetsNothing_sellerKeepsShare() public {
        _issue(alice, 100);
        _valid(bob);
        uint256 roundId = _deposit(1_000e6);
        // In the deposit's own second, on purpose (see the fork rehearsal of 17 October).
        vm.prank(alice);
        units.safeTransferFrom(alice, bob, PROPERTY, 100, "");
        assertEq(rent.claimable(roundId, bob), 0);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor.NothingToClaim.selector, roundId, bob));
        rent.claim(roundId);
        vm.prank(alice);
        assertEq(rent.claim(roundId), 1_000e6, "the seller held the units at the snapshot");
    }

    function test_twoRoundsTwoProperties_doNotMix() public {
        _issue(alice, 100);
        vm.prank(issuer);
        units.openProperty(2, 10, keccak256("second"));
        _valid(bob);
        vm.prank(issuer);
        units.issue(2, bob, 10);
        uint256 r1 = _deposit(1_000e6);
        vm.prank(manager);
        uint256 r2 = rent.deposit(2, 50e6);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor.NothingToClaim.selector, r2, alice));
        rent.claim(r2);
        vm.prank(bob);
        assertEq(rent.claim(r2), 50e6);
        vm.prank(alice);
        assertEq(rent.claim(r1), 1_000e6);
    }

    // ---- refusals ----

    function test_claim_refusals() public {
        _issue(alice, 100);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor.UnknownRound.selector, 1));
        rent.claim(1);
        uint256 roundId = _deposit(1_000e6);
        vm.prank(alice);
        rent.claim(roundId);
        assertTrue(rent.hasClaimed(roundId, alice));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor.AlreadyClaimed.selector, roundId, alice));
        rent.claim(roundId);
    }

    function test_deposit_refusals() public {
        vm.startPrank(manager);
        vm.expectRevert(RentDistributor.ZeroAmount.selector);
        rent.deposit(PROPERTY, 0);
        vm.expectRevert(abi.encodeWithSelector(RentDistributor.NoUnits.selector, PROPERTY));
        rent.deposit(PROPERTY, 1e6);
        vm.stopPrank();
        _issue(alice, 1);
        vm.prank(manager); // units issued this second are not in the previous second's total
        vm.expectRevert(abi.encodeWithSelector(RentDistributor.NoUnits.selector, PROPERTY));
        rent.deposit(PROPERTY, 1e6);
        bytes32 role = rent.MANAGER_ROLE();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        rent.deposit(PROPERTY, 1e6);
    }

    // ---- fuzz: claims never exceed the deposit, and the dust is smaller than the holder count ----

    function testFuzz_sharesSumWithinDust(uint16 a, uint16 b, uint16 c, uint64 amount) public {
        a = uint16(bound(a, 1, 1_000));
        b = uint16(bound(b, 0, 1_000 - a));
        c = uint16(bound(c, 0, 1_000 - a - b));
        amount = uint64(bound(amount, 1, 1_000_000e6));
        _issue(alice, a);
        if (b > 0) _issue(bob, b);
        if (c > 0) _issue(carol, c);
        uint256 roundId = _deposit(amount);
        uint256 paid;
        address[3] memory holders = [alice, bob, carol];
        for (uint256 i = 0; i < 3; i++) {
            uint256 due = rent.claimable(roundId, holders[i]);
            if (due == 0) continue;
            vm.prank(holders[i]);
            paid += rent.claim(roundId);
        }
        assertLe(paid, amount);
        assertLt(amount - paid, 3, "dust is less than one smallest unit per holder");
        assertEq(rent.unclaimed(roundId), amount - paid);
    }
}
