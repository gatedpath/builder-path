// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { GatedERC20 } from "../src/GatedERC20.sol";
import { IssuerRegistry } from "../src/IssuerRegistry.sol";

/// @notice The issuer registry through the token: windows, allowances, replacement, revocation.
contract IssuerRegistryTest is GatedTest {
    GatedERC20 internal token;
    uint64 internal constant REQUEST = 4;
    address internal admin = makeAddr("admin");
    address internal issuerAdmin = makeAddr("issuerAdmin");
    address internal issuer = makeAddr("issuer");
    address internal holder = makeAddr("holder");
    uint64 internal start;

    function setUp() public {
        _deployMock();
        vm.warp(1_800_000_000);
        start = uint64(block.timestamp);
        token = new GatedERC20(
            "Gated",
            "GTOK",
            GatedERC20.Roles({ admin: admin, pauser: address(0), compliance: address(0), issuerAdmin: issuerAdmin }),
            mock,
            REQUEST,
            1e18
        );
        mock.setStatus(holder, REQUEST, EligibilityStatus.Valid);
    }

    function _grant(uint64 from, uint64 until, uint256 allowance) internal {
        vm.prank(issuerAdmin);
        token.setIssuer(issuer, from, until, allowance);
    }

    function test_onlyIssuerAdminSets() public {
        bytes32 role = token.ISSUER_ADMIN_ROLE();
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, role));
        token.setIssuer(issuer, 0, start + 1 days, 1e18);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, admin, role));
        token.revokeIssuer(issuer);
    }

    function test_windowValidation() public {
        vm.startPrank(issuerAdmin);
        vm.expectRevert(IssuerRegistry.ZeroIssuer.selector);
        token.setIssuer(address(0), 0, start + 1, 1);
        vm.expectRevert(abi.encodeWithSelector(IssuerRegistry.InvalidIssuerWindow.selector, start, start));
        token.setIssuer(issuer, 0, start, 1);
        vm.expectRevert(abi.encodeWithSelector(IssuerRegistry.InvalidIssuerWindow.selector, start + 10, start + 5));
        token.setIssuer(issuer, start + 10, start + 5, 1);
        vm.expectRevert(abi.encodeWithSelector(IssuerRegistry.InvalidIssuerWindow.selector, start - 10, start - 5));
        token.setIssuer(issuer, start - 10, start - 5, 1);
        vm.stopPrank();
    }

    function test_zeroValidFromMeansNow_andEventCarriesIt() public {
        vm.expectEmit(address(token));
        emit IssuerRegistry.IssuerPermissionSet(issuer, start, start + 7 days, 50e18);
        _grant(0, start + 7 days, 50e18);
        IssuerRegistry.IssuerPermission memory p = token.issuerPermission(issuer);
        assertEq(p.validFrom, start);
        assertEq(p.validUntil, start + 7 days);
        assertEq(p.allowance, 50e18);
        assertEq(p.minted, 0);
        assertTrue(token.isActiveIssuer(issuer));
        assertEq(token.remainingIssuance(issuer), 50e18);
        assertTrue(token.canIssue(issuer, 50e18));
        assertFalse(token.canIssue(issuer, 50e18 + 1));
    }

    function test_beforeWindow_insideWindow_afterWindow() public {
        _grant(start + 1 hours, start + 2 hours, 10e18);
        assertFalse(token.isActiveIssuer(issuer));
        assertEq(token.remainingIssuance(issuer), 0);
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(IssuerRegistry.IssuerNotActive.selector, issuer));
        token.mint(holder, 1e18);

        vm.warp(start + 1 hours);
        assertTrue(token.isActiveIssuer(issuer));
        vm.prank(issuer);
        token.mint(holder, 1e18);
        assertEq(token.balanceOf(holder), 1e18);

        vm.warp(start + 2 hours); // validUntil is exclusive
        assertFalse(token.isActiveIssuer(issuer));
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(IssuerRegistry.IssuerNotActive.selector, issuer));
        token.mint(holder, 1e18);
    }

    function test_allowanceIsSpentAndBounded() public {
        _grant(0, start + 1 days, 10e18);
        vm.startPrank(issuer);
        vm.expectEmit(address(token));
        emit IssuerRegistry.IssuanceConsumed(issuer, 4e18, 6e18);
        token.mint(holder, 4e18);
        vm.expectRevert(abi.encodeWithSelector(IssuerRegistry.IssuerAllowanceExceeded.selector, issuer, 7e18, 6e18));
        token.mint(holder, 7e18);
        token.mint(holder, 6e18);
        assertEq(token.remainingIssuance(issuer), 0);
        vm.expectRevert(abi.encodeWithSelector(IssuerRegistry.IssuerAllowanceExceeded.selector, issuer, 1, 0));
        token.mint(holder, 1);
        vm.stopPrank();
        assertEq(token.totalSupply(), 10e18);
    }

    function test_replacingResetsMinted_andRevokeStops() public {
        _grant(0, start + 1 days, 10e18);
        vm.prank(issuer);
        token.mint(holder, 10e18);
        assertEq(token.remainingIssuance(issuer), 0);
        _grant(0, start + 2 days, 5e18);
        assertEq(token.remainingIssuance(issuer), 5e18);
        assertEq(token.issuerPermission(issuer).minted, 0);

        vm.expectEmit(address(token));
        emit IssuerRegistry.IssuerPermissionRevoked(issuer);
        vm.prank(issuerAdmin);
        token.revokeIssuer(issuer);
        assertFalse(token.isActiveIssuer(issuer));
        assertEq(token.issuerPermission(issuer).validUntil, 0);
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(IssuerRegistry.IssuerNotActive.selector, issuer));
        token.mint(holder, 1);
    }

    function testFuzz_mintsNeverExceedAllowanceInsideWindow(
        uint64 length,
        uint256 allowance,
        uint256[8] memory requests,
        uint64 jump
    ) public {
        length = uint64(bound(length, 1, 3650 days));
        allowance = bound(allowance, 0, 1_000_000e18);
        _grant(0, start + length, allowance);
        uint256 mintedTotal;
        for (uint256 i = 0; i < requests.length; i++) {
            uint256 amount = bound(requests[i], 0, 1_000_000e18);
            vm.warp(start + (uint256(jump) * (i + 1)) % (uint256(length) + 2));
            bool inWindow = block.timestamp < start + length;
            uint256 remaining = token.remainingIssuance(issuer);
            vm.prank(issuer);
            if (!inWindow) {
                vm.expectRevert(abi.encodeWithSelector(IssuerRegistry.IssuerNotActive.selector, issuer));
                token.mint(holder, amount);
            } else if (amount > remaining) {
                vm.expectRevert(
                    abi.encodeWithSelector(IssuerRegistry.IssuerAllowanceExceeded.selector, issuer, amount, remaining)
                );
                token.mint(holder, amount);
            } else {
                token.mint(holder, amount);
                mintedTotal += amount;
            }
        }
        assertLe(mintedTotal, allowance);
        assertEq(token.totalSupply(), mintedTotal);
        assertEq(token.issuerPermission(issuer).minted, mintedTotal);
    }
}
