// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EligibilityStatus, IRedbellyVerifier} from "../IRedbellyVerifier.sol";

/// @notice The read function exposed by `@iden3/contracts` 1.x `ZKPVerifier` (read at 1.4.8):
/// the public mapping `proofs[sender][requestId]`. This is the shape the Redbelly docs example
/// (`docs.redbelly.network/pages/methods/proof-by-query/contract-example/`) is written against.
interface IIden3ZKPVerifierV1 {
    function proofs(address sender, uint64 requestId) external view returns (bool);
}

/// @notice The read function exposed by `@iden3/contracts` 2.x `ZKPVerifierBase`,
/// `EmbeddedZKPVerifier` and `UniversalVerifier` through `IZKPVerifier` (read at 2.5.0).
/// Reverts when the request id was never set.
interface IIden3ZKPVerifierV2 {
    function isProofVerified(address sender, uint64 requestId) external view returns (bool);
}

/// @notice The read function exposed by `@iden3/contracts` 3.x `Verifier`, `EmbeddedVerifier`
/// and `UniversalVerifier` through `IVerifier` (read at 3.4.0, the npm `latest`, and at master
/// commit 610249b of 15 June 2026). Request ids widened to `uint256`. Reverts when the request
/// id was never set.
interface IIden3VerifierV3 {
    function isRequestProofVerified(address sender, uint256 requestId) external view returns (bool);
}

/// @title Iden3VerifierAdapter
/// @notice Presents a deployed Iden3 verifier-family contract as an `IRedbellyVerifier`.
/// @dev The Iden3 packages pin `pragma solidity 0.8.27` exactly, so they cannot be imported into
/// a 0.8.30 build; the three interfaces above restate only the one read function each release
/// exposes. Pick the `Surface` that matches the release the target was compiled from. A revert
/// from the target (2.x and 3.x revert for an unknown request id) reads as not eligible: a
/// request that was never set admits nobody. The target must have code: a call to an empty
/// address would return no data, and a return-data decoding failure is not caught by `try`.
contract Iden3VerifierAdapter is IRedbellyVerifier {
    /// @notice Which `@iden3/contracts` release line the target exposes.
    enum Surface {
        ZKPVerifierV1,
        ZKPVerifierV2,
        VerifierV3
    }

    /// @notice Thrown when the target has no code.
    error TargetHasNoCode(address target);

    /// @notice The Iden3 verifier being adapted.
    address public immutable target;

    /// @notice The release line the target exposes.
    Surface public immutable surface;

    /// @param target_ A deployed Iden3 verifier-family contract.
    /// @param surface_ The release line it was compiled from.
    constructor(address target_, Surface surface_) {
        if (target_.code.length == 0) revert TargetHasNoCode(target_);
        target = target_;
        surface = surface_;
    }

    /// @inheritdoc IRedbellyVerifier
    function isEligible(address wallet, uint64 requestId) public view returns (bool) {
        if (surface == Surface.ZKPVerifierV1) {
            try IIden3ZKPVerifierV1(target).proofs(wallet, requestId) returns (bool verified) {
                return verified;
            } catch {
                return false;
            }
        }
        if (surface == Surface.ZKPVerifierV2) {
            try IIden3ZKPVerifierV2(target).isProofVerified(wallet, requestId) returns (bool verified) {
                return verified;
            } catch {
                return false;
            }
        }
        try IIden3VerifierV3(target).isRequestProofVerified(wallet, uint256(requestId)) returns (bool verified) {
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
