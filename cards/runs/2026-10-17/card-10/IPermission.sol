// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title IPermission
/// @notice The network gate: the contract the bootstrap registry names `permission` on both Redbelly
/// networks. `isAllowed(wallet)` is true once the wallet has been identity-verified at
/// access.redbelly.network. The chain itself refuses transactions from a wallet that fails it; the
/// pool asks it again about a recipient, because `to` in a swap or a burn can be any address.
interface IPermission {
    function isAllowed(address wallet) external view returns (bool);
}
