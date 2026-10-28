// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Stands in for an ERC-3643 register in tests: an ERC-20 that answers `identityRegistry()` with a
/// contract (the census's test for a register) and refuses every transfer whose parties are not both
/// registered, the way a T-REX token does. The distributor never calls it; the tests use it to show that
/// a holder table read at a snapshot block is paid by that table even after balances move, and that no
/// register transfer is ever attempted by the distributor.
contract MockRegister is ERC20 {
    MockIdentityRegistry public immutable registry;

    error NotRegistered(address wallet);

    constructor() ERC20("CLASS A", "A") {
        registry = new MockIdentityRegistry();
    }

    function identityRegistry() external view returns (address) {
        return address(registry);
    }

    function register(address wallet) external {
        registry.set(wallet, true);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && !registry.isVerified(from)) revert NotRegistered(from);
        if (to != address(0) && !registry.isVerified(to)) revert NotRegistered(to);
        super._update(from, to, amount);
    }
}

contract MockIdentityRegistry {
    mapping(address => bool) private _verified;

    function set(address wallet, bool verified) external {
        _verified[wallet] = verified;
    }

    function isVerified(address wallet) external view returns (bool) {
        return _verified[wallet];
    }
}
