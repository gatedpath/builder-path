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
