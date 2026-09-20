    function test_incrementAcrossAllFiveStates() public {
        assertRevertsForAllInvalidStates(address(counter), abi.encodeCall(counter.increment, ()), alice, REQUEST_ID);
        assertEq(counter.count(), 1, "only the Valid call should have counted");
    }

    function test_nudgeNeedsBothParties() public {
        assertGatedPair(address(counter), abi.encodeCall(counter.nudge, (bob)), alice, bob, REQUEST_ID);
        assertEq(counter.nudges(alice, bob), 2, "two successful nudges expected");
    }
