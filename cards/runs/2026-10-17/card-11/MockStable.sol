// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A plain six-decimal ERC-20 standing in for a stablecoin. Tests and the local rehearsal
/// only; nothing deploys it to a real network. Anyone may mint, which is the point of a mock.
contract MockStable is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
