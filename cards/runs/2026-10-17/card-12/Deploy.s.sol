// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { CapTable } from "../src/CapTable.sol";
import { VestingVault } from "../src/VestingVault.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";

/// @notice Deploys the cap table after the pre-flight in RedbellyDeployScript: the register, the
/// vesting vault appointed as its nominee, and two classes, each bound to its own recipe. Replaces
/// the template's script so `npm run dev` deploys the register (the loop reads the first `Name: 0x`
/// line and the contract's `requestId()`, which answers for class 1, so it seeds the Ordinary gate).
///
/// Environment (public addresses and numbers only, never a key):
///   ADMIN_SAFE            Safe 1.4.1 behind a timelock that receives the admin role. Required on 151.
///   BOARD                 The directors' Safe: issues shares, approves transfers. Defaults to the admin.
///   VERIFIER              The company's verifier. Required on 151. Off mainnet a ReceptorMock is
///                         deployed when unset, and the log says so in capitals.
///   REQUEST_ID            Class 1, Ordinary. Default 18, recipes/over-18.
///   INVESTOR_REQUEST_ID   Class 2, Series A Preference. Default 708, recipes/au-wholesale-investor.
///
/// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
///   forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
contract Deploy is RedbellyDeployScript {
    uint256 internal constant ORDINARY_AUTHORISED = 10_000_000;
    uint256 internal constant SERIES_A_AUTHORISED = 2_000_000;

    function run() external returns (CapTable register, VestingVault vault) {
        Preflight memory p = preflight();

        address verifier = optionalEnvAddress("VERIFIER");
        address board = optionalEnvAddress("BOARD");
        if (board == address(0)) board = p.admin;
        uint64 ordinaryId = uint64(vm.envOr("REQUEST_ID", uint256(18)));
        uint64 investorId = uint64(vm.envOr("INVESTOR_REQUEST_ID", uint256(708)));
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
        // The deployer holds the admin role for the setup transactions and hands it to the admin at
        // the end, so the classes and the nominee are in place before a timelock owns the register.
        CapTable.Roles memory roles = CapTable.Roles({ admin: p.deployer, board: board });
        register = new CapTable(roles, IRedbellyVerifier(verifier));
        vault = new VestingVault(register);
        register.createClass("Ordinary", ordinaryId, ORDINARY_AUTHORISED);
        register.createClass("Series A Preference", investorId, SERIES_A_AUTHORISED);
        register.grantRole(register.NOMINEE_ROLE(), address(vault));
        if (p.admin != p.deployer) {
            register.grantRole(register.DEFAULT_ADMIN_ROLE(), p.admin);
            register.renounceRole(register.DEFAULT_ADMIN_ROLE(), p.deployer);
        }
        vm.stopBroadcast();

        console2.log("CapTable:", address(register));
        console2.log("vesting vault:", address(vault));
        console2.log("verifier:", verifier);
        console2.log("board:", board);
        console2.log("class 1 Ordinary, request id", ordinaryId);
        console2.log("class 2 Series A Preference, request id", investorId);
        recordDeployment(
            "CapTable",
            address(register),
            p,
            "constructor((address,address),address)",
            abi.encode(roles, verifier),
            verifier,
            ordinaryId
        );
        recordDeployment(
            "VestingVault", address(vault), p, "constructor(address)", abi.encode(address(register)), verifier, 0
        );
    }
}
