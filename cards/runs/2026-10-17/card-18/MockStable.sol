// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A six-decimal stablecoin stand-in for tests and the fork rehearsal. It can imitate the three
/// refusals a real coin might make: a deny list (AUDM has one), a coin that refuses contract spenders
/// (none of the three AUD coins on mainnet do, read 17 October 2026), and a coin that returns false
/// instead of reverting. Not for any real network.
contract MockStable is ERC20 {
    mapping(address => bool) public denied;
    mapping(address => bool) public returnsFalseFor;
    bool public refuseContractSpenders;

    error Denied(address account);
    error ContractSpender(address spender);

    constructor() ERC20("Mock AUD", "mAUD") { }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setDenied(address account, bool isDenied) external {
        denied[account] = isDenied;
    }

    function setReturnsFalseFor(address account, bool flag) external {
        returnsFalseFor[account] = flag;
    }

    function setRefuseContractSpenders(bool flag) external {
        refuseContractSpenders = flag;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (refuseContractSpenders && msg.sender.code.length > 0) revert ContractSpender(msg.sender);
        if (returnsFalseFor[to]) return false;
        return super.transferFrom(from, to, amount);
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (denied[from]) revert Denied(from);
        if (denied[to]) revert Denied(to);
        super._update(from, to, amount);
    }
}
