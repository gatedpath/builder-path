// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { GatedTicket } from "../src/GatedTicket.sol";
import { EligibilityStatus, IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";

/// @notice Card 7's live use on testnet (26 October 2026), in four phases signed separately so the
/// refusals between them are read against the real network's state. On 153 only the owner's wallet can
/// transact, so it is the buyer, the seller, the door and the organiser in turn; the roles are still
/// enforced by the contract. What one wallet cannot show live is a resale to a second buyer, because the
/// buyer must send the transaction: that path is proven on the fork and the page says so.
///
///   PHASE=1  seed the sender Valid on request 18 on the shared mock, buy ticket 0 at face value, list it at the cap.
///            Between: a stranger on buy, a listing over the cap, a plain transfer and a wrong price, all refused (read-only).
///   PHASE=2  delist ticket 0, the door checks it in, a second address is seeded eligible (it never transacts).
///            Between: list and transfer refused TicketUsed, a second check-in refused AlreadyCheckedIn.
///   PHASE=3  the organiser refunds ticket 0 at face value; buy ticket 1; the sender's credential is set Revoked.
///            Between: purchase refused NotEligible while revoked; ticket 1 still held.
///   PHASE=4  the organiser refunds ticket 1 to the revoked holder (a burn checks nothing), then the credential is restored.
contract LiveTicket is RedbellyDeployScript {
    GatedTicket constant TICKET = GatedTicket(payable(0x7296ABEffB78f95B061D9F635714379C43a6E1E1));
    ReceptorMock constant MOCK = ReceptorMock(0x2E652B946DC303d8f53bC92D0787e13B109003e5);
    uint64 constant REQUEST = 18;
    address constant SECOND_HOLDER = 0x000000000000000000000000000000000000D0c8; // never transacts

    function run() external {
        Preflight memory p = preflight();
        if (p.chainId == Redbelly.MAINNET_CHAIN_ID) revert("testnet only");
        uint256 phase = vm.envOr("PHASE", uint256(0));
        uint256 face = TICKET.faceValue();

        if (phase == 1) {
            vm.startBroadcast();
            MOCK.setStatus(p.deployer, REQUEST, EligibilityStatus.Valid);
            uint256 id = TICKET.purchase{ value: face }();
            TICKET.list(id, TICKET.resaleCap());
            vm.stopBroadcast();
            console2.log("bought ticket", id, "at", face);
            console2.log("listed at the cap", TICKET.resaleCap());
        } else if (phase == 2) {
            vm.startBroadcast();
            TICKET.delist(0);
            TICKET.checkIn(0);
            // A second address that only ever receives, seeded eligible so a plain transfer to it can be
            // shown refused for the right reason (the resale rule) and not for the recipient's credential.
            MOCK.setStatus(SECOND_HOLDER, REQUEST, EligibilityStatus.Valid);
            vm.stopBroadcast();
            console2.log("ticket 0 delisted and checked in; transferable:", TICKET.isTransferable(0));
        } else if (phase == 3) {
            vm.startBroadcast();
            TICKET.refund(0);
            uint256 id = TICKET.purchase{ value: face }();
            MOCK.setStatus(p.deployer, REQUEST, EligibilityStatus.Revoked);
            vm.stopBroadcast();
            console2.log("ticket 0 refunded; bought ticket", id, "; credential now Revoked on 18");
        } else if (phase == 4) {
            vm.startBroadcast();
            TICKET.refund(1);
            MOCK.setStatus(p.deployer, REQUEST, EligibilityStatus.Valid);
            vm.stopBroadcast();
            console2.log("ticket 1 refunded to the revoked holder; credential restored");
        } else {
            revert("pass PHASE=1, 2, 3 or 4");
        }
        console2.log("tickets in circulation:", TICKET.totalSupply(), " contract balance:", address(TICKET).balance);
    }
}
