// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { RedbellyDeployScript, IBootstrapRegistry } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { GatedPairFactory } from "../src/pool/GatedPairFactory.sol";
import { IPermission } from "../src/pool/IPermission.sol";
import { MockERC20 } from "../src/mocks/MockERC20.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";

/// @notice Deploys the gated pool factory after the pre-flight in RedbellyDeployScript, and off mainnet
/// two mock pool tokens and their pair so the local loop has a pool to rehearse on.
///
/// Environment (public addresses only, never a key):
///   ADMIN_SAFE   Safe 1.4.1 that owns the factory. Required on 151, recommended on 153.
///   VERIFIER     Your dApp's verifier contract. Required on 151. On 153 and local chains a
///                ReceptorMock is deployed when unset, so the first deploy works before you
///                have a real verifier; the log says so in capitals.
///   REQUEST_ID   The eligibility request id liquidity providers must hold a proof for. Default 708,
///                the AU wholesale investor recipe (recipes/au-wholesale-investor).
///   PERMISSION   The network's permission contract. Unset, it is read from the bootstrap registry,
///                which exists on 151, 153 and any fork of them.
///   TOKEN_A, TOKEN_B   The first pair's tokens. Required on 151. Off mainnet, when unset, two
///                MockERC20 tokens are deployed and the log says so in capitals.
///
/// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
///   forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
///   forge script script/Deploy.s.sol --rpc-url redbelly_mainnet --ledger --broadcast
contract Deploy is RedbellyDeployScript {
    function run() external returns (GatedPairFactory factory) {
        Preflight memory p = preflight();
        bool mainnet = p.chainId == Redbelly.MAINNET_CHAIN_ID;

        address verifier = optionalEnvAddress("VERIFIER");
        uint64 requestId = uint64(vm.envOr("REQUEST_ID", uint256(708)));
        if (verifier == address(0)) {
            if (mainnet) revert("VERIFIER is not set; mainnet never deploys a mock verifier");
            console2.log(
                "VERIFIER not set: DEPLOYING RECEPTOR MOCK. Every wallet starts ineligible; setStatus() decides. Not for mainnet."
            );
        } else {
            require(verifier.code.length > 0, "VERIFIER is not a contract");
        }

        address permission = optionalEnvAddress("PERMISSION");
        if (permission == address(0)) {
            require(Redbelly.BOOTSTRAP_REGISTRY.code.length > 0, "PERMISSION is not set and no bootstrap registry here");
            permission = IBootstrapRegistry(Redbelly.BOOTSTRAP_REGISTRY).getContractAddress("permission");
        }
        require(permission.code.length > 0, "the permission contract has no code");

        address tokenA = optionalEnvAddress("TOKEN_A");
        address tokenB = optionalEnvAddress("TOKEN_B");
        bool mockTokens = tokenA == address(0) || tokenB == address(0);
        if (mockTokens) {
            if (mainnet) revert("TOKEN_A and TOKEN_B are not set; mainnet never deploys mock tokens");
            console2.log("TOKEN_A or TOKEN_B not set: DEPLOYING TWO MOCK TOKENS anyone may mint. Not for mainnet.");
        }

        vm.startBroadcast();
        if (verifier == address(0)) verifier = address(new ReceptorMock());
        factory = new GatedPairFactory(p.admin, IRedbellyVerifier(verifier), requestId, IPermission(permission));
        if (mockTokens) {
            tokenA = address(new MockERC20("Pool Token A", "PTA"));
            tokenB = address(new MockERC20("Pool Token B", "PTB"));
        }
        address pair = factory.createPair(tokenA, tokenB);
        vm.stopBroadcast();

        // The first "Name: 0x..." line is the contract the local loop reads requestId() from; the other
        // labels carry a space so the loop does not mistake them for it.
        console2.log("GatedPairFactory:", address(factory));
        console2.log("verifier:", verifier);
        console2.log("permission contract:", permission);
        console2.log("token A:", tokenA);
        console2.log("token B:", tokenB);
        console2.log("pair A/B:", pair);
        recordDeployment(
            "GatedPairFactory",
            address(factory),
            p,
            "constructor(address,address,uint64,address)",
            abi.encode(p.admin, verifier, requestId, permission),
            verifier,
            requestId
        );
    }
}
