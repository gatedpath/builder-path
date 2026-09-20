// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @dev Mimics the archived Redbelly example's `AvererVerifierContract`: a `VCVerifierBaseContract`
/// child whose `_postVerification` hook flips `verificationStatus[user]`. The base is not public,
/// so `verifyCredential` here just calls the hook for the sender; the signature is the one the
/// example's script calls.
contract FakeVCVerifierChild {
    string public credentialType;
    mapping(address => bool) public verificationStatus;

    constructor(string memory credentialType_) {
        credentialType = credentialType_;
    }

    function verifyCredential(string calldata, string calldata, string calldata) external {
        _postVerification(msg.sender);
    }

    function revoke(address user) external {
        verificationStatus[user] = false;
    }

    function _postVerification(address userAddress) internal {
        verificationStatus[userAddress] = true;
    }
}

/// @dev A contract with code that does not expose `verificationStatus`; every call reverts.
contract RevertingTarget {
    fallback() external {
        revert("nope");
    }
}
