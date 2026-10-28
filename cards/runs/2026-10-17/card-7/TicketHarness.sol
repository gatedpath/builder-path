// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTicket } from "../../src/GatedTicket.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";

/// @notice Test-only child of the ticket that reaches the parent's own `_update` with a resale in
/// flight at a chosen price and no listing, so a test can prove the cap and the check-in lock live
/// inside the transfer itself and not only in `list` and `buy`. The test contract is organiser and
/// door. Never deployed.
contract TicketHarness is GatedTicket {
    constructor(IRedbellyVerifier verifier_, uint64 requestId_, uint256 faceValue_, uint256 maxSupply_, uint256 capBps_)
        GatedTicket(
            "Harness",
            "HRN",
            Roles({ organiser: msg.sender, door: msg.sender }),
            verifier_,
            requestId_,
            faceValue_,
            maxSupply_,
            capBps_
        )
    { }

    /// @notice Move `tokenId` to `to` the way `buy` does, at `price`, with no listing and no money.
    function moveAtPrice(address to, uint256 tokenId, uint256 price) external {
        _resaleInFlight = true;
        _priceInFlight = price;
        _update(to, tokenId, address(0));
        _resaleInFlight = false;
        _priceInFlight = 0;
    }
}
