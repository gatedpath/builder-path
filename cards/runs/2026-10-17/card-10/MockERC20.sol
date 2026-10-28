// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice A plain 18-decimal ERC-20 anyone may mint, standing in for the two pool tokens in tests and
/// on the local fork. Under `src/` so the deploy script can deploy it off mainnet; the constructor
/// refuses chain 151 so it can never be a pool token on mainnet, even by accident.
contract MockERC20 is ERC20 {
    error MainnetForbidden(uint256 chainId);

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        if (block.chainid == 151) revert MainnetForbidden(block.chainid);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
