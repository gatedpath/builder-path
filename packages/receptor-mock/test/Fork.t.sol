// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {GatedTest} from "./GatedTest.sol";
import {GatedCounter} from "./examples/GatedCounter.sol";

/// @dev Interfaces of two Redbelly system contracts, from `packages/chain-definitions` (verified
/// 2026-09-12): the bootstrap registry's `getContractAddress(string)` and the permission
/// contract's `isAllowed(address)`.
interface IBootstrapRegistry {
    function getContractAddress(string calldata name) external view returns (address);
}

interface IPermission {
    function isAllowed(address account) external view returns (bool);
}

/// @title ForkTest
/// @notice Runs only under `forge test --fork-url https://governors.testnet.redbelly.network`.
/// Without a fork every test here is skipped. Reads only; nothing is signed or sent.
contract ForkTest is GatedTest {
    uint256 internal constant REDBELLY_TESTNET = 153;

    /// @dev Same address on 151 and 153; has code from block 0 (RESEARCH.md, 2026-09-12).
    address internal constant BOOTSTRAP_REGISTRY = 0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5;

    /// @dev Third-party wallet that `isAllowed` returned true for on 2026-09-12 (chain-definitions
    /// `knownAllowed`). It may stop being allowed; the test says so if it does.
    address internal constant KNOWN_ALLOWED = 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76;

    uint64 internal constant REQUEST_ID = 108;
    address internal alice = makeAddr("alice");

    function setUp() public {
        vm.skip(block.chainid != REDBELLY_TESTNET);
        _deployMock();
    }

    function test_fork_registryResolvesPermissionAndIsAllowedAnswers() public view {
        assertGt(BOOTSTRAP_REGISTRY.code.length, 0, "registry has code");
        address permission = IBootstrapRegistry(BOOTSTRAP_REGISTRY).getContractAddress("permission");
        assertTrue(permission != address(0), "registry names a permission contract");
        assertGt(permission.code.length, 0, "permission contract has code");

        assertFalse(IPermission(permission).isAllowed(address(0)), "zero address is never allowed");
        assertTrue(
            IPermission(permission).isAllowed(KNOWN_ALLOWED),
            "known allowed wallet no longer passes isAllowed; update chain-definitions knownAllowed"
        );
    }

    function test_fork_fiveStatesAgainstRealChainState() public {
        // Prague bytecode compiled here runs against the forked chain's state.
        GatedCounter counter = new GatedCounter(mock, REQUEST_ID);
        assertRevertsForAllInvalidStates(address(counter), abi.encodeCall(counter.increment, ()), alice, REQUEST_ID);
        assertEq(counter.count(), 1);
    }
}
