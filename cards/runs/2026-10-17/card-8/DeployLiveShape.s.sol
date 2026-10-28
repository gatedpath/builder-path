// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { RedbellyDeployScript } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { InvoiceFinancing } from "../src/InvoiceFinancing.sol";
import { MockBusinessIdentifier } from "../src/mocks/MockBusinessIdentifier.sol";
import { MockZKPVerifierV2 } from "../src/mocks/MockZKPVerifierV2.sol";
import { BusinessDelegateAdapter } from "../src/adapters/BusinessDelegateAdapter.sol";
import { Iden3VerifierAdapter } from "@gatedpath/receptor-mock/adapters/Iden3VerifierAdapter.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";

/// @notice Card 8, route B of 25 October 2026: put the two live verifier shapes on testnet behind the
/// InvoiceFinancing that is already deployed there, and repoint its gates at them in the same broadcast.
/// The identifier and the ZKP verifier are mocks (no business of ours is verified through Averer and no
/// ZKP request is issued); the two adapters and the repointing are the live path. Testnet only: the
/// mocks refuse chain 151 in their constructors, and the owner of the live contract signs.
///
/// Environment (public addresses only, never a key):
///   FINANCING   The InvoiceFinancing to repoint. Default: the one deployed on 153 on 25 October 2026.
///
///   forge script script/DeployLiveShape.s.sol --rpc-url redbelly_testnet --account <keystore-name> --sender <your-address> --broadcast
contract DeployLiveShape is RedbellyDeployScript {
    address constant FINANCING_153 = 0xcd7F22Ddc8d22224A98f1c98c601F890cb3F3d90;
    uint64 constant INVESTOR_REQUEST = 708;

    function run() external {
        Preflight memory p = preflight();
        if (p.chainId == Redbelly.MAINNET_CHAIN_ID) revert("the live-shape mocks never go to mainnet");
        address financingAddr = optionalEnvAddress("FINANCING");
        if (financingAddr == address(0)) financingAddr = FINANCING_153;
        InvoiceFinancing financing = InvoiceFinancing(financingAddr);
        require(financing.owner() == p.deployer, "the sender is not the financing contract's owner");

        vm.startBroadcast();
        // The sender is the issuer and the first representative: on 153 only this wallet can transact.
        MockBusinessIdentifier identifier = new MockBusinessIdentifier(
            p.deployer, p.deployer, "Card 8 test business (mock)", "mock", "none", "none: a test contract on testnet"
        );
        BusinessDelegateAdapter businessAdapter = new BusinessDelegateAdapter(address(identifier));
        MockZKPVerifierV2 zkp = new MockZKPVerifierV2();
        zkp.setZKPRequest(INVESTOR_REQUEST);
        Iden3VerifierAdapter investorAdapter =
            new Iden3VerifierAdapter(address(zkp), Iden3VerifierAdapter.Surface.ZKPVerifierV2);
        financing.setBusinessVerifier(IRedbellyVerifier(address(businessAdapter)), 0);
        financing.setVerifier(IRedbellyVerifier(address(investorAdapter)));
        vm.stopBroadcast();

        console2.log("MockBusinessIdentifier:", address(identifier));
        console2.log("BusinessDelegateAdapter:", address(businessAdapter));
        console2.log("MockZKPVerifierV2:", address(zkp));
        console2.log("Iden3VerifierAdapter:", address(investorAdapter));
        console2.log("financing lister gate ->", address(financing.businessVerifier()), financing.listerRequestId());
        console2.log("financing investor gate ->", address(financing.verifier()), financing.requestId());

        recordDeployment(
            "MockBusinessIdentifier",
            address(identifier),
            p,
            "constructor(address,address,string,string,string,string)",
            abi.encode(
                p.deployer,
                p.deployer,
                "Card 8 test business (mock)",
                "mock",
                "none",
                "none: a test contract on testnet"
            ),
            address(0),
            0
        );
        recordDeployment(
            "BusinessDelegateAdapter",
            address(businessAdapter),
            p,
            "constructor(address)",
            abi.encode(address(identifier)),
            address(0),
            0
        );
        recordDeployment("MockZKPVerifierV2", address(zkp), p, "", "", address(0), 0);
        recordDeployment(
            "Iden3VerifierAdapter",
            address(investorAdapter),
            p,
            "constructor(address,uint8)",
            abi.encode(address(zkp), uint8(Iden3VerifierAdapter.Surface.ZKPVerifierV2)),
            address(0),
            0
        );
    }
}
