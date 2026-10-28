// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { RecipientGuard } from "../src/RecipientGuard.sol";

/// @notice Deploys RecipientGuard after the same pre-flight as Deploy.s.sol. The guard has no
/// constructor arguments, no admin and no roles: there is nothing to hand to a Safe, and the
/// deployer holds nothing afterwards.
///
/// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
///   forge script script/DeployGuard.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
contract DeployGuard is RedbellyDeployScript {
    function run() external returns (RecipientGuard guard) {
        Preflight memory p = preflight();

        vm.startBroadcast();
        guard = new RecipientGuard();
        vm.stopBroadcast();

        console2.log("RecipientGuard:", address(guard));
        recordDeployment("RecipientGuard", address(guard), p);
    }
}
