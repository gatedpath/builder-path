// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GatedTest} from "./GatedTest.sol";
import {GatedCounter} from "./examples/GatedCounter.sol";
import {Gated} from "../src/Gated.sol";
import {EligibilityStatus} from "../src/IRedbellyVerifier.sol";
import {ReceptorMock} from "../src/ReceptorMock.sol";

contract FuzzTest is GatedTest {
    function setUp() public {
        _deployMock();
    }

    function testFuzz_unsetWalletIsNeverIssuedAndDenied(address wallet, uint64 requestId) public {
        assertEq(uint8(mock.eligibilityStatus(wallet, requestId)), uint8(EligibilityStatus.NeverIssued));
        assertFalse(mock.isEligible(wallet, requestId));

        GatedCounter counter = new GatedCounter(mock, requestId);
        vm.prank(wallet);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, wallet, requestId));
        counter.increment();
    }

    function testFuzz_validIsScopedToTheExactPair(
        address wallet,
        uint64 requestId,
        address otherWallet,
        uint64 otherRequestId
    ) public {
        vm.assume(wallet != otherWallet || requestId != otherRequestId);
        mock.setStatus(wallet, requestId, EligibilityStatus.Valid);
        assertTrue(mock.isEligible(wallet, requestId));
        assertFalse(mock.isEligible(otherWallet, otherRequestId));

        GatedCounter counter = new GatedCounter(mock, requestId);
        vm.prank(wallet);
        counter.increment();
        assertEq(counter.count(), 1);
    }

    function testFuzz_onlyValidPasses(address wallet, uint64 requestId, uint8 rawStatus) public {
        EligibilityStatus status = EligibilityStatus(bound(rawStatus, 0, uint8(EligibilityStatus.WrongJurisdiction)));
        mock.setStatus(wallet, requestId, status);
        assertEq(uint8(mock.eligibilityStatus(wallet, requestId)), uint8(status));
        assertEq(mock.isEligible(wallet, requestId), status == EligibilityStatus.Valid);

        GatedCounter counter = new GatedCounter(mock, requestId);
        vm.prank(wallet);
        if (status != EligibilityStatus.Valid) {
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, wallet, requestId));
        }
        counter.increment();
    }

    function testFuzz_wildcardCoversEveryRequestIdUnlessOverridden(
        address wallet,
        uint64 requestId,
        uint64 overriddenRequestId,
        uint8 rawOverride
    ) public {
        vm.assume(requestId != overriddenRequestId);
        EligibilityStatus overrideStatus =
            EligibilityStatus(bound(rawOverride, 0, uint8(EligibilityStatus.WrongJurisdiction)));
        mock.setStatusAll(wallet, EligibilityStatus.Valid);
        mock.setStatus(wallet, overriddenRequestId, overrideStatus);
        assertTrue(mock.isEligible(wallet, requestId));
        assertEq(mock.isEligible(wallet, overriddenRequestId), overrideStatus == EligibilityStatus.Valid);
    }

    function testFuzz_expiryFollowsTheClock(address wallet, uint64 requestId, uint64 expiresAt, uint64 now_) public {
        mock.setValidUntil(wallet, requestId, expiresAt);
        vm.warp(now_);
        bool expectedEligible = expiresAt == 0 || now_ < expiresAt;
        assertEq(mock.isEligible(wallet, requestId), expectedEligible);
        EligibilityStatus expected = expectedEligible ? EligibilityStatus.Valid : EligibilityStatus.Expired;
        assertEq(uint8(mock.eligibilityStatus(wallet, requestId)), uint8(expected));
    }

    function testFuzz_frozenMockNeverChanges(address wallet, uint64 requestId, uint8 rawStatus) public {
        EligibilityStatus status = EligibilityStatus(bound(rawStatus, 0, uint8(EligibilityStatus.WrongJurisdiction)));
        mock.setStatus(wallet, requestId, status);
        mock.freeze();
        vm.expectRevert(ReceptorMock.MockIsFrozen.selector);
        mock.setStatus(wallet, requestId, EligibilityStatus.Valid);
        assertEq(uint8(mock.eligibilityStatus(wallet, requestId)), uint8(status));
    }
}
