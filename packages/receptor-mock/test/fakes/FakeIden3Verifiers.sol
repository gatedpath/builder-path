// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @dev Mimics `@iden3/contracts` 1.4.8 `ZKPVerifier`: a public `proofs` mapping, no revert for
/// unknown request ids.
contract FakeIden3V1 {
    mapping(address => mapping(uint64 => bool)) public proofs;

    function setProof(address sender, uint64 requestId, bool verified) external {
        proofs[sender][requestId] = verified;
    }
}

/// @dev Mimics `@iden3/contracts` 2.5.0 `ZKPVerifierBase.isProofVerified`, including the
/// `checkRequestExistence` revert for a request id that was never set.
contract FakeIden3V2 {
    error RequestIdNotFound(uint64 requestId);

    mapping(uint64 => bool) public requestExists;
    mapping(address => mapping(uint64 => bool)) private _verified;

    function setRequest(uint64 requestId) external {
        requestExists[requestId] = true;
    }

    function setProof(address sender, uint64 requestId, bool verified) external {
        _verified[sender][requestId] = verified;
    }

    function isProofVerified(address sender, uint64 requestId) external view returns (bool) {
        if (!requestExists[requestId]) revert RequestIdNotFound(requestId);
        return _verified[sender][requestId];
    }
}

/// @dev Mimics `@iden3/contracts` 3.4.0 `Verifier.isRequestProofVerified` with `uint256`
/// request ids and the same revert for an unknown request.
contract FakeIden3V3 {
    error RequestIdNotFound(uint256 requestId);

    mapping(uint256 => bool) public requestExists;
    mapping(uint256 => mapping(address => bool)) private _verified;

    function setRequest(uint256 requestId) external {
        requestExists[requestId] = true;
    }

    function setProof(address sender, uint256 requestId, bool verified) external {
        _verified[requestId][sender] = verified;
    }

    function isRequestProofVerified(address sender, uint256 requestId) external view returns (bool) {
        if (!requestExists[requestId]) revert RequestIdNotFound(requestId);
        return _verified[requestId][sender];
    }
}
