// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { GatedExample } from "../src/GatedExample.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";

/// @notice Deploys GatedExample after the pre-flight in RedbellyDeployScript.
///
/// Environment (public addresses only, never a key):
///   ADMIN_SAFE   Safe 1.4.1 that owns the contract. Required on 151, recommended on 153.
///   VERIFIER     Your dApp's verifier contract. Required on 151. On 153 and local chains a
///                ReceptorMock is deployed when unset; the log says so in capitals.
///   REQUEST_ID   The eligibility request id your verifier answers for. Default 18, the
///                over-18 recipe (recipes/over-18); the AU wholesale recipe is 708.
///
/// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
///   forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
contract Deploy is RedbellyDeployScript {
    function run() external returns (GatedExample example) {
        Preflight memory p = preflight();

        address verifier = optionalEnvAddress("VERIFIER");
        uint64 requestId = uint64(vm.envOr("REQUEST_ID", uint256(18)));
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
        example = new GatedExample(p.admin, IRedbellyVerifier(verifier), requestId);
        vm.stopBroadcast();

        console2.log("GatedExample:", address(example));
        console2.log("verifier:", verifier);
        recordDeployment(
            "GatedExample",
            address(example),
            p,
            "constructor(address,address,uint64)",
            abi.encode(p.admin, verifier, requestId),
            verifier,
            requestId
        );
    }
}
