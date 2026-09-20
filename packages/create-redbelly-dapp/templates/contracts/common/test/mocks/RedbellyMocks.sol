// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Stand-ins for the network's bootstrap registry and permission contract. Tests
/// etch them at the real addresses so the deploy script's identity check runs against a
/// chain that behaves like Redbelly. They exist only under test/; nothing deploys them.
contract PermissionMock {
    mapping(address => bool) public isAllowed;

    function setAllowed(address wallet, bool allowed) external {
        isAllowed[wallet] = allowed;
    }
}

contract BootstrapRegistryMock {
    mapping(bytes32 => address) private _named;

    function set(string calldata name, address target) external {
        _named[keccak256(bytes(name))] = target;
    }

    function getContractAddress(string calldata name) external view returns (address) {
        return _named[keccak256(bytes(name))];
    }
}

/// @notice The subset of a Safe that the deploy script inspects, for unit tests that want
/// to vary threshold and singleton without the real bytecode. The integration test in the
/// scaffolder uses the real Safe 1.4.1 bytecode on anvil instead.
contract SafeLikeMock {
    string public VERSION;
    uint256 public getThreshold;
    address public masterCopy;

    constructor(string memory version_, uint256 threshold_, address masterCopy_) {
        VERSION = version_;
        getThreshold = threshold_;
        masterCopy = masterCopy_;
    }
}

/// @dev Stands where a Safe singleton stands, behind a real SafeProxy: the proxy delegates here, so
/// these read the PROXY's storage. Slot 0 is the proxy's own (the singleton address); the tests write
/// slots 1 to 3 with vm.store. The scaffolder's integration test runs the same checks against the
/// real Safe 1.4.1 singleton code.
contract SafeSingletonMock {
    address internal _singletonSlot; // slot 0: belongs to the proxy
    uint256 internal _threshold; // slot 1
    uint256 internal _ownerCount; // slot 2
    string internal _version; // slot 3

    function VERSION() external view returns (string memory) {
        return _version;
    }

    function getThreshold() external view returns (uint256) {
        return _threshold;
    }

    function getOwners() external view returns (address[] memory owners) {
        owners = new address[](_ownerCount);
        for (uint256 i = 0; i < _ownerCount; i++) {
            owners[i] = address(uint160(i + 1));
        }
    }
}

