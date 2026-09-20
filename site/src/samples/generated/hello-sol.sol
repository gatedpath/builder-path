// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Smallest useful contract for walking the deploy path by hand.
/// One state variable, one write, one event. Nothing gated yet; gating comes
/// after the Receptor verifier address is confirmed (RESEARCH.md question 8).
contract Hello {
    string public greeting;
    address public immutable deployer;

    event GreetingSet(address indexed by, string greeting);

    constructor(string memory initial) {
        greeting = initial;
        deployer = msg.sender;
        emit GreetingSet(msg.sender, initial);
    }

    function set(string calldata next) external {
        greeting = next;
        emit GreetingSet(msg.sender, next);
    }
}
