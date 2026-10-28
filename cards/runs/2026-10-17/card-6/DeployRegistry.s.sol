// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { CarbonCreditRegistry } from "../src/CarbonCreditRegistry.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";

/// @notice Deploys CarbonCreditRegistry after the pre-flight in RedbellyDeployScript. Sits beside
/// the template's Deploy.s.sol, which `npm run dev` runs; the rehearsal deploys this one by hand.
///
/// Environment (public addresses only, never a key):
///   ADMIN_SAFE          Safe 1.4.1 that receives the admin role. Required on 151.
///   VERIFIER            Your dApp's verifier. Required on 151; a ReceptorMock is deployed off mainnet when unset.
///   REQUEST_ID          The holder gate. Default 18: requests/holder-request-18.json.
///   ISSUER_REQUEST_ID   The minting gate. Default 100: recipes/accredited-issuer.
///
///   forge script script/DeployRegistry.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
contract DeployRegistry is RedbellyDeployScript {
    function run() external returns (CarbonCreditRegistry registry) {
        Preflight memory p = preflight();

        address verifier = optionalEnvAddress("VERIFIER");
        uint64 holderRequestId = uint64(vm.envOr("REQUEST_ID", uint256(18)));
        uint64 issuerRequestId = uint64(vm.envOr("ISSUER_REQUEST_ID", uint256(100)));
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
        registry = new CarbonCreditRegistry(p.admin, IRedbellyVerifier(verifier), holderRequestId, issuerRequestId);
        vm.stopBroadcast();

        console2.log("CarbonCreditRegistry:", address(registry));
        console2.log("verifier:", verifier);
        console2.log("holder request id:", holderRequestId);
        console2.log("issuer request id:", issuerRequestId);
        recordDeployment(
            "CarbonCreditRegistry",
            address(registry),
            p,
            "constructor(address,address,uint64,uint64)",
            abi.encode(p.admin, verifier, holderRequestId, issuerRequestId),
            verifier,
            holderRequestId
        );
    }
}
