    /// @notice Random holdings, a coupon, a random sale, another coupon. What the three holders
    /// are owed never exceeds what was funded, and the rounding dust left behind is under one
    /// base unit per holder per coupon.
    function testFuzz_owedNeverExceedsFunded(uint96 a, uint96 b, uint96 sold) public {
        uint256 unitsA = bound(uint256(a), 1, 1_000_000e18);
        uint256 unitsB = bound(uint256(b), 1, 1_000_000e18);
        if (unitsA + unitsB > 1_000_000e18) unitsB = 1_000_000e18 - unitsA + 1;
        vm.assume(unitsA + unitsB <= 1_000_000e18);
        _issue(alice, unitsA);
        _issue(bob, unitsB);
        _payCoupon(1);

        _valid(carol);
        uint256 moved = bound(uint256(sold), 0, unitsA);
        vm.prank(alice);
        bond.transfer(carol, moved);
        _payCoupon(2);

        uint256 owed = bond.claimable(alice) + bond.claimable(bob) + bond.claimable(carol);
        assertLe(owed, bond.totalFunded(), "owed more than was funded: the last claimant would be refused");
        // three holders, two coupons: each holder's share rounds down by under one base unit per coupon,
        // and each funding rounds up by under one
        assertLe(bond.totalFunded() - owed, 8, "more dust than the rounding rule allows");
        assertEq(stable.balanceOf(address(bond)), bond.totalFunded());

        // and every one of them can actually be paid
        address[3] memory holders = [alice, bob, carol];
        for (uint256 i = 0; i < holders.length; ++i) {
            if (bond.claimable(holders[i]) == 0) continue;
            vm.prank(holders[i]);
            bond.claimCoupons();
        }
        assertEq(bond.totalClaimed(), owed);
    }
