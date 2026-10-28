// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IERC20Min {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// Throwaway probe: does a stablecoin let a contract be the sender? Nothing else.
contract Forwarder {
    function send(address token, address to, uint256 amount) external returns (bool) {
        return IERC20Min(token).transfer(to, amount);
    }

    function pull(address token, address from, address to, uint256 amount) external returns (bool) {
        return IERC20Min(token).transferFrom(from, to, amount);
    }
}
