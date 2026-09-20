    /// @dev Every mint, burn and transfer passes through here. The real parties must be
    /// eligible unless a compliance officer is forcing the move, and then only the recipient.
    /// @dev `virtual` so a product built on the kit (a bond that accrues coupons, a fund that tracks
    /// units) can account for every balance change. An override MUST call `super._update` first, or
    /// it bypasses the eligibility check and the pause; the bond in project 5 shows the shape.
    function _update(address from, address to, uint256 value) internal virtual override(ERC20, ERC20Pausable) {
        if (!_forcing) {
            if (from != address(0)) _requireEligible(from);
            if (to != address(0)) _requireEligible(to);
        }
        super._update(from, to, value);
    }
