// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { RegisterDistributor } from "../src/RegisterDistributor.sol";

/// @notice Deploys RegisterDistributor after the pre-flight in RedbellyDeployScript. The distributor has no
/// roles and no constructor arguments: whoever opens a distribution pays it from their own wallet, so the
/// contract needs no admin and holds no funds. The pre-flight still runs (chain id, deployer passes
/// permission.isAllowed, ship report on mainnet) because that is the path every deploy here takes.
///
/// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
///   forge script script/DeployDistributor.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
contract DeployDistributor is RedbellyDeployScript {
    function run() external returns (RegisterDistributor distributor) {
        Preflight memory p = preflight();

        vm.startBroadcast();
        distributor = new RegisterDistributor();
        vm.stopBroadcast();

        console2.log("RegisterDistributor:", address(distributor));
        recordDeployment("RegisterDistributor", address(distributor), p);
    }
}
