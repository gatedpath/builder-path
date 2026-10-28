// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice A stand-in for an `@iden3/contracts` 2.x `ZKPVerifier` child, the contract the AU wholesale
/// investor recipe expects a dApp to deploy for request 708: `setZKPRequest` registers a request, the
/// holder's accepted proof is recorded per (wallet, request), and `isProofVerified` answers it, reverting
/// for a request that was never set, as the real one does. There is no proof here: `recordProof` stands
/// where `submitZKPResponse` would, so a rehearsal can exercise the kit's `Iden3VerifierAdapter` on its
/// real code path. Off mainnet only.
contract MockZKPVerifierV2 {
    error RequestIdNotFound(uint64 requestId);
    error NotForMainnet();

    mapping(uint64 requestId => bool set) public requestSet;
    mapping(address wallet => mapping(uint64 requestId => bool verified)) private _proofs;

    constructor() {
        if (block.chainid == 151) revert NotForMainnet();
    }

    function setZKPRequest(uint64 requestId) external {
        requestSet[requestId] = true;
    }

    /// @notice Stands in for `submitZKPResponse`: the verifier accepted (or on revocation, withdrew) a proof.
    function recordProof(address wallet, uint64 requestId, bool verified) external {
        if (!requestSet[requestId]) revert RequestIdNotFound(requestId);
        _proofs[wallet][requestId] = verified;
    }

    function isProofVerified(address sender, uint64 requestId) external view returns (bool) {
        if (!requestSet[requestId]) revert RequestIdNotFound(requestId);
        return _proofs[sender][requestId];
    }
}
