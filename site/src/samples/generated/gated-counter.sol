// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Gated} from "../../src/Gated.sol";
import {IRedbellyVerifier} from "../../src/IRedbellyVerifier.sol";

/// @title GatedCounter
/// @notice The smallest useful `Gated` child: a counter only eligible wallets can move, plus a
/// two-party action that needs both sides eligible, plus a non-reverting path that logs the
/// denial. Wires `_authorizeVerifierChange` to OpenZeppelin `Ownable`.
contract GatedCounter is Gated, Ownable {
    /// @notice Emitted on every increment.
    event Incremented(address indexed by, uint256 newCount);

    /// @notice Emitted on every nudge between two eligible wallets.
    event Nudged(address indexed from, address indexed to, uint256 total);

    /// @notice How many times `increment` has run.
    uint256 public count;

    /// @notice How many times `from` has nudged `to`.
    mapping(address from => mapping(address to => uint256)) public nudges;

    /// @param verifier_ The verifier (mock or adapter).
    /// @param requestId_ The request id this counter is bound to.
    constructor(IRedbellyVerifier verifier_, uint64 requestId_) Gated(verifier_, requestId_) Ownable(msg.sender) {}

    /// @notice Adds one. Caller must be eligible.
    function increment() external gated {
        count += 1;
        emit Incremented(msg.sender, count);
    }

    /// @notice Records a nudge. Both the caller and `to` must be eligible.
    /// @param to The counterparty.
    function nudge(address to) external gated gatedFor(to) {
        nudges[msg.sender][to] += 1;
        emit Nudged(msg.sender, to, nudges[msg.sender][to]);
    }

    /// @notice Adds one if the caller is eligible; otherwise logs the denial and returns false.
    /// @dev Shows the non-reverting path: the denial stays on the log, which matters on a chain
    /// without trace RPC methods.
    /// @return True when the counter moved.
    function tryIncrement() external returns (bool) {
        if (!_checkEligible(msg.sender)) {
            _recordDenial(msg.sender);
            return false;
        }
        count += 1;
        emit Incremented(msg.sender, count);
        return true;
    }

    /// @dev Only the owner may repoint the verifier or request id.
    function _authorizeVerifierChange() internal override onlyOwner {}
}
