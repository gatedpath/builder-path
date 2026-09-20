// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { GatedERC20 } from "../src/GatedERC20.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";

/// @notice Deploys GatedERC20 after the pre-flight in RedbellyDeployScript.
///
/// Environment (public addresses only, never a key):
///   ADMIN_SAFE   Safe 1.4.1 that receives every role. Required on 151, recommended on 153.
///   VERIFIER     Your dApp's verifier contract. Required on 151. On 153 and local chains a
///                ReceptorMock is deployed when unset, so the first deploy works before you
///                have a real verifier; the log says so in capitals.
///   REQUEST_ID   The eligibility request id your verifier answers for. Default 708, the AU
///                wholesale investor recipe (recipes/au-wholesale-investor); over-18 is 18.
///
/// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
///   forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
///   forge script script/Deploy.s.sol --rpc-url redbelly_mainnet --ledger --broadcast
contract Deploy is RedbellyDeployScript {
    function run() external returns (GatedERC20 token) {
        Preflight memory p = preflight();

        address verifier = optionalEnvAddress("VERIFIER");
        uint64 requestId = uint64(vm.envOr("REQUEST_ID", uint256(708)));
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
        // Every role to the admin. For mainnet, split them: docs/admin-pattern.md in the contract kit
        // and its script/Deploy.s.sol put the admin role on a timelock and the others on Safes.
        GatedERC20.Roles memory roles =
            GatedERC20.Roles({ admin: p.admin, pauser: p.admin, compliance: p.admin, issuerAdmin: p.admin });
        token = new GatedERC20("Gated Token", "GTOK", roles, IRedbellyVerifier(verifier), requestId, 100e18);
        vm.stopBroadcast();

        console2.log("GatedERC20:", address(token));
        console2.log("verifier:", verifier);
        recordDeployment(
            "GatedERC20",
            address(token),
            p,
            "constructor(string,string,(address,address,address,address),address,uint64,uint256)",
            abi.encode("Gated Token", "GTOK", roles, verifier, requestId, uint256(100e18)),
            verifier,
            requestId
        );
    }
}
