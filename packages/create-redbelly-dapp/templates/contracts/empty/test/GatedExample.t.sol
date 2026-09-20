// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { GatedExample } from "../src/GatedExample.sol";

contract GatedExampleTest is GatedTest {
    GatedExample internal example;
    uint64 internal constant REQUEST = 1;
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");

    function setUp() public {
        _deployMock();
        example = new GatedExample(admin, mock, REQUEST);
    }

    function test_ping_inAllFiveStates() public {
        // Four invalid states revert with NotEligible; the fifth (Valid) call goes through.
        assertRevertsForAllInvalidStates(address(example), abi.encodeCall(example.ping, ()), alice, REQUEST);
        assertEq(example.pings(), 1, "only the Valid call should have counted");
    }

    function test_ping_valid() public {
        mock.setStatus(alice, REQUEST, EligibilityStatus.Valid);
        assertTrue(example.canPing(alice));
        vm.expectEmit(true, false, false, true);
        emit GatedExample.Pinged(alice, 1);
        vm.prank(alice);
        example.ping();
        assertEq(example.pings(), 1);
        assertEq(example.pingsBy(alice), 1);
    }

    function test_setVerifierAndRequestId_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        example.setRequestId(2);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        example.setVerifier(mock);
        vm.prank(admin);
        example.setRequestId(2);
        assertEq(example.requestId(), 2);
    }

    /// Fuzz: any wallet in any state; only Valid gets through.
    function testFuzz_ping_onlyValid(address wallet, uint8 state) public {
        vm.assume(wallet != address(0));
        EligibilityStatus s = EligibilityStatus(state % 5);
        mock.setStatus(wallet, REQUEST, s);
        vm.prank(wallet);
        if (s == EligibilityStatus.Valid) {
            example.ping();
            assertEq(example.pingsBy(wallet), 1);
        } else {
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, wallet, REQUEST));
            example.ping();
        }
    }
}
