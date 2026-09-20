// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IRedbellyVerifier} from "./IRedbellyVerifier.sol";

/// @title Gated
/// @notice Abstract base that requires a Receptor credential on a function.
/// @dev Holds one verifier and one request id. A child contract applies `gated` to functions
/// the caller must be eligible for, and `gatedFor(account)` when a second party (a transfer
/// recipient, a beneficiary) must be eligible too. Admin changes go through `setVerifier` and
/// `setRequestId`, which call the abstract `_authorizeVerifierChange` hook; the child wires that
/// hook to whatever owns it (OpenZeppelin `Ownable`, `AccessControl`, a Safe). The base has no
/// owner of its own, so forgetting the hook is a compile error, not a silent open door.
///
/// On denial the gate reverts with `NotEligible(wallet, requestId)`. An event cannot survive a
/// revert, so there is no event on the reverting path. A kit that wants a denial on the log
/// (a gated ERC-20 that skips a transfer instead of reverting, say) calls `_checkEligible`,
/// emits `EligibilityDenied` through `_recordDenial`, and decides what to do. This matters on
/// Redbelly more than elsewhere: the governors RPC serves no trace methods, so a reverted
/// transaction's custom error is not recoverable from the chain after the fact.
///
/// No `tx.origin`, no loops, no storage of anything personal: the verifier address and a
/// request id are the only state.
abstract contract Gated {
    /// @notice Thrown when `wallet` holds no accepted proof for `requestId`.
    /// @param wallet The address that failed the check.
    /// @param requestId The request id the gate is bound to.
    error NotEligible(address wallet, uint64 requestId);

    /// @notice Thrown when a zero address is supplied as the verifier.
    error ZeroVerifier();

    /// @notice Emitted by `_recordDenial` when a child records a denial without reverting.
    /// @param wallet The address that failed the check.
    /// @param requestId The request id the gate is bound to.
    /// @param verifier The verifier that answered.
    event EligibilityDenied(address indexed wallet, uint64 indexed requestId, address indexed verifier);

    /// @notice Emitted when the verifier address changes, including at construction.
    /// @param previousVerifier The verifier before the change (zero at construction).
    /// @param newVerifier The verifier after the change.
    event VerifierChanged(address indexed previousVerifier, address indexed newVerifier);

    /// @notice Emitted when the request id changes, including at construction.
    /// @param previousRequestId The request id before the change (zero at construction).
    /// @param newRequestId The request id after the change.
    event RequestIdChanged(uint64 previousRequestId, uint64 newRequestId);

    IRedbellyVerifier private _verifier;
    uint64 private _requestId;

    /// @param verifier_ The verifier to consult. Must not be zero.
    /// @param requestId_ The request id every gate in this contract is bound to.
    constructor(IRedbellyVerifier verifier_, uint64 requestId_) {
        _setVerifier(verifier_);
        _setRequestId(requestId_);
    }

    /// @notice Requires `msg.sender` to be eligible.
    modifier gated() {
        _requireEligible(msg.sender);
        _;
    }

    /// @notice Requires `account` to be eligible; use it for the second party of a transfer.
    /// @param account The address that must hold an accepted proof.
    modifier gatedFor(address account) {
        _requireEligible(account);
        _;
    }

    /// @notice The verifier this contract consults.
    function verifier() public view returns (IRedbellyVerifier) {
        return _verifier;
    }

    /// @notice The request id this contract's gates are bound to.
    function requestId() public view returns (uint64) {
        return _requestId;
    }

    /// @notice Whether `wallet` would pass this contract's gates right now.
    /// @param wallet The address to check.
    /// @return True when the verifier accepts the wallet for this contract's request id.
    function isEligible(address wallet) public view returns (bool) {
        return _checkEligible(wallet);
    }

    /// @notice Points the gates at a different verifier. Authorised by `_authorizeVerifierChange`.
    /// @param newVerifier The verifier to consult from now on. Must not be zero.
    function setVerifier(IRedbellyVerifier newVerifier) external {
        _authorizeVerifierChange();
        _setVerifier(newVerifier);
    }

    /// @notice Binds the gates to a different request id. Authorised by `_authorizeVerifierChange`.
    /// @param newRequestId The request id to check from now on.
    function setRequestId(uint64 newRequestId) external {
        _authorizeVerifierChange();
        _setRequestId(newRequestId);
    }

    /// @dev The child decides who may change the verifier or request id. Revert to deny.
    /// Typical bodies: `onlyOwner` as a modifier with an empty body, or
    /// `_checkRole(DEFAULT_ADMIN_ROLE)`.
    function _authorizeVerifierChange() internal virtual;

    /// @dev Asks the verifier without reverting. Children use this to log or skip instead of revert.
    /// @param wallet The address to check.
    /// @return True when the verifier accepts the wallet for this contract's request id.
    function _checkEligible(address wallet) internal view returns (bool) {
        return _verifier.isEligible(wallet, _requestId);
    }

    /// @dev Reverts with `NotEligible` unless the verifier accepts the wallet.
    /// @param wallet The address to check.
    function _requireEligible(address wallet) internal view {
        if (!_checkEligible(wallet)) revert NotEligible(wallet, _requestId);
    }

    /// @dev Emits `EligibilityDenied`. Call it on a non-reverting denial path; on a reverting
    /// path the event would be rolled back with everything else.
    /// @param wallet The address that failed the check.
    function _recordDenial(address wallet) internal {
        emit EligibilityDenied(wallet, _requestId, address(_verifier));
    }

    function _setVerifier(IRedbellyVerifier newVerifier) private {
        if (address(newVerifier) == address(0)) revert ZeroVerifier();
        address previous = address(_verifier);
        _verifier = newVerifier;
        emit VerifierChanged(previous, address(newVerifier));
    }

    function _setRequestId(uint64 newRequestId) private {
        uint64 previous = _requestId;
        _requestId = newRequestId;
        emit RequestIdChanged(previous, newRequestId);
    }
}
