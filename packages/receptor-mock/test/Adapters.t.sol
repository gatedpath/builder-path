// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GatedTest} from "./GatedTest.sol";
import {GatedCounter} from "./examples/GatedCounter.sol";
import {FakeIden3V1, FakeIden3V2, FakeIden3V3} from "./fakes/FakeIden3Verifiers.sol";
import {FakeVCVerifierChild, RevertingTarget} from "./fakes/FakeVCVerifierChild.sol";
import {Gated} from "../src/Gated.sol";
import {EligibilityStatus} from "../src/IRedbellyVerifier.sol";
import {Iden3VerifierAdapter} from "../src/adapters/Iden3VerifierAdapter.sol";
import {VCVerifierAdapter} from "../src/adapters/VCVerifierAdapter.sol";

contract AdaptersTest is GatedTest {
    uint64 internal constant REQUEST_ID = 26;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        _deployMock();
    }

    function _assertStatusIsValidOrNeverIssued(Iden3VerifierAdapter adapter, address wallet) internal view {
        EligibilityStatus s = adapter.eligibilityStatus(wallet, REQUEST_ID);
        assertTrue(
            s == EligibilityStatus.Valid || s == EligibilityStatus.NeverIssued,
            "adapters report Valid or NeverIssued only"
        );
        assertEq(s == EligibilityStatus.Valid, adapter.isEligible(wallet, REQUEST_ID));
    }

    function test_iden3V1MapsProofsMapping() public {
        FakeIden3V1 fake = new FakeIden3V1();
        Iden3VerifierAdapter adapter =
            new Iden3VerifierAdapter(address(fake), Iden3VerifierAdapter.Surface.ZKPVerifierV1);
        assertEq(adapter.target(), address(fake));
        assertEq(uint8(adapter.surface()), uint8(Iden3VerifierAdapter.Surface.ZKPVerifierV1));

        assertFalse(adapter.isEligible(alice, REQUEST_ID));
        fake.setProof(alice, REQUEST_ID, true);
        assertTrue(adapter.isEligible(alice, REQUEST_ID));
        assertFalse(adapter.isEligible(alice, REQUEST_ID + 1), "request ids are distinct");
        assertFalse(adapter.isEligible(bob, REQUEST_ID));
        _assertStatusIsValidOrNeverIssued(adapter, alice);
        _assertStatusIsValidOrNeverIssued(adapter, bob);

        fake.setProof(alice, REQUEST_ID, false);
        assertFalse(adapter.isEligible(alice, REQUEST_ID));
    }

    function test_iden3V2MapsIsProofVerifiedAndUnknownRequestIsFalse() public {
        FakeIden3V2 fake = new FakeIden3V2();
        Iden3VerifierAdapter adapter =
            new Iden3VerifierAdapter(address(fake), Iden3VerifierAdapter.Surface.ZKPVerifierV2);

        // Request not set: the real contract reverts; the adapter reads that as not eligible.
        assertFalse(adapter.isEligible(alice, REQUEST_ID));
        assertEq(uint8(adapter.eligibilityStatus(alice, REQUEST_ID)), uint8(EligibilityStatus.NeverIssued));

        fake.setRequest(REQUEST_ID);
        assertFalse(adapter.isEligible(alice, REQUEST_ID));
        fake.setProof(alice, REQUEST_ID, true);
        assertTrue(adapter.isEligible(alice, REQUEST_ID));
        assertEq(uint8(adapter.eligibilityStatus(alice, REQUEST_ID)), uint8(EligibilityStatus.Valid));
        assertFalse(adapter.isEligible(bob, REQUEST_ID));
    }

    function test_iden3V3WidensRequestIdAndUnknownRequestIsFalse() public {
        FakeIden3V3 fake = new FakeIden3V3();
        Iden3VerifierAdapter adapter = new Iden3VerifierAdapter(address(fake), Iden3VerifierAdapter.Surface.VerifierV3);

        assertFalse(adapter.isEligible(alice, REQUEST_ID));
        fake.setRequest(uint256(REQUEST_ID));
        fake.setProof(alice, uint256(REQUEST_ID), true);
        assertTrue(adapter.isEligible(alice, REQUEST_ID));
        assertFalse(adapter.isEligible(alice, REQUEST_ID + 1));
        _assertStatusIsValidOrNeverIssued(adapter, alice);
    }

    function test_iden3WrongSurfaceIsDeniedNotPassed() public {
        // Pointing a V2 adapter at a V1 contract: the selector is unknown, the call reverts, nobody
        // gets through. Misconfiguration fails closed.
        FakeIden3V1 fake = new FakeIden3V1();
        fake.setProof(alice, REQUEST_ID, true);
        Iden3VerifierAdapter adapter =
            new Iden3VerifierAdapter(address(fake), Iden3VerifierAdapter.Surface.ZKPVerifierV2);
        assertFalse(adapter.isEligible(alice, REQUEST_ID));
    }

    function test_iden3AdapterRejectsTargetWithoutCode() public {
        address empty = makeAddr("empty");
        vm.expectRevert(abi.encodeWithSelector(Iden3VerifierAdapter.TargetHasNoCode.selector, empty));
        new Iden3VerifierAdapter(empty, Iden3VerifierAdapter.Surface.ZKPVerifierV2);
    }

    function test_vcAdapterMapsVerificationStatus() public {
        FakeVCVerifierChild fake = new FakeVCVerifierChild("OptimaV1Credential");
        VCVerifierAdapter adapter = new VCVerifierAdapter(address(fake));
        assertEq(adapter.target(), address(fake));

        assertFalse(adapter.isEligible(alice, REQUEST_ID));
        assertEq(uint8(adapter.eligibilityStatus(alice, REQUEST_ID)), uint8(EligibilityStatus.NeverIssued));

        vm.prank(alice);
        fake.verifyCredential("did:key:z...", "{}", "{}");
        assertTrue(adapter.isEligible(alice, REQUEST_ID));
        assertTrue(adapter.isEligible(alice, 0), "request id is ignored on the VC path");
        assertEq(uint8(adapter.eligibilityStatus(alice, REQUEST_ID)), uint8(EligibilityStatus.Valid));
        assertFalse(adapter.isEligible(bob, REQUEST_ID));

        fake.revoke(alice);
        assertFalse(adapter.isEligible(alice, REQUEST_ID));
    }

    function test_vcAdapterRevertingTargetIsDenied() public {
        RevertingTarget bad = new RevertingTarget();
        VCVerifierAdapter adapter = new VCVerifierAdapter(address(bad));
        assertFalse(adapter.isEligible(alice, REQUEST_ID));
    }

    function test_vcAdapterRejectsTargetWithoutCode() public {
        address empty = makeAddr("empty");
        vm.expectRevert(abi.encodeWithSelector(VCVerifierAdapter.TargetHasNoCode.selector, empty));
        new VCVerifierAdapter(empty);
    }

    function test_swapMockForAdapterBehindGated() public {
        // Develop against the mock, then repoint the same contract at a real-shaped verifier.
        GatedCounter counter = new GatedCounter(mock, REQUEST_ID);
        assertRevertsForAllInvalidStates(address(counter), abi.encodeCall(counter.increment, ()), alice, REQUEST_ID);

        FakeIden3V2 fake = new FakeIden3V2();
        fake.setRequest(REQUEST_ID);
        Iden3VerifierAdapter adapter =
            new Iden3VerifierAdapter(address(fake), Iden3VerifierAdapter.Surface.ZKPVerifierV2);
        counter.setVerifier(adapter);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, REQUEST_ID));
        counter.increment();

        fake.setProof(alice, REQUEST_ID, true);
        vm.prank(alice);
        counter.increment();
        assertEq(counter.count(), 2);
    }
}
