// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Script, console2 } from "forge-std/Script.sol";
import { VmSafe } from "forge-std/Vm.sol";
import { Redbelly } from "./Redbelly.sol";

interface IBootstrapRegistry {
    function getContractAddress(string calldata name) external view returns (address);
}

interface IPermission {
    function isAllowed(address wallet) external view returns (bool);
}

interface ISafe {
    function VERSION() external view returns (string memory);
    function getThreshold() external view returns (uint256);
    function getOwners() external view returns (address[] memory);
}

/// @notice Base for every deploy script in this project. `preflight()` checks the simulated chain
/// id against the RPC's own and refuses to continue when the deployer or the admin is wrong for it. It reads
/// two environment variables, both public addresses: ADMIN_SAFE and (per template) VERIFIER.
/// It never reads a key; sign with `--account <keystore-name>`, `--ledger` or `--trezor`.
abstract contract RedbellyDeployScript is Script {
    string internal constant SAFE_VERSION = "1.4.1";
    /// @dev The runtime code of a SafeProxy created by the canonical SafeProxyFactory 1.4.1: 171 bytes,
    /// the same on every chain. Derived on 2026-09-19 by creating a proxy from the factory code read
    /// from both Redbelly networks (the scaffolder's test fixtures). Kept as the code, and hashed
    /// where it is used, so a reader can check it and no bare hash sits in the file.
    bytes internal constant SAFE_PROXY_141_RUNTIME =
        hex"608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033";

    struct Preflight {
        uint256 chainId;
        address deployer;
        address admin;
        bool adminIsSafe;
        bool identityChecked;
    }

    /// @dev Runs the checks and returns the admin to hand every privileged role to.
    function preflight() internal returns (Preflight memory p) {
        p.chainId = block.chainid;
        p.deployer = msg.sender;
        _requireChainIdIsTheNetworks(p.chainId);
        console2.log("chain id:", p.chainId);
        console2.log("deployer:", p.deployer);

        if (Redbelly.isRedbelly(p.chainId)) {
            p.identityChecked = true;
            _requireDeployerAllowed(p.deployer);
        } else {
            console2.log("chain is not 151 or 153: identity check skipped (local anvil without the registry?)");
        }

        if (p.chainId == Redbelly.MAINNET_CHAIN_ID) {
            p.admin = adminSafeFromEnv();
            if (p.admin == address(0)) {
                console2.log("mainnet needs ADMIN_SAFE, the address of a Safe 1.4.1 with threshold >= 2");
                revert("ADMIN_SAFE is not set");
            }
            _requireSafe(p.admin, true);
            p.adminIsSafe = true;
        } else {
            p.admin = adminSafeFromEnv();
            if (p.admin == address(0)) {
                p.admin = p.deployer;
                console2.log(
                    "ADMIN_SAFE not set: the deployer holds the admin roles. Fine on testnet, refused on mainnet."
                );
            } else {
                p.adminIsSafe = _requireSafe(p.admin, false);
            }
        }
        console2.log("admin:", p.admin);
        _requireShipReport(p.chainId);
    }

    /// @dev `--chain <id>`, or `chain_id` in a foundry.toml profile, changes `block.chainid` inside the
    /// simulation and nothing else: the broadcast still goes to whatever network the RPC is. Every
    /// guard in this file keys on the chain id, so before any of them runs, the simulated id must be
    /// the one the RPC itself reports. Without this, one flag turned a mainnet deploy into an
    /// unguarded one (audit of 2026-09-19).
    function _requireChainIdIsTheNetworks(uint256 simulated) internal {
        uint256 real = rpcChainId();
        if (real == 0) {
            console2.log("no RPC attached to this run: nothing can be broadcast from it");
            return;
        }
        if (real != simulated) {
            console2.log("the RPC says chain id", real);
            console2.log("this run is simulating chain id", simulated);
            console2.log("remove --chain (and any chain_id in foundry.toml): the network decides, not a flag");
            revert("chain id mismatch: the simulation and the RPC disagree");
        }
    }

    /// @dev The chain id the attached RPC reports, or zero when no RPC is attached (a plain
    /// `forge test`). Virtual so the unit tests, which have no RPC, can stand in for one.
    function rpcChainId() internal virtual returns (uint256 id) {
        try vm.activeFork() returns (uint256) { }
        catch {
            return 0;
        }
        bytes memory raw = vm.rpc("eth_chainId", "[]");
        for (uint256 i = 0; i < raw.length; i++) {
            id = (id << 8) | uint8(raw[i]);
        }
    }

    /// @dev The mainnet gate that produces the document you wanted anyway (PLAN.md 18.3). On 151 a
    /// broadcast needs `deployments/ship-151-<today>.md`, which `redbelly ship` writes only when every
    /// check passed; a dry run without it says so and continues. 153 warns. Other chains are silent.
    function _requireShipReport(uint256 chainId) internal view {
        if (chainId != Redbelly.MAINNET_CHAIN_ID && chainId != Redbelly.TESTNET_CHAIN_ID) return;
        string memory path = shipReportPath(chainId);
        if (vm.exists(path)) {
            // The file's first line is `<!-- redbelly-ship chain=<id> date=<YYYY-MM-DD> ok=<bool> ... -->`.
            // A file that merely exists proves nothing: an empty one, a testnet report renamed, or a
            // report whose checks failed all used to pass here (audit of 2026-09-19).
            string memory header = vm.readLine(path);
            bool good = vm.contains(header, "<!-- redbelly-ship ")
                && vm.contains(header, string.concat(" chain=", vm.toString(chainId), " "))
                && vm.contains(header, string.concat(" date=", todayUtc(), " ")) && vm.contains(header, " ok=true ");
            if (good) {
                console2.log("ship report:", path);
                return;
            }
            console2.log("the ship report at this path is not a passing report for this chain dated today:", path);
            console2.log("its first line reads:", header);
            if (chainId == Redbelly.MAINNET_CHAIN_ID && !vm.isContext(VmSafe.ForgeContext.ScriptDryRun)) {
                revert("the ship report for chain 151 does not say chain=151, today's date and ok=true");
            }
            return;
        }
        if (chainId == Redbelly.MAINNET_CHAIN_ID) {
            if (vm.isContext(VmSafe.ForgeContext.ScriptDryRun)) {
                console2.log("no ship report dated today for chain 151 at", path);
                console2.log(
                    "--broadcast would refuse. Run: redbelly ship --chain 151 --account <keystore-name> --admin <safe>"
                );
                return;
            }
            revert("no ship report dated today for chain 151: run redbelly ship first");
        }
        console2.log("no ship report dated today for chain 153 at", path);
        console2.log(
            "fine on testnet; mainnet refuses without one. redbelly ship --chain 153 --account <keystore-name> writes it."
        );
    }

    /// @dev Where today's report lives. Virtual so tests can point each case at its own file.
    function shipReportPath(uint256 chainId) internal view virtual returns (string memory) {
        return string.concat("deployments/ship-", vm.toString(chainId), "-", todayUtc(), ".md");
    }

    /// @dev Today as a UTC calendar date, YYYY-MM-DD, the way `redbelly ship` names the file.
    function todayUtc() internal view returns (string memory) {
        (uint256 y, uint256 m, uint256 d) = civilFromTimestamp(nowSeconds());
        return string.concat(vm.toString(y), "-", _two(m), "-", _two(d));
    }

    /// @dev The wall clock, as `redbelly ship` uses, not `block.timestamp`: Redbelly makes blocks on
    /// demand, so on a quiet network the latest block can be hours old and "today" would be
    /// yesterday. Virtual so the unit tests can set the date.
    function nowSeconds() internal view virtual returns (uint256) {
        return vm.unixTime() / 1000;
    }

    /// @dev Days since 1970-01-01 to a proleptic Gregorian date (Howard Hinnant's civil_from_days).
    function civilFromTimestamp(uint256 timestamp) internal pure returns (uint256 year, uint256 month, uint256 day) {
        uint256 z = timestamp / 86400 + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        day = doy - (153 * mp + 2) / 5 + 1;
        month = mp < 10 ? mp + 3 : mp - 9;
        year = yoe + era * 400 + (month <= 2 ? 1 : 0);
    }

    function _two(uint256 n) private pure returns (string memory) {
        return n < 10 ? string.concat("0", vm.toString(n)) : vm.toString(n);
    }

    function _requireDeployerAllowed(address deployer) internal view {
        address registry = Redbelly.BOOTSTRAP_REGISTRY;
        require(registry.code.length > 0, "bootstrap registry has no code: this RPC is not a Redbelly network");
        address permission = IBootstrapRegistry(registry).getContractAddress("permission");
        require(permission != address(0) && permission.code.length > 0, "registry did not resolve 'permission'");
        bool allowed = IPermission(permission).isAllowed(deployer);
        if (!allowed) {
            console2.log(
                "deployer fails permission.isAllowed. Verify the wallet at https://access.redbelly.network and try again."
            );
            revert("deployer fails permission.isAllowed");
        }
        console2.log("permission.isAllowed(deployer): true");
    }

    /// @dev On mainnet every failure reverts. Elsewhere a non-Safe admin is reported and allowed.
    function _requireSafe(address admin, bool strict) internal view returns (bool ok) {
        if (admin.code.length == 0) {
            if (strict) revert("ADMIN_SAFE is not a contract (an EOA cannot be the mainnet admin)");
            console2.log("ADMIN_SAFE is not a contract; allowed on this chain but put a Safe there before mainnet");
            return false;
        }
        // The admin's own code and storage, not its answers: a contract can answer VERSION() and
        // masterCopy() any way it likes, and a look-alike with three getters used to pass here
        // (audit of 2026-09-19). A Safe is a SafeProxy whose slot 0 holds a canonical singleton.
        bool isProxy = admin.codehash == keccak256(SAFE_PROXY_141_RUNTIME);
        address singleton = address(uint160(uint256(vm.load(admin, bytes32(0)))));
        bool isCanonical = isProxy && Redbelly.isSafeSingleton(singleton) && singleton.code.length > 0;
        bool isVersion;
        if (isCanonical) {
            (bool okVersion, bytes memory v) = admin.staticcall(abi.encodeCall(ISafe.VERSION, ()));
            isVersion = okVersion && v.length >= 64
                && keccak256(bytes(abi.decode(v, (string)))) == keccak256(bytes(SAFE_VERSION));
        }
        if (!isVersion || !isCanonical) {
            if (strict) revert("ADMIN_SAFE is not a Safe 1.4.1 proxy on a canonical singleton");
            console2.log("ADMIN_SAFE is a contract but not a Safe 1.4.1 proxy on a canonical singleton");
            return false;
        }
        uint256 threshold = ISafe(admin).getThreshold();
        if (threshold < 2) {
            if (strict) revert("ADMIN_SAFE threshold must be at least 2");
            console2.log("ADMIN_SAFE threshold is 1; raise it to 2 or more before mainnet");
            return false;
        }
        if (ISafe(admin).getOwners().length < threshold) {
            if (strict) revert("ADMIN_SAFE has fewer owners than its threshold");
            console2.log("ADMIN_SAFE has fewer owners than its threshold; it can never sign");
            return false;
        }
        console2.log("ADMIN_SAFE is a Safe 1.4.1 with threshold", threshold);
        return true;
    }

    /// @dev Where the admin comes from. Virtual so tests can vary it without touching the
    /// process environment, which forge shares between tests running in parallel.
    function adminSafeFromEnv() internal view virtual returns (address) {
        return optionalEnvAddress("ADMIN_SAFE");
    }

    /// @dev An address from the environment, or zero when the variable is unset or empty
    /// (a copied .env.example leaves `ADMIN_SAFE=` blank, which must read as unset).
    function optionalEnvAddress(string memory name) internal view returns (address) {
        string memory raw = vm.envOr(name, string(""));
        if (bytes(raw).length == 0) return address(0);
        return vm.parseAddress(raw);
    }

    /// @dev Writes a deployment record (addresses, chain, commit hint) with nothing secret in it.
    function recordDeployment(string memory contractName, address deployed, Preflight memory p) internal {
        recordDeployment(contractName, deployed, p, "", "", address(0), 0);
    }

    /// @dev The same record with the constructor signature and its ABI-encoded arguments, the verifier
    /// and the request id, so `redbelly ship` and `forge verify-contract` read them rather than retype them.
    function recordDeployment(
        string memory contractName,
        address deployed,
        Preflight memory p,
        string memory constructorSignature,
        bytes memory constructorArgs,
        address verifier,
        uint64 requestId
    ) internal {
        string memory json = "deployment";
        vm.serializeUint(json, "chainId", p.chainId);
        vm.serializeString(json, "contractName", contractName);
        vm.serializeAddress(json, "contract", deployed);
        vm.serializeAddress(json, "deployer", p.deployer);
        vm.serializeAddress(json, "admin", p.admin);
        vm.serializeBool(json, "adminIsSafe", p.adminIsSafe);
        if (verifier != address(0)) {
            vm.serializeAddress(json, "verifier", verifier);
            vm.serializeUint(json, "requestId", requestId);
        }
        if (bytes(constructorSignature).length > 0) {
            vm.serializeString(json, "constructorSignature", constructorSignature);
            vm.serializeBytes(json, "constructorArgs", constructorArgs);
        }
        vm.serializeString(json, "solc", "0.8.30");
        string memory out = vm.serializeString(json, "evmVersion", "prague");
        string memory path = string.concat("deployments/", vm.toString(p.chainId), "-", contractName, ".json");
        // Only written when foundry.toml grants write access to deployments/ (CI and the golden path do).
        // The folder does not exist on a fresh scaffold, and vm.writeJson does not create it.
        if (vm.envOr("RECORD_DEPLOYMENT", true)) {
            try vm.createDir("deployments", true) { } catch { }
            try vm.writeJson(out, path) {
                console2.log("deployment record:", path);
            } catch {
                console2.log("deployment record not written (grant write access to deployments/ in foundry.toml)");
            }
        }
    }
}
