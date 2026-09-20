    /// @dev Every movement of units passes through here. `super._update` first: it is the
    /// eligibility check and the pause, and it must never be skipped. Then the corrections that
    /// keep each wallet's accrued coupons exactly what they were before its balance changed.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        int256 shift = (_cumulativeCouponPerUnit * value).toInt256();
        if (from != address(0)) _corrections[from] += shift;
        if (to != address(0)) _corrections[to] -= shift;
    }
