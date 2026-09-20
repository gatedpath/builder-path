// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A six-decimal stand-in for the stablecoin coupons are paid in. Tests only: it mints to
/// anyone who asks, which is exactly what a real stablecoin must never do.
contract MockStable is ERC20 {
    constructor() ERC20("Mock Stable", "mUSD") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
