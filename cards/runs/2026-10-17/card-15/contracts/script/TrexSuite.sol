// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { CommonBase } from "forge-std/Base.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import {
    IClaimTopicsRegistry,
    IIdentityRegistry,
    IIdentityRegistryStorage,
    IModularCompliance,
    IOnchainId,
    ITrexImplementationAuthority,
    ITrexToken,
    ITrustedIssuersRegistry
} from "../src/interfaces/ITrex.sol";
import { GateReport } from "../src/GateReport.sol";

/// @notice Deploys the whole ERC-3643 suite from the reference artifacts with no factory in the way: the
/// deployer creates every contract itself, wires them, and hands every owner role to a timelock whose
/// proposer and executor is the admin (a Safe 1.4.1 on the real network). Shared by the deploy script and
/// the tests so both stand up the same suite. The vendored contracts are created from their compiled
/// bytecode (`vm.getCode`) because their sources pin solc 0.8.17 and this file is 0.8.30.
abstract contract TrexSuiteDeployer is CommonBase {
    uint256 internal constant KEY_MANAGEMENT = 1;
    uint256 internal constant KEY_CLAIM = 3;
    uint256 internal constant KEY_TYPE_ECDSA = 1;

    struct Config {
        address deployer; // holds every role while wiring, then none
        address admin; // the Safe (or its stand-in off mainnet): timelock proposer and executor, claim issuer manager
        uint256 timelockDelay;
        address agent; // the issuer's operations wallet: registers investors, mints, freezes
        address claimSigner; // the key that signs claims; a public address here
        address permission; // the network gate, or zero when the chain has none
        string name;
        string symbol;
        uint8 decimals;
        uint256[] claimTopics;
    }

    struct Suite {
        address timelock;
        address implementationAuthority;
        address token;
        address tokenOnchainId;
        address identityRegistry;
        address identityRegistryStorage;
        address trustedIssuersRegistry;
        address claimTopicsRegistry;
        address compliance;
        address claimIssuer;
        address gateReport;
    }

    function deploySuite(Config memory c) internal returns (Suite memory s) {
        require(c.admin != address(0), "admin is zero");
        require(c.agent != address(0), "agent is zero");
        require(c.claimSigner != address(0), "claim signer is zero");
        require(c.claimTopics.length > 0, "no claim topics: the register would admit any registered wallet");

        // 1. The timelock every owner role goes to. The admin proposes and executes; nobody else.
        address[] memory proposers = new address[](1);
        proposers[0] = c.admin;
        s.timelock = address(new TimelockController(c.timelockDelay, proposers, proposers, address(0)));

        // 2. Our own implementation authority (reference, no factory) and the six implementations.
        s.implementationAuthority = _create(
            "TREXImplementationAuthority.sol:TREXImplementationAuthority", abi.encode(true, address(0), address(0))
        );
        ITrexImplementationAuthority.TREXContracts memory impls = ITrexImplementationAuthority.TREXContracts({
            tokenImplementation: _create("Token.sol:Token", ""),
            ctrImplementation: _create("ClaimTopicsRegistry.sol:ClaimTopicsRegistry", ""),
            irImplementation: _create("IdentityRegistry.sol:IdentityRegistry", ""),
            irsImplementation: _create("IdentityRegistryStorage.sol:IdentityRegistryStorage", ""),
            tirImplementation: _create("TrustedIssuersRegistry.sol:TrustedIssuersRegistry", ""),
            mcImplementation: _create("ModularCompliance.sol:ModularCompliance", "")
        });
        ITrexImplementationAuthority.Version memory v = ITrexImplementationAuthority.Version(4, 1, 3);
        ITrexImplementationAuthority(s.implementationAuthority).addTREXVersion(v, impls);
        ITrexImplementationAuthority(s.implementationAuthority).useTREXVersion(v);

        // 3. The proxies, each initialised by its constructor through the authority.
        address ia = s.implementationAuthority;
        s.trustedIssuersRegistry =
            _create("TrustedIssuersRegistryProxy.sol:TrustedIssuersRegistryProxy", abi.encode(ia));
        s.claimTopicsRegistry = _create("ClaimTopicsRegistryProxy.sol:ClaimTopicsRegistryProxy", abi.encode(ia));
        s.identityRegistryStorage =
            _create("IdentityRegistryStorageProxy.sol:IdentityRegistryStorageProxy", abi.encode(ia));
        s.identityRegistry = _create(
            "IdentityRegistryProxy.sol:IdentityRegistryProxy",
            abi.encode(ia, s.trustedIssuersRegistry, s.claimTopicsRegistry, s.identityRegistryStorage)
        );
        s.compliance = _create("ModularComplianceProxy.sol:ModularComplianceProxy", abi.encode(ia));
        s.tokenOnchainId = _create("Identity.sol:Identity", abi.encode(c.deployer, false));
        s.token = _create(
            "TokenProxy.sol:TokenProxy",
            abi.encode(ia, s.identityRegistry, s.compliance, c.name, c.symbol, c.decimals, s.tokenOnchainId)
        );

        // 4. Wiring, while the deployer still owns everything.
        IIdentityRegistryStorage(s.identityRegistryStorage).bindIdentityRegistry(s.identityRegistry);
        IModularCompliance(s.compliance).bindToken(s.token);
        for (uint256 i = 0; i < c.claimTopics.length; i++) {
            IClaimTopicsRegistry(s.claimTopicsRegistry).addClaimTopic(c.claimTopics[i]);
        }

        // 5. The claim issuer: the reference ClaimIssuer with the signer as a claim key (purpose 3) and the
        // admin as its management key. Not the timelock: ONCHAINID's management key both adds signers and
        // revokes claims, and a revocation must not wait out a delay.
        s.claimIssuer = _create("ClaimIssuer.sol:ClaimIssuer", abi.encode(c.deployer));
        IOnchainId(s.claimIssuer).addKey(_key(c.claimSigner), KEY_CLAIM, KEY_TYPE_ECDSA);
        _handManagementTo(s.claimIssuer, c.deployer, c.admin);
        ITrustedIssuersRegistry(s.trustedIssuersRegistry).addTrustedIssuer(s.claimIssuer, c.claimTopics);

        // 6. Agents: the token on its registry (recovery needs it) and the operations wallet on both.
        IIdentityRegistry(s.identityRegistry).addAgent(s.token);
        IIdentityRegistry(s.identityRegistry).addAgent(c.agent);
        ITrexToken(s.token).addAgent(c.agent);

        // 7. The two-layer reader.
        s.gateReport = address(new GateReport(c.permission, s.identityRegistry));

        // 8. Every owner role to the timelock; the token's own ONCHAINID to the admin.
        ITrexImplementationAuthority(s.implementationAuthority).transferOwnership(s.timelock);
        ITrexToken(s.token).transferOwnership(s.timelock);
        IIdentityRegistry(s.identityRegistry).transferOwnership(s.timelock);
        IIdentityRegistryStorage(s.identityRegistryStorage).transferOwnership(s.timelock);
        ITrustedIssuersRegistry(s.trustedIssuersRegistry).transferOwnership(s.timelock);
        IClaimTopicsRegistry(s.claimTopicsRegistry).transferOwnership(s.timelock);
        IModularCompliance(s.compliance).transferOwnership(s.timelock);
        _handManagementTo(s.tokenOnchainId, c.deployer, c.admin);
    }

    /// @dev Creates a vendored contract from its artifact with ABI-encoded constructor arguments.
    function _create(string memory artifact, bytes memory args) internal returns (address deployed) {
        bytes memory code = abi.encodePacked(vm.getCode(artifact), args);
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            deployed := create(0, add(code, 0x20), mload(code))
        }
        require(deployed != address(0), string.concat("create failed: ", artifact));
    }

    /// @dev Adds `to` as a management key of an ONCHAINID and removes `from`, unless they are the same.
    function _handManagementTo(address identity, address from, address to) internal {
        if (from == to) return;
        IOnchainId(identity).addKey(_key(to), KEY_MANAGEMENT, KEY_TYPE_ECDSA);
        IOnchainId(identity).removeKey(_key(from), KEY_MANAGEMENT);
    }

    function _key(address wallet) internal pure returns (bytes32) {
        return keccak256(abi.encode(wallet));
    }
}
