// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { PropertyUnits } from "../src/PropertyUnits.sol";
import { RentDistributor } from "../src/RentDistributor.sol";
import { SaleVote } from "../src/SaleVote.sol";
import { MockStable } from "./mocks/MockStable.sol";

/// @notice The Safe plus 48-hour timelock in front of all three contracts, wired as the kit's
/// AdminPattern.t.sol wires the token: the Safe (an address under `vm.prank`; signing is not what
/// is under test) proposes and executes on the timelock, the timelock is every contract's admin,
/// and the operational roles sit on the Safe and act at once.
contract PropertyAdminPatternTest is GatedTest {
    uint64 internal constant REQUEST = 708;
    uint256 internal constant DELAY = 48 hours;
    address internal safe = makeAddr("safe");
    address internal deployer = makeAddr("deployer");
    address internal alice = makeAddr("alice");
    TimelockController internal timelock;
    PropertyUnits internal units;
    RentDistributor internal rent;
    SaleVote internal vote;

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
        units = new PropertyUnits("u", PropertyUnits.Roles({ admin: address(timelock), issuer: safe }), mock, REQUEST);
        MockStable stable = new MockStable();
        rent = new RentDistributor(
            units, stable, RentDistributor.Roles({ admin: address(timelock), manager: safe }), mock, REQUEST
        );
        vote = new SaleVote(units, SaleVote.Roles({ admin: address(timelock), proposer: safe }), mock, REQUEST);
        vm.stopPrank();
        mock.setStatus(alice, REQUEST, EligibilityStatus.Valid);
    }

    function _schedule(address target, bytes memory data, bytes32 salt) internal returns (bytes32 id) {
        vm.prank(safe);
        timelock.schedule(target, 0, data, bytes32(0), salt, DELAY);
        id = timelock.hashOperation(target, 0, data, bytes32(0), salt);
    }

    function test_deployerHoldsNothing() public view {
        assertFalse(units.hasRole(units.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(rent.hasRole(rent.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(vote.hasRole(vote.DEFAULT_ADMIN_ROLE(), deployer));
        assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), deployer));
        assertTrue(units.hasRole(units.DEFAULT_ADMIN_ROLE(), address(timelock)));
        assertTrue(rent.hasRole(rent.DEFAULT_ADMIN_ROLE(), address(timelock)));
        assertTrue(vote.hasRole(vote.DEFAULT_ADMIN_ROLE(), address(timelock)));
        assertTrue(units.hasRole(units.ISSUER_ROLE(), safe));
        assertTrue(rent.hasRole(rent.MANAGER_ROLE(), safe));
        assertTrue(vote.hasRole(vote.PROPOSER_ROLE(), safe));
        assertEq(timelock.getMinDelay(), 48 hours);
    }

    function test_adminCall_refusedBeforeTheTimelockElapses() public {
        // The Safe cannot call the admin function directly...
        vm.prank(safe);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, safe, bytes32(0))
        );
        units.setRequestId(18);

        // ...it schedules the change and cannot execute it early: at 0 h, at 47 h 59 min...
        bytes memory data = abi.encodeCall(units.setRequestId, (18));
        bytes32 id = _schedule(address(units), data, bytes32("rid"));
        assertTrue(timelock.isOperationPending(id));
        bytes memory early = abi.encodeWithSelector(
            TimelockController.TimelockUnexpectedOperationState.selector, id, bytes32(uint256(1 << 2))
        );
        vm.prank(safe);
        vm.expectRevert(early);
        timelock.execute(address(units), 0, data, bytes32(0), bytes32("rid"));
        vm.warp(block.timestamp + DELAY - 60);
        vm.prank(safe);
        vm.expectRevert(early);
        timelock.execute(address(units), 0, data, bytes32(0), bytes32("rid"));
        assertEq(units.requestId(), REQUEST, "unchanged");

        // ...and at 48 h the change lands.
        vm.warp(block.timestamp + 60);
        vm.prank(safe);
        timelock.execute(address(units), 0, data, bytes32(0), bytes32("rid"));
        assertEq(units.requestId(), 18);
    }

    function test_slowPath_onEachContract() public {
        bytes memory rentData = abi.encodeCall(rent.setRequestId, (18));
        bytes memory voteData = abi.encodeCall(vote.setRequestId, (18));
        _schedule(address(rent), rentData, bytes32("rent"));
        _schedule(address(vote), voteData, bytes32("vote"));
        vm.prank(safe);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, safe, bytes32(0))
        );
        rent.setRequestId(18);
        vm.warp(block.timestamp + DELAY);
        vm.startPrank(safe);
        timelock.execute(address(rent), 0, rentData, bytes32(0), bytes32("rent"));
        timelock.execute(address(vote), 0, voteData, bytes32(0), bytes32("vote"));
        vm.stopPrank();
        assertEq(rent.requestId(), 18);
        assertEq(vote.requestId(), 18);
    }

    function test_operationalRoles_actAtOnce() public {
        vm.startPrank(safe);
        units.openProperty(1, 100, keccak256("terms"));
        units.issue(1, alice, 100);
        vm.warp(block.timestamp + 1); // the vote reads the previous second's units
        vote.propose(1, keccak256("sale"), 7 days);
        vm.stopPrank();
        assertEq(units.balanceOf(alice, 1), 100);
        assertEq(vote.proposalCount(), 1);
    }

    function test_strangerCanDoNothing() public {
        address stranger = makeAddr("stranger");
        vm.startPrank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, timelock.PROPOSER_ROLE()
            )
        );
        timelock.schedule(address(units), 0, abi.encodeCall(units.setRequestId, (18)), bytes32(0), bytes32(0), DELAY);
        vm.stopPrank();
        vm.prank(safe);
        vm.expectRevert(abi.encodeWithSelector(TimelockController.TimelockUnauthorizedCaller.selector, safe));
        timelock.updateDelay(1);
    }
}
