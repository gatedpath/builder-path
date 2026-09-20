// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { RedbellyDeployScript } from "../script/RedbellyDeployScript.sol";
import { Redbelly } from "../script/Redbelly.sol";
import { BootstrapRegistryMock, PermissionMock, SafeLikeMock, SafeSingletonMock } from "./mocks/RedbellyMocks.sol";

/// @dev Exposes preflight() as an external call so reverts can be expected, and takes the
/// admin from a field rather than the environment: forge runs tests in parallel threads and
/// vm.setEnv is process-wide, so env-driven tests would race.
contract PreflightHarness is RedbellyDeployScript {
    address public adminSafe;
    string public reportPath;

    function setAdminSafe(address a) external {
        adminSafe = a;
    }

    /// @dev Each test points the ship-report gate at its own file under deployments/, because tests
    /// run in parallel on one file system and today's real path would race.
    function setReportPath(string calldata p) external {
        reportPath = p;
    }

    function adminSafeFromEnv() internal view override returns (address) {
        return adminSafe;
    }

    function shipReportPath(uint256 chainId) internal view override returns (string memory) {
        return bytes(reportPath).length > 0 ? reportPath : super.shipReportPath(chainId);
    }

    uint256 public rpcChainIdOverride;

    /// @dev What the attached RPC would say. Unset, it agrees with the simulation, as an honest run does.
    function setRpcChainId(uint256 id) external {
        rpcChainIdOverride = id;
    }

    function rpcChainId() internal view override returns (uint256) {
        return rpcChainIdOverride == 0 ? block.chainid : rpcChainIdOverride;
    }

    /// @dev The tests set the date with vm.warp.
    function nowSeconds() internal view override returns (uint256) {
        return block.timestamp;
    }

    function today() external view returns (string memory) {
        return todayUtc();
    }

    function civil(uint256 ts) external pure returns (uint256, uint256, uint256) {
        return civilFromTimestamp(ts);
    }

    function run() external returns (Preflight memory) {
        return preflight();
    }
}

/// @notice The deploy script's refusal logic, exercised without an RPC. Chain id, registry
/// and permission are faked with cheatcodes; the Safe is a look-alike with the fields the
/// script reads. The scaffolder's integration test repeats the mainnet cases on anvil with
/// the real Safe 1.4.1 bytecode.
contract DeployPreflightTest is Test {
    PreflightHarness internal harness;
    PermissionMock internal permission;
    address internal deployer = makeAddr("deployer");

    function setUp() public {
        harness = new PreflightHarness();
        // Put a registry that resolves "permission" at the real registry address.
        BootstrapRegistryMock registry = new BootstrapRegistryMock();
        vm.etch(Redbelly.BOOTSTRAP_REGISTRY, address(registry).code);
        permission = new PermissionMock();
        BootstrapRegistryMock(Redbelly.BOOTSTRAP_REGISTRY).set("permission", address(permission));
    }

    /// @dev Runtime code of a real SafeProxy 1.4.1 (171 bytes; test/fixtures in the scaffolder say how
    /// it was derived). The deploy script checks this code's hash, so a look-alike will not do.
    bytes internal constant SAFE_PROXY_RUNTIME =
        hex"608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033";

    uint256 internal safeCount;

    /// @dev A real proxy in front of a stand-in singleton, with `owners` owners.
    function _safe(uint256 threshold, string memory version, address singleton, uint256 owners)
        internal
        returns (address proxy)
    {
        proxy = address(uint160(0x5afe0000) + uint160(++safeCount));
        vm.etch(proxy, SAFE_PROXY_RUNTIME);
        vm.store(proxy, bytes32(uint256(0)), bytes32(uint256(uint160(singleton))));
        vm.store(proxy, bytes32(uint256(1)), bytes32(threshold));
        vm.store(proxy, bytes32(uint256(2)), bytes32(owners));
        // A short string in storage: the bytes left-aligned, the last byte twice the length.
        vm.store(proxy, bytes32(uint256(3)), bytes32(bytes(version)) | bytes32(bytes(version).length * 2));
        if (singleton.code.length == 0 && Redbelly.isSafeSingleton(singleton)) {
            vm.etch(singleton, address(new SafeSingletonMock()).code);
        }
    }

    function _safe(uint256 threshold, string memory version, address singleton) internal returns (address) {
        return _safe(threshold, version, singleton, threshold + 1);
    }

    function test_mainnet_refuses_without_admin_safe() public {
        vm.chainId(Redbelly.MAINNET_CHAIN_ID);
        permission.setAllowed(deployer, true);
        vm.prank(deployer);
        vm.expectRevert(bytes("ADMIN_SAFE is not set"));
        harness.run();
    }

    function test_mainnet_refuses_eoa_admin() public {
        vm.chainId(Redbelly.MAINNET_CHAIN_ID);
        permission.setAllowed(deployer, true);
        harness.setAdminSafe(makeAddr("eoa-admin"));
        vm.prank(deployer);
        vm.expectRevert(bytes("ADMIN_SAFE is not a contract (an EOA cannot be the mainnet admin)"));
        harness.run();
    }

    function test_mainnet_refuses_threshold_one() public {
        vm.chainId(Redbelly.MAINNET_CHAIN_ID);
        permission.setAllowed(deployer, true);
        harness.setAdminSafe(_safe(1, "1.4.1", Redbelly.SAFE_SINGLETON));
        vm.prank(deployer);
        vm.expectRevert(bytes("ADMIN_SAFE threshold must be at least 2"));
        harness.run();
    }

    function test_mainnet_refuses_wrong_version_or_singleton() public {
        vm.chainId(Redbelly.MAINNET_CHAIN_ID);
        permission.setAllowed(deployer, true);
        harness.setAdminSafe(_safe(2, "1.3.0", Redbelly.SAFE_SINGLETON));
        vm.prank(deployer);
        vm.expectRevert(bytes("ADMIN_SAFE is not a Safe 1.4.1 proxy on a canonical singleton"));
        harness.run();

        harness.setAdminSafe(_safe(2, "1.4.1", makeAddr("not-a-singleton")));
        vm.prank(deployer);
        vm.expectRevert(bytes("ADMIN_SAFE is not a Safe 1.4.1 proxy on a canonical singleton"));
        harness.run();
    }

    function test_mainnet_refuses_unverified_deployer() public {
        vm.chainId(Redbelly.MAINNET_CHAIN_ID);
        permission.setAllowed(deployer, false);
        harness.setAdminSafe(_safe(2, "1.4.1", Redbelly.SAFE_SINGLETON));
        vm.prank(deployer);
        vm.expectRevert(bytes("deployer fails permission.isAllowed"));
        harness.run();
    }

    function test_mainnet_accepts_safe_with_threshold_two_and_verified_deployer_and_todays_ship_report() public {
        vm.chainId(Redbelly.MAINNET_CHAIN_ID);
        permission.setAllowed(deployer, true);
        address safe = _safe(2, "1.4.1", Redbelly.SAFE_L2_SINGLETON);
        harness.setAdminSafe(safe);
        string memory path = "deployments/test-ship-151-accept.md";
        harness.setReportPath(path);
        vm.createDir("deployments", true);
        vm.warp(1789387200); // 2026-09-14T12:00:00Z
        vm.writeFile(path, "<!-- redbelly-ship chain=151 date=2026-09-14 ok=true generatedAt=test -->\n# test\n");
        vm.prank(deployer);
        RedbellyDeployScript.Preflight memory p = harness.run();
        vm.removeFile(path);
        assertEq(p.admin, safe);
        assertTrue(p.adminIsSafe);
        assertTrue(p.identityChecked);
    }

    function test_mainnet_refuses_without_todays_ship_report() public {
        vm.chainId(Redbelly.MAINNET_CHAIN_ID);
        permission.setAllowed(deployer, true);
        harness.setAdminSafe(_safe(2, "1.4.1", Redbelly.SAFE_SINGLETON));
        harness.setReportPath("deployments/test-ship-151-missing.md");
        vm.prank(deployer);
        vm.expectRevert(bytes("no ship report dated today for chain 151: run redbelly ship first"));
        harness.run();
    }

    /// Audit 2026-09-19. A flag can change the simulated chain id; it cannot change the network.
    function test_refuses_when_the_simulated_chain_is_not_the_rpcs() public {
        vm.chainId(31337); // what `--chain 31337` does to the simulation
        harness.setRpcChainId(Redbelly.MAINNET_CHAIN_ID); // what the RPC still is
        vm.prank(deployer);
        vm.expectRevert(bytes("chain id mismatch: the simulation and the RPC disagree"));
        harness.run();

        vm.chainId(Redbelly.TESTNET_CHAIN_ID); // FOUNDRY_PROFILE=testnet pointed at a mainnet RPC
        vm.prank(deployer);
        vm.expectRevert(bytes("chain id mismatch: the simulation and the RPC disagree"));
        harness.run();
    }

    /// Audit 2026-09-19. A contract that answers like a Safe is not a Safe.
    function test_mainnet_refuses_a_safe_lookalike_and_a_safe_that_cannot_sign() public {
        vm.chainId(Redbelly.MAINNET_CHAIN_ID);
        permission.setAllowed(deployer, true);
        harness.setAdminSafe(address(new SafeLikeMock("1.4.1", 2, Redbelly.SAFE_SINGLETON)));
        vm.prank(deployer);
        vm.expectRevert(bytes("ADMIN_SAFE is not a Safe 1.4.1 proxy on a canonical singleton"));
        harness.run();

        harness.setAdminSafe(_safe(2, "1.4.1", Redbelly.SAFE_SINGLETON, 1)); // threshold 2, one owner
        vm.prank(deployer);
        vm.expectRevert(bytes("ADMIN_SAFE has fewer owners than its threshold"));
        harness.run();
    }

    /// Audit 2026-09-19. The gate used to ask only whether a file existed.
    function test_mainnet_refuses_a_ship_report_that_does_not_say_so() public {
        vm.chainId(Redbelly.MAINNET_CHAIN_ID);
        vm.warp(1789387200); // 2026-09-14T12:00:00Z
        permission.setAllowed(deployer, true);
        harness.setAdminSafe(_safe(2, "1.4.1", Redbelly.SAFE_SINGLETON));
        vm.createDir("deployments", true);
        string[4] memory bad = [
            "",
            "<!-- redbelly-ship chain=153 date=2026-09-14 ok=true generatedAt=test -->\n",
            "<!-- redbelly-ship chain=151 date=2026-09-13 ok=true generatedAt=test -->\n",
            "<!-- redbelly-ship chain=151 date=2026-09-14 ok=false generatedAt=test -->\n"
        ];
        for (uint256 i = 0; i < bad.length; i++) {
            string memory path = string.concat("deployments/test-ship-151-bad-", vm.toString(i), ".md");
            harness.setReportPath(path);
            vm.writeFile(path, bad[i]);
            vm.prank(deployer);
            vm.expectRevert(bytes("the ship report for chain 151 does not say chain=151, today's date and ok=true"));
            harness.run();
            vm.removeFile(path);
        }
    }

    function test_ship_report_path_is_todays_utc_date() public {
        vm.warp(1789387200); // 2026-09-14T12:00:00Z
        assertEq(harness.today(), "2026-09-14");
        vm.warp(1709251199); // 2024-02-29T23:59:59Z, a leap day
        assertEq(harness.today(), "2024-02-29");
        vm.warp(946684800); // 2000-01-01T00:00:00Z
        assertEq(harness.today(), "2000-01-01");
        vm.warp(4102358400); // 2099-12-31T00:00:00Z
        assertEq(harness.today(), "2099-12-31");
        (uint256 y, uint256 m, uint256 d) = harness.civil(0);
        assertEq(y, 1970);
        assertEq(m, 1);
        assertEq(d, 1);
    }

    function test_testnet_warns_without_ship_report_and_accepts_with_one() public {
        vm.chainId(Redbelly.TESTNET_CHAIN_ID);
        permission.setAllowed(deployer, true);
        harness.setReportPath("deployments/test-ship-153-missing.md");
        vm.prank(deployer);
        RedbellyDeployScript.Preflight memory p = harness.run();
        assertEq(p.admin, deployer);
        string memory path = "deployments/test-ship-153-present.md";
        harness.setReportPath(path);
        vm.createDir("deployments", true);
        vm.warp(1789387200); // 2026-09-14T12:00:00Z
        vm.writeFile(path, "<!-- redbelly-ship chain=153 date=2026-09-14 ok=true generatedAt=test -->\n");
        vm.prank(deployer);
        p = harness.run();
        vm.removeFile(path);
        assertEq(p.admin, deployer);
    }

    function test_testnet_allows_eoa_admin_but_still_checks_identity() public {
        vm.chainId(Redbelly.TESTNET_CHAIN_ID);
        permission.setAllowed(deployer, false);
        vm.prank(deployer);
        vm.expectRevert(bytes("deployer fails permission.isAllowed"));
        harness.run();

        permission.setAllowed(deployer, true);
        vm.prank(deployer);
        RedbellyDeployScript.Preflight memory p = harness.run();
        assertEq(p.admin, deployer);
        assertFalse(p.adminIsSafe);
        assertTrue(p.identityChecked);
    }

    function test_other_chain_skips_identity() public {
        vm.chainId(31337);
        vm.prank(deployer);
        RedbellyDeployScript.Preflight memory p = harness.run();
        assertFalse(p.identityChecked);
        assertEq(p.admin, deployer);
    }

    function test_redbelly_refuses_when_registry_missing() public {
        vm.chainId(Redbelly.TESTNET_CHAIN_ID);
        vm.etch(Redbelly.BOOTSTRAP_REGISTRY, "");
        vm.prank(deployer);
        vm.expectRevert(bytes("bootstrap registry has no code: this RPC is not a Redbelly network"));
        harness.run();
    }
}
