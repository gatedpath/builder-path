// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { PropertyUnits } from "../src/PropertyUnits.sol";

/// @notice The unit register in five credential states at mint, transfer and hold, plus the
/// issuer's limits, the balance history the other two contracts read, and the admin paths.
contract PropertyUnitsTest is GatedTest {
    uint64 internal constant REQUEST = 708;
    uint256 internal constant PROPERTY = 1;
    bytes32 internal constant TERMS = keccak256("offer document 2026-10-17");

    PropertyUnits internal units;
    address internal admin = makeAddr("admin");
    address internal issuer = makeAddr("issuer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        _deployMock();
        vm.warp(1_800_000_000);
        units = new PropertyUnits(
            "ipfs://units/{id}.json", PropertyUnits.Roles({ admin: admin, issuer: issuer }), mock, REQUEST
        );
        vm.prank(issuer);
        units.openProperty(PROPERTY, 1_000, TERMS);
    }

    function _valid(address who) internal {
        mock.setStatus(who, REQUEST, EligibilityStatus.Valid);
    }

    function _invalidStates() internal pure returns (EligibilityStatus[4] memory) {
        return [
            EligibilityStatus.NeverIssued,
            EligibilityStatus.Expired,
            EligibilityStatus.Revoked,
            EligibilityStatus.WrongJurisdiction
        ];
    }

    function _issue(address to, uint256 amount) internal {
        _valid(to);
        vm.prank(issuer);
        units.issue(PROPERTY, to, amount);
    }

    // ---- construction ----

    function test_zeroAdminRefused() public {
        vm.expectRevert(PropertyUnits.ZeroAdmin.selector);
        new PropertyUnits("u", PropertyUnits.Roles({ admin: address(0), issuer: issuer }), mock, REQUEST);
    }

    function test_issuerFallsBackToAdmin() public {
        PropertyUnits u =
            new PropertyUnits("u", PropertyUnits.Roles({ admin: admin, issuer: address(0) }), mock, REQUEST);
        assertTrue(u.hasRole(u.ISSUER_ROLE(), admin));
        assertEq(u.requestId(), REQUEST);
        assertEq(u.CLOCK_MODE(), "mode=timestamp");
    }

    // ---- mint: the recipient in five states ----

    function test_issue_revertsForIneligibleRecipient() public {
        EligibilityStatus[4] memory invalid = _invalidStates();
        for (uint256 i = 0; i < invalid.length; i++) {
            mock.setStatus(bob, REQUEST, invalid[i]);
            vm.prank(issuer);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, bob, REQUEST));
            units.issue(PROPERTY, bob, 10);
        }
        _valid(bob);
        vm.prank(issuer);
        units.issue(PROPERTY, bob, 10);
        assertEq(units.balanceOf(bob, PROPERTY), 10);
        assertEq(units.totalSupply(PROPERTY), 10);
    }

    function test_issue_limits() public {
        _valid(alice); // the gate runs first: an ineligible recipient is refused before any other check
        vm.startPrank(issuer);
        vm.expectRevert(abi.encodeWithSelector(PropertyUnits.UnknownProperty.selector, 2));
        units.issue(2, alice, 1);
        vm.expectRevert(PropertyUnits.ZeroUnits.selector);
        units.issue(PROPERTY, alice, 0);
        units.issue(PROPERTY, alice, 900);
        vm.expectRevert(abi.encodeWithSelector(PropertyUnits.ExceedsTotalUnits.selector, PROPERTY, 101, 100));
        units.issue(PROPERTY, alice, 101);
        units.issue(PROPERTY, alice, 100);
        vm.stopPrank();
        PropertyUnits.Property memory p = units.property(PROPERTY);
        assertEq(p.issued, 1_000);
        assertEq(p.termsHash, TERMS);
    }

    function test_openProperty_refusals() public {
        vm.startPrank(issuer);
        vm.expectRevert(abi.encodeWithSelector(PropertyUnits.PropertyExists.selector, PROPERTY));
        units.openProperty(PROPERTY, 5, TERMS);
        vm.expectRevert(PropertyUnits.ZeroUnits.selector);
        units.openProperty(2, 0, TERMS);
        vm.expectRevert(PropertyUnits.ZeroTermsHash.selector);
        units.openProperty(2, 5, bytes32(0));
        vm.stopPrank();
        bytes32 role = units.ISSUER_ROLE(); // read before the prank: an external call here would consume it
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        units.openProperty(2, 5, TERMS);
    }

    // ---- transfer: both parties in five states ----

    function test_transfer_bothPartiesGated() public {
        _issue(alice, 100);
        assertGatedPair(
            address(units), abi.encodeCall(units.safeTransferFrom, (alice, bob, PROPERTY, 10, "")), alice, bob, REQUEST
        );
        assertEq(units.balanceOf(bob, PROPERTY), 20, "two successful transfers of 10 units");
        assertEq(units.balanceOf(alice, PROPERTY), 80);
    }

    function test_transfer_operatorIsNotChecked() public {
        _issue(alice, 100);
        _valid(bob);
        address operator = makeAddr("operator"); // NeverIssued, and that is fine: the parties are checked
        vm.prank(alice);
        units.setApprovalForAll(operator, true);
        vm.prank(operator);
        units.safeTransferFrom(alice, bob, PROPERTY, 5, "");
        assertEq(units.balanceOf(bob, PROPERTY), 5);
    }

    // ---- hold: a credential that lapses freezes the units ----

    function test_hold_lapsedCredentialFreezes() public {
        _issue(alice, 100);
        _valid(bob);
        mock.setValidUntil(alice, REQUEST, uint64(block.timestamp + 10 days));
        assertTrue(units.canTransfer(alice, bob, PROPERTY, 1));
        vm.warp(block.timestamp + 10 days);
        assertFalse(units.isEligible(alice));
        assertFalse(units.canTransfer(alice, bob, PROPERTY, 1));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, REQUEST));
        units.safeTransferFrom(alice, bob, PROPERTY, 1, "");
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, REQUEST));
        units.safeTransferFrom(bob, alice, PROPERTY, 0, "");
        assertEq(units.balanceOf(alice, PROPERTY), 100, "frozen, not lost");
    }

    // ---- history ----

    function test_history_readsPastBalances() public {
        _issue(alice, 100);
        uint48 t0 = units.clock();
        vm.warp(block.timestamp + 1);
        _valid(bob);
        vm.prank(alice);
        units.safeTransferFrom(alice, bob, PROPERTY, 40, "");
        uint48 t1 = units.clock();
        vm.warp(block.timestamp + 1);
        _issue(bob, 50);
        uint48 t2 = units.clock();
        vm.warp(block.timestamp + 1);

        assertEq(units.getPastUnits(PROPERTY, alice, t0), 100);
        assertEq(units.getPastUnits(PROPERTY, bob, t0), 0);
        assertEq(units.getPastTotalUnits(PROPERTY, t0), 100);
        assertEq(units.getPastUnits(PROPERTY, alice, t1), 60);
        assertEq(units.getPastUnits(PROPERTY, bob, t1), 40);
        assertEq(units.getPastTotalUnits(PROPERTY, t1), 100);
        assertEq(units.getPastUnits(PROPERTY, bob, t2), 90);
        assertEq(units.getPastTotalUnits(PROPERTY, t2), 150);
        uint48 current = units.clock();
        vm.expectRevert(abi.encodeWithSelector(PropertyUnits.FutureLookup.selector, current, current));
        units.getPastUnits(PROPERTY, alice, current);
    }

    function test_batch_capped() public {
        _issue(alice, 100);
        _valid(bob);
        uint256[] memory ids = new uint256[](9);
        uint256[] memory amounts = new uint256[](9);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PropertyUnits.BatchTooLong.selector, 9, 8));
        units.safeBatchTransferFrom(alice, bob, ids, amounts, "");
    }

    // ---- admin ----

    function test_admin_onlyAdminChangesGateAndUri() public {
        bytes32 adminRole = units.DEFAULT_ADMIN_ROLE();
        vm.startPrank(issuer);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, issuer, adminRole)
        );
        units.setRequestId(18);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, issuer, adminRole)
        );
        units.setURI("x");
        vm.stopPrank();
        vm.startPrank(admin);
        units.setRequestId(18);
        units.setURI("ipfs://other/{id}.json");
        vm.stopPrank();
        assertEq(units.requestId(), 18);
        assertEq(units.uri(PROPERTY), "ipfs://other/{id}.json");
    }
}
