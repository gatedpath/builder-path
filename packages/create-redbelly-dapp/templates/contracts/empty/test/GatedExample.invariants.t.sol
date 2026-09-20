// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { GatedExample } from "../src/GatedExample.sol";

contract PingHandler is Test {
    GatedExample public example;
    ReceptorMock public receptor;
    uint64 public requestId;
    address[] public actors;
    uint256 public successfulPings;
    uint256 public pingsByIneligible;

    constructor(GatedExample e, ReceptorMock r, uint64 id) {
        example = e;
        receptor = r;
        requestId = id;
        for (uint256 i = 0; i < 4; i++) {
            actors.push(address(uint160(0x2000 + i)));
        }
    }

    function setStatus(uint256 seed, uint8 state) external {
        receptor.setStatus(actors[seed % actors.length], requestId, EligibilityStatus(state % 5));
    }

    function ping(uint256 seed) external {
        address a = actors[seed % actors.length];
        bool eligible = receptor.isEligible(a, requestId);
        vm.prank(a);
        try example.ping() {
            successfulPings++;
            if (!eligible) pingsByIneligible++;
        } catch { }
    }
}

contract GatedExampleInvariants is Test {
    GatedExample internal example;
    PingHandler internal handler;

    function setUp() public {
        ReceptorMock receptor = new ReceptorMock();
        example = new GatedExample(makeAddr("admin"), receptor, 1);
        handler = new PingHandler(example, receptor, 1);
        targetContract(address(handler));
    }

    /// The counter only moves through successful, eligible calls.
    function invariant_pingsCountEligibleCallsOnly() public view {
        assertEq(example.pings(), handler.successfulPings());
        assertEq(handler.pingsByIneligible(), 0);
    }
}
