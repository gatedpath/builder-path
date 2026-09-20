// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { GatedERC20 } from "../src/GatedERC20.sol";

/// @notice The Safe plus timelock admin pattern from docs/admin-pattern.md, wired exactly as
/// script/Deploy.s.sol wires it, and every path exercised: the fast emergency path (pause from
/// the Safe, no delay), the slow path (unpause, verifier change, role grant through the
/// timelock after the delay), and the refusals in between. The Safe is stood in for by an
/// address with `vm.prank`; what a Safe does is sign, and signing is not what is under test.
contract AdminPatternTest is GatedTest {
    uint64 internal constant REQUEST = 9;
    uint256 internal constant DELAY = 2 days;
    address internal safe = makeAddr("safe");
    address internal deployer = makeAddr("deployer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    TimelockController internal timelock;
    GatedERC20 internal token;

    function setUp() public {
        _deployMock();
        vm.warp(1_800_000_000);
        address[] memory proposers = new address[](1);
        proposers[0] = safe;
        address[] memory executors = new address[](1);
        executors[0] = safe;
        vm.startPrank(deployer);
        // admin = address(0): nobody can change the timelock's own roles without going through it.
        timelock = new TimelockController(DELAY, proposers, executors, address(0));
        token = new GatedERC20(
            "Gated",
            "GTOK",
            GatedERC20.Roles({ admin: address(timelock), pauser: safe, compliance: safe, issuerAdmin: safe }),
            mock,
            REQUEST,
            100e18
        );
        vm.stopPrank();
        mock.setStatus(alice, REQUEST, EligibilityStatus.Valid);
        mock.setStatus(bob, REQUEST, EligibilityStatus.Valid);
    }

    function _schedule(bytes memory data, bytes32 salt) internal returns (bytes32 id) {
        vm.prank(safe);
        timelock.schedule(address(token), 0, data, bytes32(0), salt, DELAY);
        id = timelock.hashOperation(address(token), 0, data, bytes32(0), salt);
    }

    function _execute(bytes memory data, bytes32 salt) internal {
        vm.prank(safe);
        timelock.execute(address(token), 0, data, bytes32(0), salt);
    }

    function test_deployerHoldsNothing() public view {
        assertFalse(token.hasRole(token.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(token.hasRole(token.PAUSER_ROLE(), deployer));
        assertFalse(token.hasRole(token.COMPLIANCE_ROLE(), deployer));
        assertFalse(token.hasRole(token.ISSUER_ADMIN_ROLE(), deployer));
        assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), deployer));
        assertTrue(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), address(timelock)));
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), address(timelock)));
        assertTrue(token.hasRole(token.PAUSER_ROLE(), safe));
        assertEq(timelock.getMinDelay(), DELAY);
    }

    function test_emergencyPath_pauseIsImmediate_unpauseWaits() public {
        // The pause: one Safe transaction, effective in the same block.
        vm.prank(safe);
        token.pause();
        assertTrue(token.paused());

        // The Safe cannot unpause directly...
        vm.prank(safe);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, safe, bytes32(0))
        );
        token.unpause();

        // ...it schedules the unpause on the timelock and waits out the delay.
        bytes memory data = abi.encodeCall(token.unpause, ());
        bytes32 id = _schedule(data, bytes32("unpause-1"));
        assertTrue(timelock.isOperationPending(id));
        vm.prank(safe);
        vm.expectRevert(
            abi.encodeWithSelector(
                TimelockController.TimelockUnexpectedOperationState.selector, id, bytes32(uint256(1 << 2))
            )
        );
        timelock.execute(address(token), 0, data, bytes32(0), bytes32("unpause-1"));

        vm.warp(block.timestamp + DELAY);
        _execute(data, bytes32("unpause-1"));
        assertFalse(token.paused());
    }

    function test_slowPath_verifierChangeGoesThroughTheTimelock() public {
        vm.prank(safe);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, safe, bytes32(0))
        );
        token.setRequestId(10);

        bytes memory data = abi.encodeCall(token.setRequestId, (10));
        _schedule(data, bytes32("rid"));
        vm.warp(block.timestamp + DELAY);
        _execute(data, bytes32("rid"));
        assertEq(token.requestId(), 10);
    }

    function test_slowPath_cancelBeforeExecution() public {
        bytes memory data = abi.encodeCall(token.setRequestId, (10));
        bytes32 id = _schedule(data, bytes32("rid"));
        vm.prank(safe);
        timelock.cancel(id);
        vm.warp(block.timestamp + DELAY);
        vm.prank(safe);
        vm.expectRevert(
            abi.encodeWithSelector(
                TimelockController.TimelockUnexpectedOperationState.selector, id, bytes32(uint256(1 << 2))
            )
        );
        timelock.execute(address(token), 0, data, bytes32(0), bytes32("rid"));
        assertEq(token.requestId(), REQUEST);
    }

    function test_slowPath_roleGrant_thenOperationalRoleActsAtOnce() public {
        address newCompliance = makeAddr("newCompliance");
        bytes memory data = abi.encodeCall(token.grantRole, (token.COMPLIANCE_ROLE(), newCompliance));
        _schedule(data, bytes32("grant"));
        vm.warp(block.timestamp + DELAY);
        _execute(data, bytes32("grant"));
        assertTrue(token.hasRole(token.COMPLIANCE_ROLE(), newCompliance));

        // Operational roles act without delay: that is the point of keeping them off the timelock.
        vm.prank(safe);
        token.setIssuer(safe, 0, uint64(block.timestamp + 1 days), 1_000e18);
        vm.prank(safe);
        token.mint(alice, 10e18);
        vm.prank(newCompliance);
        token.forceTransfer(alice, bob, 4e18, keccak256("ticket-42"));
        assertEq(token.balanceOf(bob), 4e18);
    }

    function test_strangerCanDoNothing() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, timelock.PROPOSER_ROLE()
            )
        );
        timelock.schedule(address(token), 0, abi.encodeCall(token.unpause, ()), bytes32(0), bytes32(0), DELAY);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, token.PAUSER_ROLE()
            )
        );
        token.pause();
        vm.stopPrank();
    }

    function test_delayCannotBeShortenedWithoutTheTimelock() public {
        vm.prank(safe);
        vm.expectRevert(abi.encodeWithSelector(TimelockController.TimelockUnauthorizedCaller.selector, safe));
        timelock.updateDelay(1);
    }
}
