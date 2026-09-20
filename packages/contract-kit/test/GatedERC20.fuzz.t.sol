// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { GatedERC20 } from "../src/GatedERC20.sol";

/// @notice Properties over random wallets, states and amounts: a transfer succeeds exactly
/// when both parties are Valid; a subscription mints exactly once and only for Valid; a forced
/// transfer always needs a non-zero justification hash and an eligible recipient; distribute
/// mints exactly the eligible subset.
contract GatedERC20FuzzTest is GatedTest {
    GatedERC20 internal token;
    uint64 internal constant REQUEST = 7;
    address internal admin = makeAddr("admin");
    address internal issuer = makeAddr("issuer");

    function setUp() public {
        _deployMock();
        token = new GatedERC20(
            "Gated",
            "GTOK",
            GatedERC20.Roles({ admin: admin, pauser: address(0), compliance: address(0), issuerAdmin: address(0) }),
            mock,
            REQUEST,
            1_000e18
        );
        vm.startPrank(admin);
        token.setSubscriptionsOpen(true);
        token.setIssuer(issuer, 0, uint64(block.timestamp + 365 days), type(uint256).max);
        vm.stopPrank();
    }

    function _status(uint8 raw) internal pure returns (EligibilityStatus) {
        return EligibilityStatus(raw % 5);
    }

    function _usable(address a) internal view returns (bool) {
        return a != address(0) && a != address(token) && a != address(mock) && a != admin && a != issuer;
    }

    function testFuzz_transfer_requiresBothValid(
        address from,
        address to,
        uint8 fromState,
        uint8 toState,
        uint256 amount
    ) public {
        vm.assume(_usable(from) && _usable(to) && from != to);
        amount = bound(amount, 1, 1_000e18);

        mock.setStatus(from, REQUEST, EligibilityStatus.Valid);
        vm.prank(from);
        token.subscribe();

        EligibilityStatus fs = _status(fromState);
        EligibilityStatus ts = _status(toState);
        mock.setStatus(from, REQUEST, fs);
        mock.setStatus(to, REQUEST, ts);

        bool shouldPass = fs == EligibilityStatus.Valid && ts == EligibilityStatus.Valid;
        assertEq(token.canTransfer(from, to, amount), shouldPass, "canTransfer must mirror the gate");
        vm.prank(from);
        if (shouldPass) {
            token.transfer(to, amount);
            assertEq(token.balanceOf(to), amount);
            assertEq(token.balanceOf(from), 1_000e18 - amount);
        } else {
            address culprit = fs == EligibilityStatus.Valid ? to : from;
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, culprit, REQUEST));
            token.transfer(to, amount);
        }
    }

    function testFuzz_subscribe_onlyValidOnce(address wallet, uint8 state) public {
        vm.assume(_usable(wallet));
        EligibilityStatus s = _status(state);
        mock.setStatus(wallet, REQUEST, s);
        vm.prank(wallet);
        if (s == EligibilityStatus.Valid) {
            token.subscribe();
            assertEq(token.balanceOf(wallet), 1_000e18);
            vm.prank(wallet);
            vm.expectRevert(abi.encodeWithSelector(GatedERC20.AlreadySubscribed.selector, wallet));
            token.subscribe();
        } else {
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, wallet, REQUEST));
            token.subscribe();
            assertEq(token.balanceOf(wallet), 0);
        }
    }

    function testFuzz_forceTransfer_needsHashAndEligibleRecipient(
        uint256 amount,
        bytes32 justificationHash,
        uint8 fromState,
        uint8 toState
    ) public {
        address from = makeAddr("from");
        address to = makeAddr("to");
        mock.setStatus(from, REQUEST, EligibilityStatus.Valid);
        vm.prank(from);
        token.subscribe();
        amount = bound(amount, 0, 1_000e18);
        EligibilityStatus fs = _status(fromState);
        EligibilityStatus ts = _status(toState);
        mock.setStatus(from, REQUEST, fs);
        mock.setStatus(to, REQUEST, ts);

        vm.prank(admin);
        if (ts != EligibilityStatus.Valid) {
            // The recipient gate runs first: a forced transfer into an ineligible wallet never lands.
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, to, REQUEST));
            token.forceTransfer(from, to, amount, justificationHash);
        } else if (justificationHash == bytes32(0)) {
            vm.expectRevert(GatedERC20.EmptyJustification.selector);
            token.forceTransfer(from, to, amount, justificationHash);
        } else {
            // The sender's state is irrelevant: that is what a forced transfer is for.
            vm.expectEmit(address(token));
            emit GatedERC20.ForcedTransfer(from, to, amount, justificationHash, admin);
            token.forceTransfer(from, to, amount, justificationHash);
            assertEq(token.balanceOf(to), amount);
            assertEq(token.balanceOf(from), 1_000e18 - amount);
        }
    }

    function testFuzz_distribute_mintsExactlyTheEligibleSubset(uint8[6] memory states, uint256[6] memory amounts)
        public
    {
        address[] memory to = new address[](6);
        uint256[] memory amt = new uint256[](6);
        uint256 expectMinted;
        uint256 expectSkipped;
        for (uint256 i = 0; i < 6; i++) {
            to[i] = address(uint160(0x2000 + i));
            amt[i] = bound(amounts[i], 0, 1_000e18);
            EligibilityStatus s = _status(states[i]);
            mock.setStatus(to[i], REQUEST, s);
            if (s == EligibilityStatus.Valid) expectMinted += amt[i];
            else expectSkipped += amt[i];
        }
        vm.prank(issuer);
        (uint256 minted, uint256 skipped) = token.distribute(to, amt);
        assertEq(minted, expectMinted);
        assertEq(skipped, expectSkipped);
        assertEq(token.totalSupply(), expectMinted);
        for (uint256 i = 0; i < 6; i++) {
            bool eligible = mock.isEligible(to[i], REQUEST);
            assertEq(token.balanceOf(to[i]), eligible ? amt[i] : 0);
        }
    }
}
