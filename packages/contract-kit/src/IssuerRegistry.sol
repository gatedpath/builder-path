// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title IssuerRegistry
/// @notice Which addresses may mint, for how long, and how much. A mixin for a token: the
/// issuer admin grants each issuer a window (`validFrom` to `validUntil`) and an allowance;
/// the token calls `_consumeIssuance` on every mint and the call reverts once the window has
/// closed or the allowance is spent. Nothing here moves tokens; it only says who may.
///
/// Why time-boxed: on Redbelly the issuer of an asset is usually a business with a
/// BusinessIdentifier and a handful of delegate wallets. A permission that expires by itself
/// is one fewer thing to remember to revoke when a delegate leaves, and a monitor can alert
/// on `IssuerPermissionSet` with a window that looks too long.
abstract contract IssuerRegistry is AccessControl {
    /// @notice May grant, replace and revoke issuer permissions.
    bytes32 public constant ISSUER_ADMIN_ROLE = keccak256("ISSUER_ADMIN_ROLE");

    /// @notice One issuer's permission.
    /// @param validFrom Unix time from which the issuer may mint (inclusive).
    /// @param validUntil Unix time from which the issuer may no longer mint (exclusive).
    /// @param allowance Total amount the issuer may mint inside the window.
    /// @param minted Amount minted so far under this permission.
    struct IssuerPermission {
        uint64 validFrom;
        uint64 validUntil;
        uint256 allowance;
        uint256 minted;
    }

    /// @notice Emitted when a permission is granted or replaced. Replacing resets `minted`.
    event IssuerPermissionSet(address indexed issuer, uint64 validFrom, uint64 validUntil, uint256 allowance);

    /// @notice Emitted when a permission is removed before its window closes.
    event IssuerPermissionRevoked(address indexed issuer);

    /// @notice Emitted on every mint that consumed an allowance.
    event IssuanceConsumed(address indexed issuer, uint256 amount, uint256 remaining);

    /// @notice Thrown when a window is empty or already closed.
    error InvalidIssuerWindow(uint64 validFrom, uint64 validUntil);

    /// @notice Thrown when the issuer is zero.
    error ZeroIssuer();

    /// @notice Thrown when the caller holds no open permission right now.
    error IssuerNotActive(address issuer);

    /// @notice Thrown when a mint would exceed the issuer's remaining allowance.
    error IssuerAllowanceExceeded(address issuer, uint256 requested, uint256 remaining);

    mapping(address issuer => IssuerPermission) private _permissions;

    /// @notice Grants or replaces an issuer permission. Replacing resets what was minted.
    /// @param issuer The wallet that may mint. On Redbelly this is usually a business delegate.
    /// @param validFrom Start of the window, inclusive. Zero means now.
    /// @param validUntil End of the window, exclusive. Must be after `validFrom` and after now.
    /// @param allowance Total amount the issuer may mint inside the window.
    function setIssuer(address issuer, uint64 validFrom, uint64 validUntil, uint256 allowance)
        external
        onlyRole(ISSUER_ADMIN_ROLE)
    {
        if (issuer == address(0)) revert ZeroIssuer();
        // slither-disable-next-line timestamp
        uint64 nowTs = uint64(block.timestamp);
        if (validFrom == 0) validFrom = nowTs;
        if (validUntil <= validFrom || validUntil <= nowTs) revert InvalidIssuerWindow(validFrom, validUntil);
        _permissions[issuer] =
            IssuerPermission({ validFrom: validFrom, validUntil: validUntil, allowance: allowance, minted: 0 });
        emit IssuerPermissionSet(issuer, validFrom, validUntil, allowance);
    }

    /// @notice Removes an issuer permission.
    /// @param issuer The wallet to revoke.
    function revokeIssuer(address issuer) external onlyRole(ISSUER_ADMIN_ROLE) {
        delete _permissions[issuer];
        emit IssuerPermissionRevoked(issuer);
    }

    /// @notice The stored permission for `issuer`, whatever the time.
    function issuerPermission(address issuer) external view returns (IssuerPermission memory) {
        return _permissions[issuer];
    }

    /// @notice Whether `issuer` may mint at all right now.
    function isActiveIssuer(address issuer) public view returns (bool) {
        IssuerPermission storage p = _permissions[issuer];
        // A window measured in days does not care about the seconds a block producer can move a timestamp by.
        // slither-disable-next-line timestamp
        // forge-lint: disable-next-line(block-timestamp)
        return p.validUntil != 0 && block.timestamp >= p.validFrom && block.timestamp < p.validUntil;
    }

    /// @notice What `issuer` may still mint right now; zero outside the window.
    function remainingIssuance(address issuer) public view returns (uint256) {
        if (!isActiveIssuer(issuer)) return 0;
        IssuerPermission storage p = _permissions[issuer];
        return p.allowance - p.minted;
    }

    /// @notice Read-only mirror of `_consumeIssuance`'s conditions, for a UI or a monitor.
    function canIssue(address issuer, uint256 amount) external view returns (bool) {
        return isActiveIssuer(issuer) && remainingIssuance(issuer) >= amount;
    }

    /// @dev Spends `amount` of the issuer's allowance or reverts. The token calls this before
    /// minting; it is the only write path besides the admin setters.
    function _consumeIssuance(address issuer, uint256 amount) internal {
        if (!isActiveIssuer(issuer)) revert IssuerNotActive(issuer);
        IssuerPermission storage p = _permissions[issuer];
        uint256 remaining = p.allowance - p.minted;
        if (amount > remaining) revert IssuerAllowanceExceeded(issuer, amount, remaining);
        p.minted += amount;
        emit IssuanceConsumed(issuer, amount, remaining - amount);
    }
}
