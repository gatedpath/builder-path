// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { GrantEscrow } from "../src/GrantEscrow.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";

/// @notice Deploys GrantEscrow after the pre-flight in RedbellyDeployScript. Sits beside the
/// template's Deploy.s.sol, which `npm run dev` still runs for the token; this one is for the escrow.
///
/// Environment (public addresses only, never a key):
///   ADMIN_SAFE   Safe 1.4.1 that receives the admin role. Required on 151, recommended on 153.
///   REVIEWER     The wallet or Safe that releases tranches. Defaults to the admin.
///   VERIFIER     Your dApp's verifier contract. Required on 151. On 153 and local chains a
///                ReceptorMock is deployed when unset, so the first deploy works before you
///                have a real verifier; the log says so in capitals.
///   REQUEST_ID   The recipe the escrow gates on. Default 100, the accredited-issuer recipe
///                (recipes/accredited-issuer): a credential from one named issuer, AML/CTF passed.
///
/// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
///   forge script script/DeployGrantEscrow.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
contract DeployGrantEscrow is RedbellyDeployScript {
    function run() external returns (GrantEscrow escrow) {
        Preflight memory p = preflight();

        address verifier = optionalEnvAddress("VERIFIER");
        uint64 requestId = uint64(vm.envOr("REQUEST_ID", uint256(100)));
        address reviewer = optionalEnvAddress("REVIEWER");
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
        GrantEscrow.Roles memory roles = GrantEscrow.Roles({ admin: p.admin, reviewer: reviewer });
        escrow = new GrantEscrow(roles, IRedbellyVerifier(verifier), requestId);
        vm.stopBroadcast();

        console2.log("GrantEscrow:", address(escrow));
        console2.log("verifier:", verifier);
        console2.log("reviewer:", reviewer == address(0) ? p.admin : reviewer);
        recordDeployment(
            "GrantEscrow",
            address(escrow),
            p,
            "constructor((address,address),address,uint64)",
            abi.encode(roles, verifier, requestId),
            verifier,
            requestId
        );
    }
}
