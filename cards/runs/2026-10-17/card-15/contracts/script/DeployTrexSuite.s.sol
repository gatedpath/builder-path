// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { console2 } from "forge-std/Script.sol";
import { RedbellyDeployScript, IBootstrapRegistry } from "./RedbellyDeployScript.sol";
import { Redbelly } from "./Redbelly.sol";
import { TrexSuiteDeployer } from "./TrexSuite.sol";

/// @notice Deploys the whole ERC-3643 suite (card 15) after the scaffold's pre-flight: implementation
/// authority, six implementations, six proxies, the token's ONCHAINID, a claim issuer, the two-layer
/// reader, and a timelock that owns all of it. No factory owned by anyone else is called.
///
/// Environment (public addresses only, never a key):
///   ADMIN_SAFE      The Safe 1.4.1 (threshold >= 2) that proposes and executes on the timelock and
///                   manages the claim issuer. Required on 151. Off mainnet an EOA stand-in is allowed
///                   and the log says so; unset, the deployer stands in.
///   TOKEN_AGENT     The issuer's operations wallet: registers investors, mints, freezes. Default deployer.
///   CLAIM_SIGNER    The address whose key signs claims. Default TOKEN_AGENT.
///   TIMELOCK_DELAY  Seconds. Default 172800 (two days).
///   TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS   Default "Card 15 Note", "C15", 0.
///
/// The token requires claim topics 1 and 2, the two the identity partner's integration guide uses in
/// its examples; it never says what they mean, so this script does not pretend to.
///
///   forge script script/DeployTrexSuite.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
contract DeployTrexSuite is RedbellyDeployScript, TrexSuiteDeployer {
    function run() external returns (Suite memory s) {
        Preflight memory p = preflight();

        Config memory c;
        c.deployer = p.deployer;
        c.admin = p.admin;
        c.timelockDelay = vm.envOr("TIMELOCK_DELAY", uint256(2 days));
        c.agent = optionalEnvAddress("TOKEN_AGENT");
        if (c.agent == address(0)) {
            c.agent = p.deployer;
            console2.log("TOKEN_AGENT not set: the deployer is the operations agent (register, mint, freeze)");
        }
        c.claimSigner = optionalEnvAddress("CLAIM_SIGNER");
        if (c.claimSigner == address(0)) {
            c.claimSigner = c.agent;
            console2.log("CLAIM_SIGNER not set: the agent's key signs claims");
        }
        c.name = vm.envOr("TOKEN_NAME", string("Card 15 Note"));
        c.symbol = vm.envOr("TOKEN_SYMBOL", string("C15"));
        c.decimals = uint8(vm.envOr("TOKEN_DECIMALS", uint256(0)));
        c.claimTopics = new uint256[](2);
        c.claimTopics[0] = 1;
        c.claimTopics[1] = 2;
        c.permission = _permission();

        if (p.chainId == Redbelly.MAINNET_CHAIN_ID) {
            require(p.adminIsSafe, "mainnet admin must be a Safe");
            require(c.agent != p.deployer, "set TOKEN_AGENT: the deployer must not keep the agent role on mainnet");
            require(c.claimSigner != p.deployer, "set CLAIM_SIGNER: the deployer must not sign claims on mainnet");
        }
        if (!p.adminIsSafe) {
            console2.log(
                "ADMIN IS NOT A SAFE: a stand-in proposes and executes on the timelock. Real deploy: a Safe 1.4.1, threshold >= 2."
            );
        }
        console2.log("timelock delay (s):", c.timelockDelay);
        console2.log("agent:", c.agent);
        console2.log("claim signer:", c.claimSigner);
        if (c.permission == address(0)) {
            console2.log("no permission contract on this chain: GateReport will say the network gate is unreadable");
        } else {
            console2.log("permission (network gate):", c.permission);
        }

        vm.startBroadcast();
        s = deploySuite(c);
        vm.stopBroadcast();

        console2.log("timelock:", s.timelock);
        console2.log("implementation authority:", s.implementationAuthority);
        console2.log("token:", s.token);
        console2.log("token ONCHAINID:", s.tokenOnchainId);
        console2.log("identity registry:", s.identityRegistry);
        console2.log("identity registry storage:", s.identityRegistryStorage);
        console2.log("trusted issuers registry:", s.trustedIssuersRegistry);
        console2.log("claim topics registry:", s.claimTopicsRegistry);
        console2.log("compliance:", s.compliance);
        console2.log("claim issuer:", s.claimIssuer);
        console2.log("gate report:", s.gateReport);
        console2.log("the token is born paused (Token.init): the agent calls unpause() when the register opens");
        _record(p, c, s);
    }

    /// @dev The network gate's address from the bootstrap registry, or zero where the registry has no code.
    function _permission() internal view returns (address) {
        address registry = Redbelly.BOOTSTRAP_REGISTRY;
        if (registry.code.length == 0) return address(0);
        return IBootstrapRegistry(registry).getContractAddress("permission");
    }

    function _record(Preflight memory p, Config memory c, Suite memory s) internal {
        string memory j = "suite";
        vm.serializeUint(j, "chainId", p.chainId);
        vm.serializeAddress(j, "deployer", p.deployer);
        vm.serializeAddress(j, "admin", p.admin);
        vm.serializeBool(j, "adminIsSafe", p.adminIsSafe);
        vm.serializeUint(j, "timelockDelay", c.timelockDelay);
        vm.serializeAddress(j, "agent", c.agent);
        vm.serializeAddress(j, "claimSigner", c.claimSigner);
        vm.serializeAddress(j, "permission", c.permission);
        vm.serializeUint(j, "claimTopics", c.claimTopics);
        vm.serializeAddress(j, "timelock", s.timelock);
        vm.serializeAddress(j, "implementationAuthority", s.implementationAuthority);
        vm.serializeAddress(j, "token", s.token);
        vm.serializeAddress(j, "tokenOnchainId", s.tokenOnchainId);
        vm.serializeAddress(j, "identityRegistry", s.identityRegistry);
        vm.serializeAddress(j, "identityRegistryStorage", s.identityRegistryStorage);
        vm.serializeAddress(j, "trustedIssuersRegistry", s.trustedIssuersRegistry);
        vm.serializeAddress(j, "claimTopicsRegistry", s.claimTopicsRegistry);
        vm.serializeAddress(j, "compliance", s.compliance);
        vm.serializeAddress(j, "claimIssuer", s.claimIssuer);
        vm.serializeAddress(j, "gateReport", s.gateReport);
        vm.serializeString(j, "trex", "@tokenysolutions/t-rex 4.1.3");
        string memory out = vm.serializeString(j, "onchainid", "@onchain-id/solidity 2.2.1");
        string memory path = string.concat("deployments/", vm.toString(p.chainId), "-TrexSuite.json");
        try vm.createDir("deployments", true) { } catch { }
        try vm.writeJson(out, path) {
            console2.log("deployment record:", path);
        } catch {
            console2.log("deployment record not written (grant write access to deployments/ in foundry.toml)");
        }
    }
}
