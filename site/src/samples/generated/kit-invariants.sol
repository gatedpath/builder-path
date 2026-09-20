    function invariant_noIneligibleRecipient() public view {
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            assertFalse(handler.receivedWhileIneligible(handler.actors(i)));
        }
    }

    /// Paused means no balance changed except through unpause.
    function invariant_noTransferWhilePaused() public view {
        assertEq(handler.stateChangesWhilePaused(), 0);
    }
