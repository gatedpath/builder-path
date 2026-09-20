    function assertRevertsForAllInvalidStates(address target, bytes memory callData, address wallet, uint64 requestId)
        internal
    {
        _requireReady(target);
        EligibilityStatus[4] memory states = invalidStates();
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(wallet, requestId, states[i]);
            _expectNotEligible(target, callData, wallet, wallet, requestId, states[i]);
        }
        mock.setStatus(wallet, requestId, EligibilityStatus.Valid);
        _expectSuccess(target, callData, wallet, "Valid");
    }
