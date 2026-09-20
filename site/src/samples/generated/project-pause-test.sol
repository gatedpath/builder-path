    /// Take a snapshot at the pause, let everyone try every way of moving a balance, compare.
    function test_nothingTheTokenHoldsChangesWhilePaused_includingThroughMint() public {
        vm.prank(pauser);
        token.pause();
        uint256 supply = token.totalSupply();
        uint256 aliceBalance = token.balanceOf(alice);
        uint256 bobBalance = token.balanceOf(bob);

        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.transfer(bob, 1);
        vm.prank(bob);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.subscribe();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.burn(1);
        vm.prank(issuer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.mint(bob, 1);
        vm.prank(compliance);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        token.forceTransfer(alice, bob, 1, keccak256("court order"));

        assertEq(token.totalSupply(), supply, "supply moved while paused");
        assertEq(token.balanceOf(alice), aliceBalance, "alice moved while paused");
        assertEq(token.balanceOf(bob), bobBalance, "bob moved while paused");
        assertFalse(token.hasSubscribed(bob), "a subscription landed while paused");
    }
