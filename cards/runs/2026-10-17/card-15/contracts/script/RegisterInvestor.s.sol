// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";
import { TrexSuiteDeployer } from "./TrexSuite.sol";
import { IClaimTopicsRegistry, IIdentityRegistry } from "../src/interfaces/ITrex.sol";

/// @notice The issuer's agent registers one investor: deploys an ONCHAINID whose management key is the
/// investor, registers it on the identity registry with a country code, and prints, for each claim topic
/// the token requires, the claim data and the hash the claim signer must sign (`eth_sign` of that hash,
/// which adds the Ethereum signed-message prefix the reference ClaimIssuer expects). Adding the claim is
/// the investor's own transaction afterwards; see scripts/rehearse-trex.sh.
///
/// Environment: IDENTITY_REGISTRY, INVESTOR, COUNTRY (ISO 3166-1 numeric; default 36, Australia).
/// Sender: the agent (`--account <keystore-name>` on a real network).
contract RegisterInvestor is Script, TrexSuiteDeployer {
    function run() external returns (address identity) {
        address registry = vm.envAddress("IDENTITY_REGISTRY");
        address investor = vm.envAddress("INVESTOR");
        uint16 country = uint16(vm.envOr("COUNTRY", uint256(36)));
        uint256[] memory topics = IClaimTopicsRegistry(IIdentityRegistry(registry).topicsRegistry()).getClaimTopics();

        vm.startBroadcast();
        identity = _create("Identity.sol:Identity", abi.encode(investor, false));
        IIdentityRegistry(registry).registerIdentity(investor, identity, country);
        vm.stopBroadcast();

        console2.log("investor:", investor);
        console2.log("identity:", identity);
        console2.log("country:", country);
        string memory j = "investor";
        vm.serializeAddress(j, "investor", investor);
        vm.serializeAddress(j, "identity", identity);
        string memory out = vm.serializeUint(j, "country", country);
        for (uint256 i = 0; i < topics.length; i++) {
            // The claim data is the issuer's choice; the guide calls it a proof reference. Nothing personal.
            bytes memory data =
                abi.encode(keccak256(abi.encodePacked("card-15 verification reference, topic ", topics[i])));
            bytes32 hash = keccak256(abi.encode(identity, topics[i], data));
            console2.log("topic:", topics[i]);
            console2.log("  data:", vm.toString(data));
            console2.log("  hash to sign:", vm.toString(hash));
            string memory t = string.concat("topic", vm.toString(topics[i]));
            string memory tj = string.concat("t", vm.toString(topics[i]));
            vm.serializeUint(tj, "topic", topics[i]);
            vm.serializeBytes(tj, "data", data);
            string memory tout = vm.serializeBytes32(tj, "hash", hash);
            out = vm.serializeString(j, t, tout);
        }
        string memory path = string.concat("deployments/", vm.toString(block.chainid), "-investor.json");
        try vm.writeJson(out, path) {
            console2.log("record:", path);
        } catch {
            console2.log("record not written");
        }
    }
}
