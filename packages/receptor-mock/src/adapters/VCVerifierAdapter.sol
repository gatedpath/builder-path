// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EligibilityStatus, IRedbellyVerifier} from "../IRedbellyVerifier.sol";

/// @notice The per-wallet getter a `VCVerifierBaseContract` child exposes when it follows
/// Redbelly's archived example (`github.com/redbellynetwork/receptor-verifier-contract-example`,
/// `src/AvererVerifierContract.sol`, commit 07c9849 of 7 April 2025): the child declares
/// `mapping(address => bool) public verificationStatus` and sets it in `_postVerification`.
/// The example's deployment at 0x5c414F9243588750E4BB1Ec181270ad42A0b791F on chain 153 answers
/// this selector (0xadafb3d4) and returns true for the wallet in the example's sample credential
/// (read 2026-09-12).
interface IVCVerifierChild {
    function verificationStatus(address wallet) external view returns (bool);
}

/// @title VCVerifierAdapter
/// @notice Presents a `VCVerifierBaseContract` child as an `IRedbellyVerifier`.
/// @dev Coded against the child's `verificationStatus(address)` getter, the only per-wallet read
/// that is verifiable from a public source. The base contract itself ships in the GitHub Packages
/// npm package `receptor-standardvc-sc` under the redbellynetwork scope, which refuses unauthenticated
/// reads, so its own ABI is **verify**: from the example we know `verifyCredential(string issuerDid,
/// string canonicalVc, string canonicalProof)` is the external entry point and
/// `_postVerification(address)` the internal hook, and the deployed example also answers the
/// `credentialType()` selector; nothing else about the base is confirmed. A child that records
/// verification under a different name needs its own adapter.
///
/// The standard-VC path has no request id: one verifier contract checks one credential type,
/// fixed at construction. `requestId` is therefore ignored; deploy one adapter per verifier.
/// The target must have code for the same reason as in `Iden3VerifierAdapter`.
contract VCVerifierAdapter is IRedbellyVerifier {
    /// @notice Thrown when the target has no code.
    error TargetHasNoCode(address target);

    /// @notice The `VCVerifierBaseContract` child being adapted.
    address public immutable target;

    /// @param target_ A deployed `VCVerifierBaseContract` child exposing `verificationStatus(address)`.
    constructor(address target_) {
        if (target_.code.length == 0) revert TargetHasNoCode(target_);
        target = target_;
    }

    /// @inheritdoc IRedbellyVerifier
    /// @dev `requestId` is ignored; see the contract notes.
    function isEligible(
        address wallet,
        uint64 /* requestId */
    )
        public
        view
        returns (bool)
    {
        try IVCVerifierChild(target).verificationStatus(wallet) returns (bool verified) {
            return verified;
        } catch {
            return false;
        }
    }

    /// @inheritdoc IRedbellyVerifier
    /// @dev A real verifier only knows accepted or not, so this returns `Valid` or `NeverIssued`.
    function eligibilityStatus(address wallet, uint64 requestId) external view returns (EligibilityStatus) {
        return isEligible(wallet, requestId) ? EligibilityStatus.Valid : EligibilityStatus.NeverIssued;
    }
}
