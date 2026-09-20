// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";
import { GatedERC20 } from "../src/GatedERC20.sol";

interface ISafe {
    function VERSION() external view returns (string memory);
    function getThreshold() external view returns (uint256);
    function getOwners() external view returns (address[] memory);
}

/// @notice Deploys the Safe plus timelock admin pattern from docs/admin-pattern.md: a
/// TimelockController whose only proposer and executor is the Safe, and a GatedERC20 whose
/// admin is the timelock and whose operational roles are Safes.
///
/// Environment (public addresses and numbers only, never a key):
///   ADMIN_SAFE          The Safe that proposes to the timelock. Required. On 151 it, and the three
///                       role holders below, must each be a real Safe 1.4.1 proxy with a threshold
///                       of two or more (checked by code hash, not by asking the contract).
///   PAUSER              PAUSER_ROLE holder (default ADMIN_SAFE). The emergency path.
///   COMPLIANCE          COMPLIANCE_ROLE holder (default ADMIN_SAFE).
///   ISSUER_ADMIN        ISSUER_ADMIN_ROLE holder (default ADMIN_SAFE).
///   VERIFIER            Your dApp's verifier behind IRedbellyVerifier. Required on 151. On other
///                       chains a ReceptorMock is deployed when unset; the log says so in capitals.
///   REQUEST_ID          The eligibility request id (default 1).
///   TIMELOCK_DELAY      Seconds (default 172800, two days, on 151; 300 elsewhere; never below 86400 on 151).
///   TOKEN_NAME, TOKEN_SYMBOL, SUBSCRIPTION_AMOUNT   Defaults "Gated Token", "GTOK", 100e18.
///   RECORD_DEPLOYMENT   "false" to skip writing deployments/<chainId>-GatedERC20.json.
///
/// Sign with a keystore or hardware wallet; the key never touches this file or the shell:
///   forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account <keystore-name> --broadcast
/// This script checks the chain id against the RPC's own, and on 151 that every role holder is a
/// real Safe 1.4.1. It does NOT check `permission.isAllowed` on the deployer or ask for a ship
/// report; a scaffolded project's deploy script does those, and does not set up this timelock. Until
/// one script does both, run `redbelly-preflight` and `redbelly ship` yourself before a mainnet
/// broadcast of this one.
contract Deploy is Script {
    uint256 internal constant MAINNET = 151;
    /// @dev The runtime code of a SafeProxy created by the canonical SafeProxyFactory 1.4.1: 171 bytes,
    /// the same on every chain. Derived on 2026-09-19 by creating a proxy from the factory code read
    /// from both Redbelly networks (the scaffolder's test fixtures). Kept as the code, and hashed
    /// where it is used, so a reader can check it and no bare hash sits in the file.
    bytes internal constant SAFE_PROXY_141_RUNTIME =
        hex"608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033";
    address internal constant SAFE_SINGLETON = 0x41675C099F32341bf84BFc5382aF534df5C7461a;
    address internal constant SAFE_L2_SINGLETON = 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
    uint256 internal constant MIN_MAINNET_DELAY = 1 days;

    struct Config {
        address safe;
        address pauser;
        address compliance;
        address issuerAdmin;
        address verifier;
        uint64 requestId;
        uint256 delay;
        string name;
        string symbol;
        uint256 subscriptionAmount;
    }

    function run() external returns (TimelockController timelock, GatedERC20 token) {
        Config memory c = _read();
        _check(c);

        address[] memory proposers = new address[](1);
        proposers[0] = c.safe;
        address[] memory executors = new address[](1);
        executors[0] = c.safe;

        vm.startBroadcast();
        if (c.verifier == address(0)) c.verifier = address(new ReceptorMock());
        // admin = address(0): the timelock administers itself; nothing changes its roles or delay
        // except an operation that went through it.
        timelock = new TimelockController(c.delay, proposers, executors, address(0));
        token = new GatedERC20(
            c.name,
            c.symbol,
            GatedERC20.Roles({
                admin: address(timelock), pauser: c.pauser, compliance: c.compliance, issuerAdmin: c.issuerAdmin
            }),
            IRedbellyVerifier(c.verifier),
            c.requestId,
            c.subscriptionAmount
        );
        vm.stopBroadcast();

        console2.log("TimelockController:", address(timelock));
        console2.log("GatedERC20:", address(token));
        console2.log("verifier:", c.verifier);
        console2.log("admin (timelock) delay seconds:", c.delay);
        _record(timelock, token, c);
    }

    function _read() internal view returns (Config memory c) {
        c.safe = _env("ADMIN_SAFE");
        c.pauser = _envOr("PAUSER", c.safe);
        c.compliance = _envOr("COMPLIANCE", c.safe);
        c.issuerAdmin = _envOr("ISSUER_ADMIN", c.safe);
        c.verifier = _envOr("VERIFIER", address(0));
        c.requestId = uint64(vm.envOr("REQUEST_ID", uint256(1)));
        c.delay = vm.envOr("TIMELOCK_DELAY", block.chainid == MAINNET ? uint256(2 days) : uint256(300));
        c.name = vm.envOr("TOKEN_NAME", string("Gated Token"));
        c.symbol = vm.envOr("TOKEN_SYMBOL", string("GTOK"));
        c.subscriptionAmount = vm.envOr("SUBSCRIPTION_AMOUNT", uint256(100e18));
    }

    /// @dev `--chain`, or `chain_id` in a profile, changes `block.chainid` in the simulation only; the
    /// broadcast still goes to the RPC's network. Every check below keys on the chain id, so it must
    /// be the network's own (audit of 2026-09-19). Zero means no RPC is attached: nothing can broadcast.
    function _requireChainIdIsTheNetworks() internal {
        try vm.activeFork() returns (uint256) { }
        catch {
            console2.log("no RPC attached to this run: nothing can be broadcast from it");
            return;
        }
        bytes memory raw = vm.rpc("eth_chainId", "[]");
        uint256 real;
        for (uint256 i = 0; i < raw.length; i++) {
            real = (real << 8) | uint8(raw[i]);
        }
        if (real != block.chainid) {
            console2.log("the RPC says chain id", real);
            console2.log("this run is simulating chain id", block.chainid);
            revert("chain id mismatch: the simulation and the RPC disagree");
        }
    }

    /// @dev The holder's own code and storage, not its answers: a SafeProxy 1.4.1 whose slot 0 is a
    /// canonical singleton, answering 1.4.1, with a threshold of two or more that its owners can meet.
    function _requireSafe141(address holder, string memory role) internal view {
        if (holder.codehash != keccak256(SAFE_PROXY_141_RUNTIME)) {
            revert(
                string.concat(role, " is not a Safe 1.4.1 proxy (an EOA or another contract cannot hold it on mainnet)")
            );
        }
        address singleton = address(uint160(uint256(vm.load(holder, bytes32(0)))));
        if ((singleton != SAFE_SINGLETON && singleton != SAFE_L2_SINGLETON) || singleton.code.length == 0) {
            revert(string.concat(role, " does not point at a canonical Safe 1.4.1 singleton"));
        }
        if (keccak256(bytes(ISafe(holder).VERSION())) != keccak256("1.4.1")) {
            revert(string.concat(role, " does not answer VERSION() 1.4.1"));
        }
        uint256 threshold = ISafe(holder).getThreshold();
        if (threshold < 2) revert(string.concat(role, " threshold must be at least 2"));
        if (ISafe(holder).getOwners().length < threshold) {
            revert(string.concat(role, " has fewer owners than its threshold"));
        }
    }

    function _check(Config memory c) internal {
        _requireChainIdIsTheNetworks();
        console2.log("chain id:", block.chainid);
        console2.log("deployer:", msg.sender);
        if (c.safe == address(0)) revert("ADMIN_SAFE is not set");
        if (block.chainid == MAINNET) {
            // All four, not only the admin: the compliance role can move any holder's balance and
            // the pauser can stop the token, so an EOA or a mistyped address there is as bad.
            _requireSafe141(c.safe, "ADMIN_SAFE");
            _requireSafe141(c.pauser, "PAUSER");
            _requireSafe141(c.compliance, "COMPLIANCE");
            _requireSafe141(c.issuerAdmin, "ISSUER_ADMIN");
            if (c.verifier == address(0)) revert("VERIFIER is not set; mainnet never deploys a mock verifier");
            if (c.delay < MIN_MAINNET_DELAY) revert("TIMELOCK_DELAY below one day is refused on mainnet");
            console2.log("all four role holders are Safe 1.4.1 proxies; admin threshold", ISafe(c.safe).getThreshold());
        } else {
            if (c.safe.code.length == 0) console2.log("ADMIN_SAFE is not a contract; fine here, refused on 151");
            if (c.verifier == address(0)) {
                console2.log(
                    "VERIFIER not set: DEPLOYING RECEPTOR MOCK. Every wallet starts ineligible; setStatus() decides. Not for mainnet."
                );
            }
        }
        if (c.verifier != address(0)) require(c.verifier.code.length > 0, "VERIFIER is not a contract");
    }

    function _record(TimelockController timelock, GatedERC20 token, Config memory c) internal {
        if (!vm.envOr("RECORD_DEPLOYMENT", true)) return;
        string memory json = "deployment";
        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "token", address(token));
        vm.serializeAddress(json, "timelock", address(timelock));
        vm.serializeAddress(json, "safe", c.safe);
        vm.serializeAddress(json, "pauser", c.pauser);
        vm.serializeAddress(json, "compliance", c.compliance);
        vm.serializeAddress(json, "issuerAdmin", c.issuerAdmin);
        vm.serializeAddress(json, "verifier", c.verifier);
        vm.serializeUint(json, "requestId", c.requestId);
        vm.serializeUint(json, "timelockDelay", c.delay);
        vm.serializeString(json, "solc", "0.8.30");
        string memory out = vm.serializeString(json, "evm", "prague");
        string memory path = string.concat("deployments/", vm.toString(block.chainid), "-GatedERC20.json");
        vm.createDir("deployments", true);
        vm.writeJson(out, path);
        console2.log("wrote", path);
    }

    function _env(string memory name) internal view returns (address a) {
        a = _envOr(name, address(0));
    }

    function _envOr(string memory name, address fallbackTo) internal view returns (address) {
        string memory raw = vm.envOr(name, string(""));
        if (bytes(raw).length == 0) return fallbackTo;
        return vm.parseAddress(raw);
    }
}
