// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { GatedERC20 } from "../src/GatedERC20.sol";
import { TokenisedBond } from "../src/TokenisedBond.sol";
import { MockStable } from "./mocks/MockStable.sol";

/// @notice Project 5. Every gated function in five credential states, the coupon schedule, and
/// the accounting that decides who is owed what. The gate is bound to request id 708, the AU
/// wholesale investor recipe (recipes/au-wholesale-investor).
contract TokenisedBondTest is GatedTest {
    TokenisedBond internal bond;
    MockStable internal stable;

    uint64 internal constant REQUEST = 708;
    uint256 internal constant COUPON = 25e6; // 25.000000 of the stablecoin per whole unit per coupon
    uint64 internal constant PERIOD = 90 days;
    uint32 internal constant COUPONS = 4;
    uint64 internal firstCouponAt;

    address internal admin = makeAddr("admin");
    address internal pauser = makeAddr("pauser");
    address internal compliance = makeAddr("compliance");
    address internal issuerAdmin = makeAddr("issuerAdmin");
    address internal issuer = makeAddr("issuer");
    address internal agent = makeAddr("payingAgent");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    bytes32 internal constant WHY = keccak256("court order 2026-09-18");

    function setUp() public {
        _deployMock();
        stable = new MockStable();
        firstCouponAt = uint64(block.timestamp) + PERIOD;
        bond = new TokenisedBond(
            "Fixed Coupon Bond 2027",
            "FCB27",
            GatedERC20.Roles({ admin: admin, pauser: pauser, compliance: compliance, issuerAdmin: issuerAdmin }),
            mock,
            REQUEST,
            IERC20(address(stable)),
            COUPON,
            firstCouponAt,
            PERIOD,
            COUPONS,
            agent
        );
        vm.prank(issuerAdmin);
        bond.setIssuer(issuer, 0, uint64(block.timestamp + 730 days), 1_000_000e18);
        stable.mint(agent, 1_000_000_000e6);
        vm.prank(agent);
        stable.approve(address(bond), type(uint256).max);
    }

    function _valid(address who) internal {
        mock.setStatus(who, REQUEST, EligibilityStatus.Valid);
    }

    function _issue(address to, uint256 units) internal {
        _valid(to);
        vm.prank(issuer);
        bond.mint(to, units);
    }

    function _payCoupon(uint32 number) internal {
        vm.warp(bond.couponDueAt(number));
        vm.prank(agent);
        bond.payCoupon();
    }

    // ---- construction ----

    function test_construction_scheduleAndRoles() public view {
        assertEq(address(bond.stablecoin()), address(stable));
        assertEq(bond.couponPerUnit(), COUPON);
        assertEq(bond.couponDueAt(1), firstCouponAt);
        assertEq(bond.couponDueAt(4), firstCouponAt + 3 * PERIOD);
        assertEq(bond.totalCoupons(), COUPONS);
        assertTrue(bond.hasRole(bond.PAYING_AGENT_ROLE(), agent));
        assertFalse(bond.hasRole(bond.PAYING_AGENT_ROLE(), admin));
        assertEq(bond.requestId(), REQUEST);
    }

    function test_couponDueAt_refusesANumberOutsideTheSchedule() public {
        vm.expectRevert(abi.encodeWithSelector(TokenisedBond.NoSuchCoupon.selector, uint32(0)));
        bond.couponDueAt(0);
        vm.expectRevert(abi.encodeWithSelector(TokenisedBond.NoSuchCoupon.selector, uint32(5)));
        bond.couponDueAt(5);
    }

    function test_construction_payingAgentDefaultsToAdmin_andBadInputsRevert() public {
        GatedERC20.Roles memory r =
            GatedERC20.Roles({ admin: admin, pauser: address(0), compliance: address(0), issuerAdmin: address(0) });
        TokenisedBond b = new TokenisedBond(
            "B", "B", r, mock, REQUEST, IERC20(address(stable)), COUPON, firstCouponAt, PERIOD, COUPONS, address(0)
        );
        assertTrue(b.hasRole(b.PAYING_AGENT_ROLE(), admin));

        vm.expectRevert(TokenisedBond.ZeroStablecoin.selector);
        new TokenisedBond("B", "B", r, mock, REQUEST, IERC20(address(0)), COUPON, firstCouponAt, PERIOD, COUPONS, agent);
        vm.expectRevert(TokenisedBond.BadSchedule.selector);
        new TokenisedBond("B", "B", r, mock, REQUEST, IERC20(address(stable)), 0, firstCouponAt, PERIOD, COUPONS, agent);
        vm.expectRevert(TokenisedBond.BadSchedule.selector);
        new TokenisedBond("B", "B", r, mock, REQUEST, IERC20(address(stable)), COUPON, firstCouponAt, 0, COUPONS, agent);
        vm.expectRevert(TokenisedBond.BadSchedule.selector);
        new TokenisedBond("B", "B", r, mock, REQUEST, IERC20(address(stable)), COUPON, firstCouponAt, PERIOD, 0, agent);
    }

    function test_aBondIsIssued_notSubscribedTo() public {
        _valid(alice);
        vm.prank(alice);
        vm.expectRevert(GatedERC20.SubscriptionsClosed.selector);
        bond.subscribe();
        // Even if the admin opens subscriptions, the amount is zero: nobody mints a bond to themselves.
        vm.prank(admin);
        bond.setSubscriptionsOpen(true);
        vm.prank(alice);
        bond.subscribe();
        assertEq(bond.balanceOf(alice), 0);
        assertEq(bond.totalSupply(), 0);
    }

    // ---- the five states, on every gated function ----

    function test_mint_recipientInAllFiveStates() public {
        EligibilityStatus[4] memory states = invalidStates();
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(alice, REQUEST, states[i]);
            vm.prank(issuer);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, REQUEST));
            bond.mint(alice, 10e18);
        }
        _issue(alice, 10e18);
        assertEq(bond.balanceOf(alice), 10e18);
    }

    function test_transfer_bothPartiesInAllFiveStates() public {
        _issue(alice, 10e18);
        assertGatedPair(address(bond), abi.encodeCall(bond.transfer, (bob, 1e18)), alice, bob, REQUEST);
        assertEq(bond.balanceOf(bob), 2e18, "exactly the two both-Valid transfers should have landed");
    }

    function test_forceTransfer_recipientInAllFiveStates_senderNeedNotBeEligible() public {
        _issue(alice, 10e18);
        mock.setStatus(alice, REQUEST, EligibilityStatus.Revoked); // the reason compliance is moving the units
        EligibilityStatus[4] memory states = invalidStates();
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(bob, REQUEST, states[i]);
            vm.prank(compliance);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, bob, REQUEST));
            bond.forceTransfer(alice, bob, 10e18, WHY);
        }
        _valid(bob);
        vm.expectEmit(true, true, true, true, address(bond));
        emit GatedERC20.ForcedTransfer(alice, bob, 10e18, WHY, compliance);
        vm.prank(compliance);
        bond.forceTransfer(alice, bob, 10e18, WHY);
        assertEq(bond.balanceOf(bob), 10e18);

        _valid(carol); // an eligible recipient, so the refusal below is the justification's and not the gate's
        vm.prank(compliance);
        vm.expectRevert(GatedERC20.EmptyJustification.selector);
        bond.forceTransfer(bob, carol, 1e18, bytes32(0));
    }

    function test_claimCoupons_inAllFiveStates() public {
        _issue(alice, 10e18);
        _payCoupon(1);
        assertRevertsForAllInvalidStates(address(bond), abi.encodeCall(bond.claimCoupons, ()), alice, REQUEST);
        assertEq(stable.balanceOf(alice), 250e6, "the Valid call at the end of the walk claimed the coupon");
    }

    // ---- the schedule ----

    function test_payCoupon_notBeforeItsDueTime() public {
        _issue(alice, 10e18);
        vm.warp(firstCouponAt - 1);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(TokenisedBond.CouponNotDue.selector, uint32(1), firstCouponAt));
        bond.payCoupon();
    }

    function test_payCoupon_pullsTheFixedAmount_andEmits() public {
        _issue(alice, 10e18);
        _issue(bob, 30e18);
        vm.warp(firstCouponAt);
        assertEq(bond.nextCouponAmount(), 1_000e6); // 40 units at 25.000000 each
        uint256 before = stable.balanceOf(agent);
        vm.expectEmit(true, true, true, true, address(bond));
        emit TokenisedBond.CouponPaid(1, 1_000e6, 40e18, agent);
        vm.prank(agent);
        bond.payCoupon();
        assertEq(before - stable.balanceOf(agent), 1_000e6);
        assertEq(stable.balanceOf(address(bond)), 1_000e6);
        assertEq(bond.couponsPaid(), 1);
        assertEq(bond.totalFunded(), 1_000e6);
    }

    function test_payCoupon_aLateCouponDoesNotBringTheNextOneForward() public {
        _issue(alice, 10e18);
        vm.warp(firstCouponAt + 30 days); // coupon 1 paid a month late
        vm.prank(agent);
        bond.payCoupon();
        // coupon 2 is still due at first + one period, which has not come yet
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(TokenisedBond.CouponNotDue.selector, uint32(2), firstCouponAt + PERIOD));
        bond.payCoupon();
    }

    function test_payCoupon_onlyThePayingAgent_neverAfterTheLast_neverIntoNothing() public {
        bytes32 role = bond.PAYING_AGENT_ROLE();
        vm.warp(firstCouponAt);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, role));
        bond.payCoupon();

        vm.prank(agent);
        vm.expectRevert(TokenisedBond.NoUnitsOutstanding.selector);
        bond.payCoupon();

        _issue(alice, 10e18);
        for (uint32 n = 1; n <= COUPONS; ++n) {
            _payCoupon(n);
        }
        assertEq(bond.couponsPaid(), COUPONS);
        vm.warp(block.timestamp + PERIOD);
        vm.prank(agent);
        vm.expectRevert(TokenisedBond.AllCouponsPaid.selector);
        bond.payCoupon();
    }

    // ---- who is owed what ----

    function test_coupons_followTheUnitsHeldWhenEachWasFunded() public {
        _issue(alice, 10e18);
        _issue(bob, 30e18);
        _payCoupon(1);
        assertEq(bond.claimable(alice), 250e6);
        assertEq(bond.claimable(bob), 750e6);

        // alice sells half to carol after coupon 1: carol has no claim on it, alice keeps hers
        _valid(carol);
        vm.prank(alice);
        bond.transfer(carol, 5e18);
        assertEq(bond.claimable(alice), 250e6);
        assertEq(bond.claimable(carol), 0);

        _payCoupon(2);
        assertEq(bond.claimable(alice), 250e6 + 125e6);
        assertEq(bond.claimable(carol), 125e6);
        assertEq(bond.claimable(bob), 1_500e6);

        vm.prank(alice);
        assertEq(bond.claimCoupons(), 375e6);
        vm.prank(carol);
        bond.claimCoupons();
        vm.prank(bob);
        bond.claimCoupons();
        assertEq(stable.balanceOf(alice), 375e6);
        assertEq(stable.balanceOf(carol), 125e6);
        assertEq(stable.balanceOf(bob), 1_500e6);
        assertEq(bond.totalClaimed(), 2_000e6);
        assertEq(bond.totalFunded(), 2_000e6);
        assertEq(stable.balanceOf(address(bond)), 0);

        vm.prank(alice);
        vm.expectRevert(TokenisedBond.NothingToClaim.selector);
        bond.claimCoupons();
    }

    function test_coupons_aLapsedHolderWaits_andLosesNothing() public {
        _issue(alice, 10e18);
        _payCoupon(1);
        mock.setStatus(alice, REQUEST, EligibilityStatus.Expired);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, REQUEST));
        bond.claimCoupons();
        assertEq(bond.claimable(alice), 250e6, "the amount waits");

        _payCoupon(2); // still accruing while lapsed: the units are still hers
        assertEq(bond.claimable(alice), 500e6);

        _valid(alice);
        vm.prank(alice);
        assertEq(bond.claimCoupons(), 500e6);
    }

    function test_coupons_aForcedTransferLeavesEarnedCouponsBehind() public {
        _issue(alice, 10e18);
        _payCoupon(1);
        mock.setStatus(alice, REQUEST, EligibilityStatus.Revoked);
        _valid(bob);
        vm.prank(compliance);
        bond.forceTransfer(alice, bob, 10e18, WHY);

        assertEq(bond.claimable(alice), 250e6, "coupon 1 was funded while alice held the units");
        assertEq(bond.claimable(bob), 0);
        _payCoupon(2);
        assertEq(bond.claimable(alice), 250e6);
        assertEq(bond.claimable(bob), 250e6);
    }

    function test_paused_noCouponIsFundedOrClaimed() public {
        _issue(alice, 10e18);
        _payCoupon(1);
        vm.prank(pauser);
        bond.pause();

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        bond.claimCoupons();

        vm.warp(bond.couponDueAt(2));
        vm.prank(agent);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        bond.payCoupon();

        vm.prank(admin);
        bond.unpause();
        vm.prank(alice);
        assertEq(bond.claimCoupons(), 250e6);
    }

    // ---- the contract can always pay what it owes ----

    /// @notice Random holdings, a coupon, a random sale, another coupon. What the three holders
    /// are owed never exceeds what was funded, and the rounding dust left behind is under one
    /// base unit per holder per coupon.
    function testFuzz_owedNeverExceedsFunded(uint96 a, uint96 b, uint96 sold) public {
        uint256 unitsA = bound(uint256(a), 1, 1_000_000e18);
        uint256 unitsB = bound(uint256(b), 1, 1_000_000e18);
        if (unitsA + unitsB > 1_000_000e18) unitsB = 1_000_000e18 - unitsA + 1;
        vm.assume(unitsA + unitsB <= 1_000_000e18);
        _issue(alice, unitsA);
        _issue(bob, unitsB);
        _payCoupon(1);

        _valid(carol);
        uint256 moved = bound(uint256(sold), 0, unitsA);
        vm.prank(alice);
        bond.transfer(carol, moved);
        _payCoupon(2);

        uint256 owed = bond.claimable(alice) + bond.claimable(bob) + bond.claimable(carol);
        assertLe(owed, bond.totalFunded(), "owed more than was funded: the last claimant would be refused");
        // three holders, two coupons: each holder's share rounds down by under one base unit per coupon,
        // and each funding rounds up by under one
        assertLe(bond.totalFunded() - owed, 8, "more dust than the rounding rule allows");
        assertEq(stable.balanceOf(address(bond)), bond.totalFunded());

        // and every one of them can actually be paid
        address[3] memory holders = [alice, bob, carol];
        for (uint256 i = 0; i < holders.length; ++i) {
            if (bond.claimable(holders[i]) == 0) continue;
            vm.prank(holders[i]);
            bond.claimCoupons();
        }
        assertEq(bond.totalClaimed(), owed);
    }
}
