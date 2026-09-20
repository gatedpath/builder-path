    /// @notice Fund the next coupon. The amount is the fixed coupon times the units outstanding
    /// now; the caller approves that much stablecoin first. Refused before the due time, after
    /// the last coupon, while paused, and when no units exist to receive it.
    function payCoupon() external onlyRole(PAYING_AGENT_ROLE) whenNotPaused {
        uint32 number = couponsPaid + 1;
        if (number > totalCoupons) revert AllCouponsPaid();
        uint64 dueAt = couponDueAt(number);
        // A coupon date is days away, not seconds: a validator's few seconds of drift cannot matter.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < dueAt) revert CouponNotDue(number, dueAt);
        uint256 supply = totalSupply();
        if (supply == 0) revert NoUnitsOutstanding();

        uint256 amount = nextCouponAmount();
        couponsPaid = number;
        totalFunded += amount;
        _cumulativeCouponPerUnit += couponPerUnit;

        stablecoin.safeTransferFrom(msg.sender, address(this), amount);
        emit CouponPaid(number, amount, supply, msg.sender);
    }
