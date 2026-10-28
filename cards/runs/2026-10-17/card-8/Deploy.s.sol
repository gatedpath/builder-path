// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { InvoiceFinancing } from "../src/InvoiceFinancing.sol";
import { MockStablecoin } from "../src/mocks/MockStablecoin.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";

/// @notice Deploys InvoiceFinancing after the pre-flight in RedbellyDeployScript.
///
/// Environment (public addresses only, never a key):
///   ADMIN_SAFE          Safe 1.4.1 that owns the contract. Required on 151, recommended on 153.
///   VERIFIER            The investor gate's verifier (an adapter over your ZKPVerifier). Required
///                       on 151. Off mainnet a ReceptorMock is deployed when unset; the log says so
///                       in capitals.
///   REQUEST_ID          The investor recipe's request id. Default 708, the AU wholesale investor
///                       recipe (recipes/au-wholesale-investor).
///   BUSINESS_VERIFIER   The lister gate's verifier: a BusinessDelegateAdapter over the business's
///                       BusinessIdentifier (recipes/business-delegate). Required on 151. Off mainnet,
///                       when unset, the investor verifier answers the lister gate too, by request id,
///                       which is how one ReceptorMock seeds both gates on a local fork.
///   LISTER_REQUEST_ID   The business-delegate recipe's request id. Default 0 (delegate or
///                       representative); 1 is representatives only.
///   STABLECOIN          The ERC-20 invoices settle in. Required on 151. Off mainnet a MockStablecoin
///                       is deployed when unset.
///
/// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
///   forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
///   forge script script/Deploy.s.sol --rpc-url redbelly_mainnet --ledger --broadcast
contract Deploy is RedbellyDeployScript {
    function run() external returns (InvoiceFinancing financing) {
        Preflight memory p = preflight();
        bool mainnet = p.chainId == Redbelly.MAINNET_CHAIN_ID;

        address investorVerifier = optionalEnvAddress("VERIFIER");
        address businessVerifier = optionalEnvAddress("BUSINESS_VERIFIER");
        address stablecoin = optionalEnvAddress("STABLECOIN");
        uint64 investorRequestId = uint64(vm.envOr("REQUEST_ID", uint256(708)));
        uint64 listerRequestId = uint64(vm.envOr("LISTER_REQUEST_ID", uint256(0)));

        if (investorVerifier == address(0)) {
            if (mainnet) revert("VERIFIER is not set; mainnet never deploys a mock verifier");
            console2.log(
                "VERIFIER not set: DEPLOYING RECEPTOR MOCK for the investor gate. Every wallet starts ineligible; setStatus() decides. Not for mainnet."
            );
        } else {
            require(investorVerifier.code.length > 0, "VERIFIER is not a contract");
        }
        if (businessVerifier == address(0)) {
            if (mainnet) revert("BUSINESS_VERIFIER is not set; mainnet never deploys a mock for the lister gate");
            console2.log(
                "BUSINESS_VERIFIER not set: THE INVESTOR VERIFIER ANSWERS THE LISTER GATE TOO, by request id. Not for mainnet."
            );
        } else {
            require(businessVerifier.code.length > 0, "BUSINESS_VERIFIER is not a contract");
        }
        if (stablecoin == address(0)) {
            if (mainnet) revert("STABLECOIN is not set; mainnet never deploys a mock stablecoin");
            console2.log(
                "STABLECOIN not set: DEPLOYING MOCK STABLECOIN (mUSD, 6 decimals, anyone mints). Not for mainnet."
            );
        } else {
            require(stablecoin.code.length > 0, "STABLECOIN is not a contract");
        }

        vm.startBroadcast();
        if (investorVerifier == address(0)) investorVerifier = address(new ReceptorMock());
        if (businessVerifier == address(0)) businessVerifier = investorVerifier;
        if (stablecoin == address(0)) stablecoin = address(new MockStablecoin());
        financing = new InvoiceFinancing(
            p.admin,
            IERC20(stablecoin),
            IRedbellyVerifier(investorVerifier),
            investorRequestId,
            IRedbellyVerifier(businessVerifier),
            listerRequestId
        );
        vm.stopBroadcast();

        // The first "Name: 0x..." line is the one `npm run dev` reads as the contract; the rest carry
        // a space in the label on purpose so the loop never mistakes them for it.
        console2.log("InvoiceFinancing:", address(financing));
        console2.log("verifier:", investorVerifier);
        console2.log("business verifier:", businessVerifier);
        console2.log("lister request id:", listerRequestId);
        console2.log("stablecoin (ERC-20):", stablecoin);
        recordDeployment(
            "InvoiceFinancing",
            address(financing),
            p,
            "constructor(address,address,address,uint64,address,uint64)",
            abi.encode(p.admin, stablecoin, investorVerifier, investorRequestId, businessVerifier, listerRequestId),
            investorVerifier,
            investorRequestId
        );
    }
}
