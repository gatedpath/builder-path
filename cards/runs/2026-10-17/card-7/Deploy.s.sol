// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { GatedTicket } from "../src/GatedTicket.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";

/// @notice Deploys GatedTicket (card 7) after the pre-flight in RedbellyDeployScript, then opens
/// the sale. The scaffold's GatedERC20 stays in src/ with its tests; this project's contract is
/// the ticket, so `npm run dev` deploys it and seeds the five wallets against its request id.
///
/// Environment (public addresses only, never a key):
///   ADMIN_SAFE   Safe 1.4.1 that becomes the organiser (and the door, until a scanner wallet
///                is granted DOOR_ROLE). Required on 151, recommended on 153.
///   VERIFIER     Your dApp's verifier contract. Required on 151. On 153 and local chains a
///                ReceptorMock is deployed when unset, so the first deploy works before you
///                have a real verifier; the log says so in capitals.
///   REQUEST_ID   The eligibility request id your verifier answers for. Default 18, the
///                over-18 recipe (recipes/over-18).
///   FACE_VALUE   Price of one ticket in wei of RBNT. Default 1 RBNT.
///   MAX_SUPPLY   How many tickets exist. Default 100.
///   RESALE_CAP_BPS  Resale ceiling in basis points of face value. Default 11000 (110%).
///
/// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
///   forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
///   forge script script/Deploy.s.sol --rpc-url redbelly_mainnet --ledger --broadcast
contract Deploy is RedbellyDeployScript {
    function run() external returns (GatedTicket ticket) {
        Preflight memory p = preflight();

        address verifier = optionalEnvAddress("VERIFIER");
        uint64 requestId = uint64(vm.envOr("REQUEST_ID", uint256(18)));
        uint256 faceValue = vm.envOr("FACE_VALUE", uint256(1 ether));
        uint256 maxSupply = vm.envOr("MAX_SUPPLY", uint256(100));
        uint256 resaleCapBps = vm.envOr("RESALE_CAP_BPS", uint256(11_000));
        if (verifier == address(0)) {
            if (p.chainId == Redbelly.MAINNET_CHAIN_ID) {
                revert("VERIFIER is not set; mainnet never deploys a mock verifier");
            }
            console2.log(
                "VERIFIER not set: DEPLOYING RECEPTOR MOCK. Every wallet starts ineligible; setStatus() decides. Not for mainnet."
            );
        } else {
            require(verifier.code.length > 0, "VERIFIER is not a contract");
        }

        vm.startBroadcast();
        if (verifier == address(0)) verifier = address(new ReceptorMock());
        // Organiser and door both to the admin. Grant DOOR_ROLE to the scanner's wallet afterwards,
        // so the wallet at the door never holds the money.
        GatedTicket.Roles memory roles = GatedTicket.Roles({ organiser: p.admin, door: p.admin });
        ticket = new GatedTicket(
            "Card 7 Ticket", "TIX", roles, IRedbellyVerifier(verifier), requestId, faceValue, maxSupply, resaleCapBps
        );
        // Opening the sale is a separate admin call; when the admin is a Safe the Safe makes it,
        // so the deployer only opens it here when it holds the role itself.
        if (p.admin == p.deployer) ticket.setSalesOpen(true);
        vm.stopBroadcast();

        console2.log("GatedTicket:", address(ticket));
        console2.log("verifier:", verifier);
        console2.log("face value (wei):", faceValue);
        console2.log("resale cap (wei):", ticket.resaleCap());
        if (p.admin != p.deployer) console2.log("sales are closed until the admin calls setSalesOpen(true)");
        recordDeployment(
            "GatedTicket",
            address(ticket),
            p,
            "constructor(string,string,(address,address),address,uint64,uint256,uint256,uint256)",
            abi.encode("Card 7 Ticket", "TIX", roles, verifier, requestId, faceValue, maxSupply, resaleCapBps),
            verifier,
            requestId
        );
    }
}
