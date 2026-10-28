// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Redbelly } from "../script/Redbelly.sol";
import { RecipientGuard } from "../src/RecipientGuard.sol";
import { BootstrapRegistryMock, PermissionMock } from "./mocks/RedbellyMocks.sol";
import { MockToken } from "./mocks/MockToken.sol";
import { ClosedReceiver, OpenReceiver } from "./mocks/Receivers.sol";

/// @notice The guard against a chain that behaves like Redbelly: the scaffold's registry and
/// permission mocks are etched at the network's real registry address, so `check` resolves the
/// permission contract the way it will on 151 and 153.
contract RecipientGuardTest is Test {
    RecipientGuard internal guard;
    PermissionMock internal permission;
    MockToken internal token;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal stranger = makeAddr("stranger");

    function setUp() public {
        BootstrapRegistryMock registry = new BootstrapRegistryMock();
        vm.etch(Redbelly.BOOTSTRAP_REGISTRY, address(registry).code);
        permission = new PermissionMock();
        BootstrapRegistryMock(Redbelly.BOOTSTRAP_REGISTRY).set("permission", address(permission));
        guard = new RecipientGuard();
        permission.setAllowed(alice, true);
        permission.setAllowed(bob, true);
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        token = new MockToken();
    }

    // ---- the address the guard asks ----

    function test_registryAddress_isTheScaffolds() public view {
        assertEq(guard.BOOTSTRAP_REGISTRY(), Redbelly.BOOTSTRAP_REGISTRY);
        assertEq(address(guard.permission()), address(permission));
    }

    function test_noRegistryOnThisChain_reverts() public {
        vm.etch(Redbelly.BOOTSTRAP_REGISTRY, "");
        vm.expectRevert(RecipientGuard.NoPermissionContract.selector);
        guard.check(bob);
    }

    function test_registryNamesNothing_reverts() public {
        BootstrapRegistryMock(Redbelly.BOOTSTRAP_REGISTRY).set("permission", address(0));
        vm.expectRevert(RecipientGuard.NoPermissionContract.selector);
        guard.check(bob);
    }

    // ---- RBNT ----

    function test_send_toPermissionedWallet() public {
        vm.expectEmit(true, true, false, true);
        emit RecipientGuard.Sent(alice, bob, 1 ether);
        vm.prank(alice);
        guard.send{ value: 1 ether }(bob, false);
        assertEq(bob.balance, 1 ether);
        assertEq(address(guard).balance, 0, "the guard keeps nothing");
    }

    function test_send_toUnpermissionedWallet_reverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RecipientGuard.RecipientNotPermissioned.selector, stranger));
        guard.send{ value: 1 ether }(stranger, false);
        assertEq(stranger.balance, 0);
        assertEq(alice.balance, 10 ether, "nothing left the sender");
    }

    function test_send_afterPermissionRemoved_reverts() public {
        permission.setAllowed(bob, false);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RecipientGuard.RecipientNotPermissioned.selector, bob));
        guard.send{ value: 1 ether }(bob, false);
    }

    function test_send_toZero_reverts() public {
        vm.prank(alice);
        vm.expectRevert(RecipientGuard.ZeroRecipient.selector);
        guard.send{ value: 1 ether }(address(0), false);
    }

    function test_send_nothing_reverts() public {
        vm.prank(alice);
        vm.expectRevert(RecipientGuard.NothingToSend.selector);
        guard.send(bob, false);
    }

    function test_send_toContract_refusedUnlessAllowed() public {
        OpenReceiver open = new OpenReceiver();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RecipientGuard.RecipientIsContract.selector, address(open)));
        guard.send{ value: 1 ether }(address(open), false);

        vm.prank(alice);
        guard.send{ value: 1 ether }(address(open), true);
        assertEq(open.received(), 1 ether);
    }

    function test_send_toContractThatCannotReceive_reverts() public {
        ClosedReceiver closed = new ClosedReceiver();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RecipientGuard.NativeTransferFailed.selector, address(closed)));
        guard.send{ value: 1 ether }(address(closed), true);
    }

    function test_delegatedWallet_isStillAWallet() public {
        // EIP-7702: bob's account carries a 23-byte delegation designator. Still a wallet, still checked.
        vm.etch(bob, abi.encodePacked(hex"ef0100", stranger));
        assertEq(uint8(guard.check(bob)), uint8(RecipientGuard.Verdict.Permissioned));
        permission.setAllowed(bob, false);
        assertEq(uint8(guard.check(bob)), uint8(RecipientGuard.Verdict.NotPermissioned));
    }

    // ---- tokens ----

    function test_sendToken_toPermissionedWallet() public {
        vm.startPrank(alice);
        token.approve(address(guard), 5e18);
        vm.expectEmit(true, true, true, true);
        emit RecipientGuard.TokenSent(address(token), alice, bob, 5e18);
        guard.sendToken(IERC20(address(token)), bob, 5e18, false);
        vm.stopPrank();
        assertEq(token.balanceOf(bob), 5e18);
        assertEq(token.balanceOf(address(guard)), 0, "the guard keeps nothing");
    }

    function test_sendToken_toUnpermissionedWallet_reverts() public {
        vm.startPrank(alice);
        token.approve(address(guard), 5e18);
        vm.expectRevert(abi.encodeWithSelector(RecipientGuard.RecipientNotPermissioned.selector, stranger));
        guard.sendToken(IERC20(address(token)), stranger, 5e18, false);
        vm.stopPrank();
        assertEq(token.balanceOf(alice), 1_000_000e18, "nothing left the sender");
    }

    function test_sendToken_withoutApproval_reverts() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(guard), 0, 5e18)
        );
        guard.sendToken(IERC20(address(token)), bob, 5e18, false);
    }

    function test_sendToken_nothing_reverts() public {
        vm.prank(alice);
        vm.expectRevert(RecipientGuard.NothingToSend.selector);
        guard.sendToken(IERC20(address(token)), bob, 0, false);
    }

    // ---- what the check is, and is not ----

    /// The five credential states belong to a dApp's recipe, not to the network gate. Whatever a
    /// verifier says about the recipient's credential, the guard's verdict follows `isAllowed` alone.
    function test_check_ignoresTheFiveCredentialStates() public {
        ReceptorMock verifier = new ReceptorMock();
        EligibilityStatus[5] memory states = [
            EligibilityStatus.NeverIssued,
            EligibilityStatus.Valid,
            EligibilityStatus.Expired,
            EligibilityStatus.Revoked,
            EligibilityStatus.WrongJurisdiction
        ];
        for (uint256 i = 0; i < states.length; i++) {
            verifier.setStatus(bob, 18, states[i]);
            permission.setAllowed(bob, true);
            assertEq(uint8(guard.check(bob)), uint8(RecipientGuard.Verdict.Permissioned));
            permission.setAllowed(bob, false);
            assertEq(uint8(guard.check(bob)), uint8(RecipientGuard.Verdict.NotPermissioned));
        }
    }

    function test_check_verdicts() public view {
        assertEq(uint8(guard.check(address(0))), uint8(RecipientGuard.Verdict.Zero));
        assertEq(uint8(guard.check(bob)), uint8(RecipientGuard.Verdict.Permissioned));
        assertEq(uint8(guard.check(stranger)), uint8(RecipientGuard.Verdict.NotPermissioned));
        assertEq(uint8(guard.check(address(guard))), uint8(RecipientGuard.Verdict.Contract));
    }

    /// Fuzz: whatever the recipient and the amount, RBNT reaches a plain wallet only when it is permissioned.
    function testFuzz_send_onlyPermissionedWalletsReceive(address to, bool allowed, uint96 amount) public {
        vm.assume(to != address(0) && to.code.length == 0 && to != alice && amount > 0);
        vm.assume(uint160(to) > 0xff); // not a precompile
        permission.setAllowed(to, allowed);
        vm.deal(alice, amount);
        uint256 before = to.balance;
        vm.prank(alice);
        if (allowed) {
            guard.send{ value: amount }(to, false);
            assertEq(to.balance - before, amount);
        } else {
            vm.expectRevert(abi.encodeWithSelector(RecipientGuard.RecipientNotPermissioned.selector, to));
            guard.send{ value: amount }(to, false);
        }
    }
}
