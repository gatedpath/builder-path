    /// @dev Only the admin may repoint the verifier or the request id.
    function _authorizeVerifierChange() internal view override onlyRole(DEFAULT_ADMIN_ROLE) { }
