    /// @notice Move tokens out of any wallet, with the hash of the written reason. The recipient
    /// must be eligible; the sender need not be (that is the point). Refused while paused.
    /// @dev Both parties must be real wallets. In an ERC-20 a move from the zero address is a mint
    /// and a move to it is a burn, and neither belongs to the compliance role: minting is the
    /// issuers', inside their allowance and window, and burning is the holder's.
    /// @param justificationHash keccak256 of the document that authorised the move. Never zero.
    function forceTransfer(address from, address to, uint256 amount, bytes32 justificationHash)
        external
        onlyRole(COMPLIANCE_ROLE)
        gatedFor(to)
    {
        if (from == address(0) || to == address(0)) revert ZeroParty();
        if (justificationHash == bytes32(0)) revert EmptyJustification();
        _forcing = true;
        _update(from, to, amount);
        _forcing = false;
        emit ForcedTransfer(from, to, amount, justificationHash, msg.sender);
    }
