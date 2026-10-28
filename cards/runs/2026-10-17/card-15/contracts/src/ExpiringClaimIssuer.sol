// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { MessageHashUtils } from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/// @notice A claim issuer whose claims can expire. ONCHAINID's reference ClaimIssuer knows two states for a
/// claim, valid and revoked, and its `isClaimValid` is not virtual, so expiry cannot be added to it by
/// inheritance. This contract answers the same three questions the identity registry and the investor's
/// identity ask (`isClaimValid`, `isClaimRevoked`, `revokeClaimBySignature`) and adds a third state:
/// the signed claim data carries `abi.encode(uint256 validUntil, bytes32 reference)`, and a claim whose
/// `validUntil` has passed is refused like one that was never signed. `validUntil` of zero means no expiry.
///
/// The owner (the issuer's Safe) manages the signers and revokes; the signers hold no on-chain role but
/// their key, which signs `toEthSignedMessageHash(keccak256(abi.encode(identity, topic, data)))`, the
/// same hash the reference ClaimIssuer checks.
contract ExpiringClaimIssuer is Ownable {
    mapping(address signer => bool active) public isSigner;
    mapping(bytes32 signatureHash => bool revoked) private _revoked;

    event SignerSet(address indexed signer, bool active);
    event ClaimRevoked(bytes signature);

    error ZeroAddress();
    error AlreadyRevoked();

    constructor(address initialOwner, address firstSigner) Ownable(initialOwner) {
        if (firstSigner != address(0)) {
            isSigner[firstSigner] = true;
            emit SignerSet(firstSigner, true);
        }
    }

    function setSigner(address signer, bool active) external onlyOwner {
        if (signer == address(0)) revert ZeroAddress();
        isSigner[signer] = active;
        emit SignerSet(signer, active);
    }

    function revokeClaimBySignature(bytes calldata signature) external onlyOwner {
        bytes32 key = keccak256(signature);
        if (_revoked[key]) revert AlreadyRevoked();
        _revoked[key] = true;
        emit ClaimRevoked(signature);
    }

    function isClaimRevoked(bytes calldata signature) external view returns (bool) {
        return _revoked[keccak256(signature)];
    }

    /// @dev The hash a signer signs (before the Ethereum signed-message prefix), for tooling.
    function claimHash(address identity, uint256 topic, bytes calldata data) external pure returns (bytes32) {
        return keccak256(abi.encode(identity, topic, data));
    }

    function isClaimValid(address identity, uint256 topic, bytes calldata signature, bytes calldata data)
        external
        view
        returns (bool)
    {
        // Anything that is not (validUntil, reference) was not signed under this issuer's scheme.
        if (data.length != 64) return false;
        (uint256 validUntil,) = abi.decode(data, (uint256, bytes32));
        // An expiry is a clock comparison by definition; the granularity an issuer uses is days, and a
        // block producer moving the clock by seconds changes nothing. The linter flags every such read.
        // forge-lint: disable-next-line(block-timestamp)
        if (validUntil != 0 && block.timestamp > validUntil) return false;
        if (_revoked[keccak256(signature)]) return false;

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(keccak256(abi.encode(identity, topic, data)));
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError) return false;
        return isSigner[recovered];
    }
}
