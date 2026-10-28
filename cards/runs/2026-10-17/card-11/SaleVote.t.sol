// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { PropertyUnits } from "../src/PropertyUnits.sol";
import { SaleVote } from "../src/SaleVote.sol";

/// @notice The vote: the gate in five states, a proposal passing and one failing by unit weight,
/// a third failing for want of a majority of all units, and the refusals.
contract SaleVoteTest is GatedTest {
    uint64 internal constant REQUEST = 708;
    uint256 internal constant PROPERTY = 1;
    bytes32 internal constant TERMS = keccak256("sale terms 2026-10-17");

    PropertyUnits internal units;
    SaleVote internal vote;
    address internal admin = makeAddr("admin");
    address internal issuer = makeAddr("issuer");
    address internal proposer = makeAddr("proposer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public {
        _deployMock();
        vm.warp(1_800_000_000);
        units = new PropertyUnits("u", PropertyUnits.Roles({ admin: admin, issuer: issuer }), mock, REQUEST);
        vote = new SaleVote(units, SaleVote.Roles({ admin: admin, proposer: proposer }), mock, REQUEST);
        vm.prank(issuer);
        units.openProperty(PROPERTY, 1_000, keccak256("terms"));
    }

    function _valid(address who) internal {
        mock.setStatus(who, REQUEST, EligibilityStatus.Valid);
    }

    function _issue(address to, uint256 amount) internal {
        _valid(to);
        vm.prank(issuer);
        units.issue(PROPERTY, to, amount);
    }

    function _propose() internal returns (uint256 id) {
        vm.warp(block.timestamp + 1); // the snapshot is the second before the proposal; close this one first
        vm.prank(proposer);
        id = vote.propose(PROPERTY, TERMS, 7 days);
    }

    // ---- construction ----

    function test_constructorRefusals() public {
        vm.expectRevert(SaleVote.ZeroAdmin.selector);
        new SaleVote(units, SaleVote.Roles({ admin: address(0), proposer: proposer }), mock, REQUEST);
        vm.expectRevert(SaleVote.ZeroAddress.selector);
        new SaleVote(PropertyUnits(address(0)), SaleVote.Roles({ admin: admin, proposer: proposer }), mock, REQUEST);
    }

    // ---- the gate on castVote, five states ----

    function test_castVote_revertsInAllInvalidStates() public {
        _issue(alice, 100);
        uint256 id = _propose();
        assertRevertsForAllInvalidStates(address(vote), abi.encodeCall(vote.castVote, (id, true)), alice, REQUEST);
        assertEq(vote.proposal(id).forUnits, 100, "only the Valid call should have counted");
    }

    // ---- outcomes by unit weight ----

    function test_passes_byWeight() public {
        _issue(alice, 600);
        _issue(bob, 400);
        uint256 id = _propose();
        assertEq(uint256(vote.state(id)), uint256(SaleVote.State.Active));
        vm.prank(alice);
        assertEq(vote.castVote(id, true), 600);
        vm.prank(bob);
        assertEq(vote.castVote(id, false), 400);
        assertEq(uint256(vote.state(id)), uint256(SaleVote.State.Active), "not decided until the deadline");
        vm.warp(block.timestamp + 7 days + 1); // the deadline itself still counts
        assertEq(uint256(vote.state(id)), uint256(SaleVote.State.Passed));
    }

    function test_fails_byWeight() public {
        _issue(alice, 400);
        _issue(bob, 600);
        uint256 id = _propose();
        vm.prank(alice);
        vote.castVote(id, true);
        vm.prank(bob);
        vote.castVote(id, false);
        vm.warp(block.timestamp + 7 days + 1); // the deadline itself still counts
        assertEq(uint256(vote.state(id)), uint256(SaleVote.State.Defeated));
    }

    function test_fails_withoutMajorityOfAllUnits() public {
        _issue(alice, 400);
        _issue(bob, 300);
        _issue(carol, 300);
        uint256 id = _propose();
        vm.prank(alice);
        vote.castVote(id, true); // 400 for, nobody against, 600 silent
        vm.warp(block.timestamp + 7 days + 1); // the deadline itself still counts
        assertEq(uint256(vote.state(id)), uint256(SaleVote.State.Defeated), "400 of 1,000 is not a majority");
    }

    function test_exactHalfIsNotAMajority() public {
        _issue(alice, 500);
        _issue(bob, 500);
        uint256 id = _propose();
        vm.prank(alice);
        vote.castVote(id, true);
        vm.warp(block.timestamp + 7 days + 1); // the deadline itself still counts
        assertEq(uint256(vote.state(id)), uint256(SaleVote.State.Defeated));
    }

    // ---- the snapshot ----

    function test_unitsMovedAfterSnapshot_carryNoVote() public {
        _issue(alice, 600);
        _issue(bob, 400);
        uint256 id = _propose();
        _valid(carol);
        // In the same second as the proposal, on purpose: the fork rehearsal of 17 October showed a
        // transfer in the proposal's own second changing the weights when the snapshot was that second.
        vm.prank(alice);
        units.safeTransferFrom(alice, carol, PROPERTY, 600, "");
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(SaleVote.NoUnitsAtSnapshot.selector, id, carol));
        vote.castVote(id, true);
        vm.prank(alice);
        assertEq(vote.castVote(id, true), 600, "the seller still votes with what she held at the snapshot");
    }

    // ---- refusals ----

    function test_castVote_refusals() public {
        _issue(alice, 100);
        _valid(bob);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SaleVote.UnknownProposal.selector, 1));
        vote.castVote(1, true);

        uint256 id = _propose();
        assertEq(uint256(vote.state(id)), uint256(SaleVote.State.Active), "voting opens at once");
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SaleVote.NoUnitsAtSnapshot.selector, id, bob));
        vote.castVote(id, true);
        vm.prank(alice);
        vote.castVote(id, true);
        assertTrue(vote.hasVoted(id, alice));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SaleVote.AlreadyVoted.selector, id, alice));
        vote.castVote(id, false);

        vm.warp(block.timestamp + 7 days + 1); // the deadline itself still counts
        _issue(bob, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SaleVote.VotingNotOpen.selector, id, SaleVote.State.Passed));
        vote.castVote(id, false);
    }

    function test_propose_refusals() public {
        vm.startPrank(proposer);
        vm.expectRevert(SaleVote.ZeroTermsHash.selector);
        vote.propose(PROPERTY, bytes32(0), 7 days);
        vm.expectRevert(abi.encodeWithSelector(SaleVote.VotingPeriodOutOfRange.selector, 1 hours, 1 days, 90 days));
        vote.propose(PROPERTY, TERMS, 1 hours);
        vm.expectRevert(abi.encodeWithSelector(SaleVote.NoUnits.selector, PROPERTY));
        vote.propose(PROPERTY, TERMS, 7 days);
        vm.stopPrank();
        _issue(alice, 1);
        vm.prank(proposer); // units issued this second are not in the previous second's total
        vm.expectRevert(abi.encodeWithSelector(SaleVote.NoUnits.selector, PROPERTY));
        vote.propose(PROPERTY, TERMS, 7 days);
        bytes32 role = vote.PROPOSER_ROLE();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        vote.propose(PROPERTY, TERMS, 7 days);
        vm.expectRevert(abi.encodeWithSelector(SaleVote.UnknownProposal.selector, 9));
        vote.state(9);
    }
}
