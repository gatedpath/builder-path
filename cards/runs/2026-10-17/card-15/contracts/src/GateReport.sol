// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IIdentityRegistry } from "./interfaces/ITrex.sol";

interface IPermission {
    function isAllowed(address wallet) external view returns (bool);
}

/// @notice Reads the two identity layers side by side and says which one refuses a wallet. The network
/// gate (`permission.isAllowed`, the contract the bootstrap registry names "permission") says whether the
/// wallet may transact on Redbelly at all; the register gate (the token's identity registry, `isVerified`)
/// says whether it holds the claims this token requires. A user interface calls `describe` and shows the
/// sentence; a program calls `check` and switches on the three booleans. Read-only; it writes nothing.
contract GateReport {
    struct Answer {
        // False when no permission contract exists at the address (a plain local chain).
        bool networkReadable;
        bool networkAllowed;
        bool registerVerified;
    }

    address public immutable permission;
    IIdentityRegistry public immutable registry;

    error ZeroAddress();

    constructor(address permission_, address registry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        permission = permission_;
        registry = IIdentityRegistry(registry_);
    }

    function check(address wallet) public view returns (Answer memory a) {
        if (permission.code.length > 0) {
            (bool ok, bytes memory raw) = permission.staticcall(abi.encodeCall(IPermission.isAllowed, (wallet)));
            if (ok && raw.length >= 32) {
                a.networkReadable = true;
                a.networkAllowed = abi.decode(raw, (bool));
            }
        }
        a.registerVerified = registry.isVerified(wallet);
    }

    function describe(address wallet) external view returns (string memory) {
        Answer memory a = check(wallet);
        if (!a.networkReadable) {
            return a.registerVerified
                ? "network gate unreadable on this chain; the register accepts this wallet"
                : "network gate unreadable on this chain; the register refuses this wallet (no valid claim for its topics)";
        }
        if (a.networkAllowed && a.registerVerified) return "allowed by both layers";
        if (a.registerVerified) {
            return "refused by the network gate (permission.isAllowed is false); the register would accept this wallet";
        }
        if (a.networkAllowed) {
            return "refused by the register (identityRegistry.isVerified is false); the network gate allows this wallet";
        }
        return "refused by both layers: the network gate and the register";
    }
}
