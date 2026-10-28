// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice A contract that accepts RBNT. Tests use it as the recipient the caller explicitly allows.
contract OpenReceiver {
    uint256 public received;

    receive() external payable {
        received += msg.value;
    }
}

/// @notice A contract with no way to receive RBNT. The forward to it fails, and the guard says so.
contract ClosedReceiver {
    uint256 public nothing;
}
