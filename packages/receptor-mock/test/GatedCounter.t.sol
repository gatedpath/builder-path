// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {GatedTest} from "./GatedTest.sol";
import {GatedCounter} from "./examples/GatedCounter.sol";
import {Gated} from "../src/Gated.sol";
import {EligibilityStatus, IRedbellyVerifier} from "../src/IRedbellyVerifier.sol";
import {ReceptorMock} from "../src/ReceptorMock.sol";

contract GatedCounterTest is GatedTest {
    uint64 internal constant REQUEST_ID = 108;

    GatedCounter internal counter;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        _deployMock();
        counter = new GatedCounter(mock, REQUEST_ID);
    }

    function test_incrementAcrossAllFiveStates() public {
        assertRevertsForAllInvalidStates(address(counter), abi.encodeCall(counter.increment, ()), alice, REQUEST_ID);
        assertEq(counter.count(), 1, "only the Valid call should have counted");
    }

    function test_nudgeNeedsBothParties() public {
        assertGatedPair(address(counter), abi.encodeCall(counter.nudge, (bob)), alice, bob, REQUEST_ID);
        assertEq(counter.nudges(alice, bob), 2, "two successful nudges expected");
    }

    function test_tryIncrementLogsDenialWithoutReverting() public {
        vm.expectEmit(address(counter));
        emit Gated.EligibilityDenied(alice, REQUEST_ID, address(mock));
        vm.prank(alice);
        bool moved = counter.tryIncrement();
        assertFalse(moved);
        assertEq(counter.count(), 0);

        mock.setStatus(alice, REQUEST_ID, EligibilityStatus.Valid);
        vm.prank(alice);
        assertTrue(counter.tryIncrement());
        assertEq(counter.count(), 1);
    }

    function test_requestIdMustMatch() public {
        mock.setStatus(alice, REQUEST_ID + 1, EligibilityStatus.Valid);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, REQUEST_ID));
        counter.increment();
    }

    function test_setStatusAllCoversTheCounter() public {
        mock.setStatusAll(alice, EligibilityStatus.Valid);
        vm.prank(alice);
        counter.increment();
        assertEq(counter.count(), 1);
    }

    function test_isEligibleView() public {
        assertFalse(counter.isEligible(alice));
        mock.setStatus(alice, REQUEST_ID, EligibilityStatus.Valid);
        assertTrue(counter.isEligible(alice));
        assertEq(address(counter.verifier()), address(mock));
        assertEq(counter.requestId(), REQUEST_ID);
    }

    function test_constructorEmitsAndRejectsZeroVerifier() public {
        vm.expectEmit();
        emit Gated.VerifierChanged(address(0), address(mock));
        vm.expectEmit();
        emit Gated.RequestIdChanged(0, 7);
        new GatedCounter(mock, 7);

        vm.expectRevert(Gated.ZeroVerifier.selector);
        new GatedCounter(IRedbellyVerifier(address(0)), 7);
    }

    function test_onlyOwnerChangesVerifierAndRequestId() public {
        ReceptorMock other = new ReceptorMock();

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        counter.setVerifier(other);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        counter.setRequestId(9);

        vm.expectEmit(address(counter));
        emit Gated.VerifierChanged(address(mock), address(other));
        counter.setVerifier(other);
        assertEq(address(counter.verifier()), address(other));

        vm.expectEmit(address(counter));
        emit Gated.RequestIdChanged(REQUEST_ID, 9);
        counter.setRequestId(9);
        assertEq(counter.requestId(), 9);

        vm.expectRevert(Gated.ZeroVerifier.selector);
        counter.setVerifier(IRedbellyVerifier(address(0)));

        // The gate now reads the new verifier and the new request id.
        other.setStatus(alice, 9, EligibilityStatus.Valid);
        vm.prank(alice);
        counter.increment();
        mock.setStatus(alice, REQUEST_ID, EligibilityStatus.Valid);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, bob, 9));
        counter.increment();
    }

    function test_expiryDeniesAfterWarp() public {
        uint64 expiresAt = uint64(block.timestamp + 1 days);
        mock.setValidUntil(alice, REQUEST_ID, expiresAt);
        vm.prank(alice);
        counter.increment();

        vm.warp(expiresAt);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, REQUEST_ID));
        counter.increment();
        assertEq(uint8(mock.eligibilityStatus(alice, REQUEST_ID)), uint8(EligibilityStatus.Expired));
    }
}
