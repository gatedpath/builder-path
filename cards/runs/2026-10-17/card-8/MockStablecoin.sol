// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockStablecoin
/// @notice A plain six-decimal ERC-20 that anyone may mint, standing in for a stablecoin in tests
/// and on local forks. It lives under `src/` only so `script/Deploy.s.sol` can deploy it when
/// `STABLECOIN` is unset off mainnet, the way the scaffold deploys a `ReceptorMock` when `VERIFIER`
/// is unset. Like that mock, its constructor refuses chain 151.
contract MockStablecoin is ERC20 {
    /// @notice Thrown by the constructor on Redbelly mainnet.
    error MainnetForbidden(uint256 chainId);

    uint256 private constant REDBELLY_MAINNET = 151;

    constructor() ERC20("Mock USD", "mUSD") {
        if (block.chainid == REDBELLY_MAINNET) revert MainnetForbidden(block.chainid);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint to anyone. A test tool, not an access-controlled contract.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
