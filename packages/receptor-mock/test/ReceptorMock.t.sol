// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {EligibilityStatus} from "../src/IRedbellyVerifier.sol";
import {ReceptorMock} from "../src/ReceptorMock.sol";

contract ReceptorMockTest is Test {
    ReceptorMock internal mock;
    address internal alice = makeAddr("alice");
    uint64 internal constant R1 = 1;
    uint64 internal constant R2 = 2;

    function setUp() public {
        mock = new ReceptorMock();
    }

    function _status(address wallet, uint64 requestId) internal view returns (EligibilityStatus) {
        return mock.eligibilityStatus(wallet, requestId);
    }

    function test_unsetIsNeverIssued() public view {
        assertEq(uint8(_status(alice, R1)), uint8(EligibilityStatus.NeverIssued));
        assertFalse(mock.isEligible(alice, R1));
        ReceptorMock.Record memory rec = mock.recordFor(alice, R1);
        assertFalse(rec.isSet);
    }

    function test_setStatusEveryValueAndEvent() public {
        for (uint8 i = 0; i <= uint8(EligibilityStatus.WrongJurisdiction); ++i) {
            EligibilityStatus s = EligibilityStatus(i);
            vm.expectEmit(address(mock));
            emit ReceptorMock.StatusSet(alice, R1, s, 0);
            mock.setStatus(alice, R1, s);
            assertEq(uint8(_status(alice, R1)), i);
            assertEq(mock.isEligible(alice, R1), s == EligibilityStatus.Valid);
        }
    }

    function test_explicitNeverIssuedIsSetButStillDenied() public {
        mock.setStatusAll(alice, EligibilityStatus.Valid);
        mock.setStatus(alice, R1, EligibilityStatus.NeverIssued);
        assertEq(uint8(_status(alice, R1)), uint8(EligibilityStatus.NeverIssued), "explicit record beats the wildcard");
        assertTrue(mock.recordFor(alice, R1).isSet);
        assertTrue(mock.isEligible(alice, R2), "other request ids still use the wildcard");
    }

    function test_setStatusAllAndPrecedence() public {
        vm.expectEmit(address(mock));
        emit ReceptorMock.StatusSetAll(alice, EligibilityStatus.Revoked, 0);
        mock.setStatusAll(alice, EligibilityStatus.Revoked);
        assertEq(uint8(_status(alice, R1)), uint8(EligibilityStatus.Revoked));
        assertEq(uint8(_status(alice, type(uint64).max)), uint8(EligibilityStatus.Revoked));

        mock.setStatus(alice, R1, EligibilityStatus.Valid);
        assertTrue(mock.isEligible(alice, R1), "per-request record wins");
        assertFalse(mock.isEligible(alice, R2), "wildcard still applies elsewhere");

        vm.expectEmit(address(mock));
        emit ReceptorMock.StatusCleared(alice, R1);
        mock.clearStatus(alice, R1);
        assertEq(uint8(_status(alice, R1)), uint8(EligibilityStatus.Revoked), "back to the wildcard");

        vm.expectEmit(address(mock));
        emit ReceptorMock.StatusClearedAll(alice);
        mock.clearStatusAll(alice);
        assertEq(uint8(_status(alice, R1)), uint8(EligibilityStatus.NeverIssued));
    }

    function test_expiryFromTimestamp() public {
        uint64 expiresAt = uint64(block.timestamp + 3600);
        vm.expectEmit(address(mock));
        emit ReceptorMock.StatusSet(alice, R1, EligibilityStatus.Valid, expiresAt);
        mock.setValidUntil(alice, R1, expiresAt);
        assertTrue(mock.isEligible(alice, R1));

        vm.warp(expiresAt - 1);
        assertTrue(mock.isEligible(alice, R1), "valid up to the last second before expiry");

        vm.warp(expiresAt);
        assertFalse(mock.isEligible(alice, R1), "expired at expiresAt");
        assertEq(uint8(_status(alice, R1)), uint8(EligibilityStatus.Expired));
        assertEq(
            uint8(mock.recordFor(alice, R1).status),
            uint8(EligibilityStatus.Valid),
            "stored state unchanged; derived at read"
        );

        vm.warp(expiresAt + 365 days);
        assertEq(uint8(_status(alice, R1)), uint8(EligibilityStatus.Expired));
    }

    function test_expiryWildcard() public {
        uint64 expiresAt = uint64(block.timestamp + 10);
        vm.expectEmit(address(mock));
        emit ReceptorMock.StatusSetAll(alice, EligibilityStatus.Valid, expiresAt);
        mock.setValidUntilAll(alice, expiresAt);
        assertTrue(mock.isEligible(alice, R1));
        assertTrue(mock.isEligible(alice, R2));
        vm.warp(expiresAt);
        assertEq(uint8(_status(alice, R1)), uint8(EligibilityStatus.Expired));
        assertEq(uint8(_status(alice, R2)), uint8(EligibilityStatus.Expired));
    }

    function test_zeroExpiryMeansNever() public {
        mock.setValidUntil(alice, R1, 0);
        vm.warp(type(uint64).max);
        assertTrue(mock.isEligible(alice, R1));
    }

    function test_expiryOnlyAppliesToValid() public {
        // A non-valid record is never rewritten to Expired, so the test's named reason survives.
        mock.setStatus(alice, R1, EligibilityStatus.Revoked);
        vm.warp(block.timestamp + 10 * 365 days);
        assertEq(uint8(_status(alice, R1)), uint8(EligibilityStatus.Revoked));
    }

    function test_freezeBlocksEverySetter() public {
        mock.setStatus(alice, R1, EligibilityStatus.Valid);
        assertFalse(mock.frozen());

        vm.expectEmit(address(mock));
        emit ReceptorMock.MockFrozen(address(this));
        mock.freeze();
        assertTrue(mock.frozen());

        vm.expectRevert(ReceptorMock.MockIsFrozen.selector);
        mock.setStatus(alice, R1, EligibilityStatus.Revoked);
        vm.expectRevert(ReceptorMock.MockIsFrozen.selector);
        mock.setValidUntil(alice, R1, 1);
        vm.expectRevert(ReceptorMock.MockIsFrozen.selector);
        mock.setStatusAll(alice, EligibilityStatus.Revoked);
        vm.expectRevert(ReceptorMock.MockIsFrozen.selector);
        mock.setValidUntilAll(alice, 1);
        vm.expectRevert(ReceptorMock.MockIsFrozen.selector);
        mock.clearStatus(alice, R1);
        vm.expectRevert(ReceptorMock.MockIsFrozen.selector);
        mock.clearStatusAll(alice);
        vm.expectRevert(ReceptorMock.MockIsFrozen.selector);
        mock.freeze();

        assertTrue(mock.isEligible(alice, R1), "reads keep working and the state did not loosen");
    }

    function test_refusesMainnetChainId() public {
        vm.chainId(151);
        vm.expectRevert(abi.encodeWithSelector(ReceptorMock.MainnetForbidden.selector, 151));
        new ReceptorMock();

        vm.chainId(153);
        new ReceptorMock();
    }
}
