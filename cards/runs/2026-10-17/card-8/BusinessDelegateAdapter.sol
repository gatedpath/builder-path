// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { EligibilityStatus, IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";

/// @notice The read side of a `BusinessIdentifier`: `hasRole` is a public view on OpenZeppelin's
/// AccessControl, which the real contract inherits.
interface IBusinessIdentifierRoles {
    function hasRole(bytes32 role, address account) external view returns (bool);
}

/// @title BusinessDelegateAdapter
/// @notice Presents one business's `BusinessIdentifier` as an `IRedbellyVerifier`, the adapter the
/// business-delegate recipe describes and the kit does not ship yet. Request id 0 accepts a delegate
/// or a representative; request id 1 accepts representatives only; any other request admits nobody.
/// The read is live: the moment a role is removed the gate refuses, with no stickiness and no window.
/// One adapter per business, pinned at deployment; the business gives you its identifier address.
contract BusinessDelegateAdapter is IRedbellyVerifier {
    bytes32 public constant AUTHORISED_REPRESENTATIVE_ROLE = keccak256("AUTHORISED_REPRESENTATIVE");
    bytes32 public constant AUTHORISED_DELEGATE_ROLE = keccak256("AUTHORISED_DELEGATE");

    uint64 public constant EITHER_ROLE = 0;
    uint64 public constant REPRESENTATIVES_ONLY = 1;

    error TargetHasNoCode(address target);

    /// @notice The business's identifier contract.
    IBusinessIdentifierRoles public immutable identifier;

    constructor(address identifier_) {
        if (identifier_.code.length == 0) revert TargetHasNoCode(identifier_);
        identifier = IBusinessIdentifierRoles(identifier_);
    }

    /// @inheritdoc IRedbellyVerifier
    function isEligible(address wallet, uint64 requestId) public view returns (bool) {
        if (requestId == REPRESENTATIVES_ONLY) return _has(AUTHORISED_REPRESENTATIVE_ROLE, wallet);
        if (requestId == EITHER_ROLE) {
            return _has(AUTHORISED_DELEGATE_ROLE, wallet) || _has(AUTHORISED_REPRESENTATIVE_ROLE, wallet);
        }
        return false;
    }

    /// @inheritdoc IRedbellyVerifier
    /// @dev A role read has two answers, so this is `Valid` or `NeverIssued` and nothing else.
    function eligibilityStatus(address wallet, uint64 requestId) external view returns (EligibilityStatus) {
        return isEligible(wallet, requestId) ? EligibilityStatus.Valid : EligibilityStatus.NeverIssued;
    }

    /// @dev A revert from the identifier (an upgrade in flight, a proxy without an implementation) reads
    /// as no role, the same rule the kit's Iden3 adapter applies.
    function _has(bytes32 role, address wallet) private view returns (bool) {
        try identifier.hasRole(role, wallet) returns (bool held) {
            return held;
        } catch {
            return false;
        }
    }
}
