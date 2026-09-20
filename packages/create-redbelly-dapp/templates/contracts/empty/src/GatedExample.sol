// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";

/// @title GatedExample
/// @notice The smallest useful contract on Redbelly: one function only an eligible wallet
/// can call. Replace `ping` with your own logic and keep the tests' shape: every gated
/// function tested in all five credential states.
contract GatedExample is Ownable, Gated {
    uint256 public pings;
    mapping(address wallet => uint256) public pingsBy;

    event Pinged(address indexed wallet, uint256 total);

    constructor(address admin, IRedbellyVerifier verifier_, uint64 requestId_)
        Ownable(admin)
        Gated(verifier_, requestId_)
    { }

    /// @notice The gated action. The web app calls this.
    function ping() external gated {
        pings += 1;
        pingsBy[msg.sender] += 1;
        emit Pinged(msg.sender, pings);
    }

    /// @notice Read-only mirror of `ping`'s condition for the UI. Not a substitute for the gate.
    function canPing(address wallet) external view returns (bool) {
        return isEligible(wallet);
    }

    function _authorizeVerifierChange() internal view override onlyOwner { }
}
