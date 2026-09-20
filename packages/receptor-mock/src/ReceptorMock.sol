// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {EligibilityStatus, IRedbellyVerifier} from "./IRedbellyVerifier.sol";

/// @title ReceptorMock
/// @notice A verifier for tests and Anvil forks that lets a test put any wallet into any of the
/// five credential states, per request id or for every request id at once.
/// @dev Resolution order for `(wallet, requestId)`: a record set with `setStatus` or
/// `setValidUntil` for that exact pair wins; otherwise a record set with `setStatusAll` or
/// `setValidUntilAll` for the wallet applies; otherwise the wallet is `NeverIssued`. A record that
/// is `Valid` with a non-zero `expiresAt` reads as `Expired` once `block.timestamp` reaches it,
/// so `vm.warp` tests work without touching the mock again.
///
/// Anyone may call the setters: this is a test tool, not an access-controlled contract. `freeze`
/// makes every later change revert so a test cannot loosen the mock half way through a run.
/// The constructor refuses chain 151 so the mock can never stand in for a real verifier on
/// mainnet, even by accident; on a mainnet fork use `vm.chainId` if you truly need it there.
contract ReceptorMock is IRedbellyVerifier {
    /// @notice One stored state.
    /// @param isSet False for a slot nobody wrote; distinguishes "set to NeverIssued" from unset.
    /// @param status The stored state before the expiry rule is applied.
    /// @param expiresAt Unix time from which a `Valid` record reads as `Expired`; zero means never.
    struct Record {
        bool isSet;
        EligibilityStatus status;
        uint64 expiresAt;
    }

    /// @notice Thrown by every setter after `freeze`.
    error MockIsFrozen();

    /// @notice Thrown by the constructor on Redbelly mainnet.
    /// @param chainId The chain id the constructor saw.
    error MainnetForbidden(uint256 chainId);

    /// @notice Emitted when a per-request record is written.
    event StatusSet(address indexed wallet, uint64 indexed requestId, EligibilityStatus status, uint64 expiresAt);

    /// @notice Emitted when a wallet-wide record is written.
    event StatusSetAll(address indexed wallet, EligibilityStatus status, uint64 expiresAt);

    /// @notice Emitted when a per-request record is removed.
    event StatusCleared(address indexed wallet, uint64 indexed requestId);

    /// @notice Emitted when a wallet-wide record is removed.
    event StatusClearedAll(address indexed wallet);

    /// @notice Emitted once, when the mock is frozen.
    event MockFrozen(address indexed by);

    uint256 private constant REDBELLY_MAINNET = 151;

    /// @notice True once `freeze` has been called; no setter works after that.
    bool public frozen;

    mapping(address wallet => mapping(uint64 requestId => Record)) private _byRequest;
    mapping(address wallet => Record) private _forAllRequests;

    constructor() {
        if (block.chainid == REDBELLY_MAINNET) revert MainnetForbidden(block.chainid);
    }

    modifier notFrozen() {
        _requireNotFrozen();
        _;
    }

    /// @inheritdoc IRedbellyVerifier
    function isEligible(address wallet, uint64 requestId) external view returns (bool) {
        return eligibilityStatus(wallet, requestId) == EligibilityStatus.Valid;
    }

    /// @inheritdoc IRedbellyVerifier
    function eligibilityStatus(address wallet, uint64 requestId) public view returns (EligibilityStatus) {
        Record memory record = _byRequest[wallet][requestId];
        if (!record.isSet) record = _forAllRequests[wallet];
        if (!record.isSet) return EligibilityStatus.NeverIssued;
        // Expiry is the point: the mock compares block.timestamp on purpose (Slither and forge lint both flag it).
        // slither-disable-next-line timestamp
        // forge-lint: disable-next-line(block-timestamp)
        if (record.status == EligibilityStatus.Valid && record.expiresAt != 0 && block.timestamp >= record.expiresAt) {
            return EligibilityStatus.Expired;
        }
        return record.status;
    }

    /// @notice The stored record for an exact pair, before the expiry rule and without fallback.
    /// @param wallet The wallet.
    /// @param requestId The request id.
    /// @return The raw record; `isSet` false means nothing was written for this pair.
    function recordFor(address wallet, uint64 requestId) external view returns (Record memory) {
        return _byRequest[wallet][requestId];
    }

    /// @notice The stored wallet-wide record, before the expiry rule.
    /// @param wallet The wallet.
    /// @return The raw record; `isSet` false means nothing was written for this wallet.
    function recordForAll(address wallet) external view returns (Record memory) {
        return _forAllRequests[wallet];
    }

    /// @notice Puts `wallet` into `status` for `requestId`, with no expiry.
    /// @param wallet The wallet.
    /// @param requestId The request id.
    /// @param status The state to report.
    function setStatus(address wallet, uint64 requestId, EligibilityStatus status) external notFrozen {
        _byRequest[wallet][requestId] = Record({isSet: true, status: status, expiresAt: 0});
        emit StatusSet(wallet, requestId, status, 0);
    }

    /// @notice Makes `wallet` `Valid` for `requestId` until `expiresAt`, then `Expired`.
    /// @param wallet The wallet.
    /// @param requestId The request id.
    /// @param expiresAt Unix time at which validity ends; zero means it never ends.
    function setValidUntil(address wallet, uint64 requestId, uint64 expiresAt) external notFrozen {
        _byRequest[wallet][requestId] = Record({isSet: true, status: EligibilityStatus.Valid, expiresAt: expiresAt});
        emit StatusSet(wallet, requestId, EligibilityStatus.Valid, expiresAt);
    }

    /// @notice Puts `wallet` into `status` for every request id that has no record of its own.
    /// @param wallet The wallet.
    /// @param status The state to report.
    function setStatusAll(address wallet, EligibilityStatus status) external notFrozen {
        _forAllRequests[wallet] = Record({isSet: true, status: status, expiresAt: 0});
        emit StatusSetAll(wallet, status, 0);
    }

    /// @notice Makes `wallet` `Valid` for every request id without its own record, until `expiresAt`.
    /// @param wallet The wallet.
    /// @param expiresAt Unix time at which validity ends; zero means it never ends.
    function setValidUntilAll(address wallet, uint64 expiresAt) external notFrozen {
        _forAllRequests[wallet] = Record({isSet: true, status: EligibilityStatus.Valid, expiresAt: expiresAt});
        emit StatusSetAll(wallet, EligibilityStatus.Valid, expiresAt);
    }

    /// @notice Removes the per-request record so the wallet-wide record, or `NeverIssued`, applies.
    /// @param wallet The wallet.
    /// @param requestId The request id.
    function clearStatus(address wallet, uint64 requestId) external notFrozen {
        delete _byRequest[wallet][requestId];
        emit StatusCleared(wallet, requestId);
    }

    /// @notice Removes the wallet-wide record.
    /// @param wallet The wallet.
    function clearStatusAll(address wallet) external notFrozen {
        delete _forAllRequests[wallet];
        emit StatusClearedAll(wallet);
    }

    /// @notice Makes every later setter revert. Irreversible.
    function freeze() external notFrozen {
        frozen = true;
        emit MockFrozen(msg.sender);
    }

    function _requireNotFrozen() private view {
        if (frozen) revert MockIsFrozen();
    }
}
