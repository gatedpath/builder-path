// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { GatedERC20 } from "../src/GatedERC20.sol";

/// @notice The token deployed against the AU wholesale investor recipe (request id 708) instead
/// of over-18 (18). The recipe is a constructor argument, so nothing in src/ changes; what has to
/// be proven is that the gate now asks the verifier about 708 and about nothing else.
contract WholesaleGateTest is GatedTest {
    GatedERC20 internal token;
    uint64 internal constant OVER_18 = 18;
    uint64 internal constant AU_WHOLESALE = 708;
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");

    function setUp() public {
        _deployMock();
        token = new GatedERC20(
            "Gated",
            "GTOK",
            GatedERC20.Roles({ admin: admin, pauser: address(0), compliance: address(0), issuerAdmin: address(0) }),
            mock,
            AU_WHOLESALE,
            100e18
        );
        vm.prank(admin);
        token.setSubscriptionsOpen(true);
    }

    function test_gateIsTheWholesaleRecipe() public view {
        assertEq(token.requestId(), AU_WHOLESALE);
    }

    /// An adult is not a wholesale investor. A credential for the old recipe must not open the new gate.
    function test_over18Credential_doesNotOpenTheWholesaleGate() public {
        mock.setStatus(alice, OVER_18, EligibilityStatus.Valid);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, AU_WHOLESALE));
        token.subscribe();
    }

    function test_everyInvalidState_isRefused_thenValidSubscribes() public {
        EligibilityStatus[4] memory invalid = [
            EligibilityStatus.NeverIssued,
            EligibilityStatus.Expired,
            EligibilityStatus.Revoked,
            EligibilityStatus.WrongJurisdiction
        ];
        for (uint256 i = 0; i < invalid.length; i++) {
            mock.setStatus(alice, AU_WHOLESALE, invalid[i]);
            vm.prank(alice);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, AU_WHOLESALE));
            token.subscribe();
        }
        mock.setStatus(alice, AU_WHOLESALE, EligibilityStatus.Valid);
        vm.prank(alice);
        token.subscribe();
        assertEq(token.balanceOf(alice), 100e18);
    }

    /// Revocation after the fact: she subscribed while valid, and is refused the next gated call.
    function test_revokedAfterSubscribing_isRefusedNextTime() public {
        mock.setStatus(alice, AU_WHOLESALE, EligibilityStatus.Valid);
        vm.prank(alice);
        token.subscribe();
        mock.setStatus(alice, AU_WHOLESALE, EligibilityStatus.Revoked);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, AU_WHOLESALE));
        token.subscribe();
    }
}
