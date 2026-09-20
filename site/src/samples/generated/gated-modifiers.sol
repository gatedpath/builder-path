    modifier gated() {
        _requireEligible(msg.sender);
        _;
    }

    /// @notice Requires `account` to be eligible; use it for the second party of a transfer.
    /// @param account The address that must hold an accepted proof.
    modifier gatedFor(address account) {
        _requireEligible(account);
        _;
    }
