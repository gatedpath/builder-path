// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The five credential states a gated function can meet.
/// @dev `NeverIssued` is deliberately zero so an unset mapping slot reads as "no credential".
/// Real verifiers on Redbelly (an Iden3 `ZKPVerifier` child or a `VCVerifierBaseContract` child)
/// expose only a boolean: the proof for a request was accepted, or it was not. The four non-valid
/// states exist so tests can name the reason a wallet fails. In Receptor terms: `Expired` is a
/// credential past its validity window, `Revoked` is an issuer revocation (Iden3 revocation
/// status in the reverse hash service), `WrongJurisdiction` is a credential whose claim does not
/// satisfy the query or whose issuer is not on the allow-list, and `NeverIssued` is no credential
/// at all. Adapters over real verifiers return `Valid` or `NeverIssued` only.
enum EligibilityStatus {
    NeverIssued,
    Valid,
    Expired,
    Revoked,
    WrongJurisdiction
}

/// @title IRedbellyVerifier
/// @notice The one interface the rest of this kit depends on. There is no network-wide verifier
/// on Redbelly; every dApp deploys its own. `Gated` therefore binds to this interface and an
/// adapter (or the mock) sits behind it.
interface IRedbellyVerifier {
    /// @notice Whether `wallet` holds an accepted proof for `requestId`.
    /// @param wallet The address whose eligibility is being checked.
    /// @param requestId The verifier request (Iden3 request id) the proof must satisfy.
    /// @return True when the wallet may pass a gate bound to this request.
    function isEligible(address wallet, uint64 requestId) external view returns (bool);

    /// @notice The credential state behind `isEligible`.
    /// @dev A mock and testing aid. Real verifiers cannot distinguish the non-valid states, so
    /// adapters return `Valid` or `NeverIssued` only. Do not branch production logic on the
    /// non-valid values.
    /// @param wallet The address whose eligibility is being checked.
    /// @param requestId The verifier request the proof must satisfy.
    /// @return The resolved state; `Valid` if and only if `isEligible` is true.
    function eligibilityStatus(address wallet, uint64 requestId) external view returns (EligibilityStatus);
}
