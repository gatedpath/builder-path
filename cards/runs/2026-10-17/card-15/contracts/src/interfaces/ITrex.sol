// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// The slice of the ERC-3643 (T-REX 4.1.3) and ONCHAINID (2.2.1) interfaces this project calls, written
// here at 0.8.30 because the vendored sources pin solc 0.8.17 and a 0.8.30 file cannot import them.
// Selectors match the reference contracts; the structs encode identically to theirs.

interface IOwnable {
    function owner() external view returns (address);
    function transferOwnership(address newOwner) external;
}

interface IAgentRole is IOwnable {
    function addAgent(address agent) external;
    function removeAgent(address agent) external;
    function isAgent(address agent) external view returns (bool);
}

interface ITrexToken is IAgentRole {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function version() external view returns (string memory);
    function paused() external view returns (bool);
    function onchainID() external view returns (address);
    function compliance() external view returns (address);
    function identityRegistry() external view returns (address);
    function balanceOf(address wallet) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function isFrozen(address wallet) external view returns (bool);
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function setAddressFrozen(address wallet, bool frozen) external;
    function pause() external;
    function unpause() external;
}

interface IIdentityRegistry is IAgentRole {
    function registerIdentity(address wallet, address identity, uint16 country) external;
    function deleteIdentity(address wallet) external;
    function isVerified(address wallet) external view returns (bool);
    function identity(address wallet) external view returns (address);
    function investorCountry(address wallet) external view returns (uint16);
    function contains(address wallet) external view returns (bool);
    function identityStorage() external view returns (address);
    function issuersRegistry() external view returns (address);
    function topicsRegistry() external view returns (address);
}

interface IIdentityRegistryStorage is IAgentRole {
    function bindIdentityRegistry(address identityRegistry) external;
    function linkedIdentityRegistries() external view returns (address[] memory);
}

interface ITrustedIssuersRegistry is IOwnable {
    function addTrustedIssuer(address issuer, uint256[] calldata claimTopics) external;
    function removeTrustedIssuer(address issuer) external;
    function getTrustedIssuers() external view returns (address[] memory);
    function getTrustedIssuerClaimTopics(address issuer) external view returns (uint256[] memory);
    function isTrustedIssuer(address issuer) external view returns (bool);
}

interface IClaimTopicsRegistry is IOwnable {
    function addClaimTopic(uint256 topic) external;
    function removeClaimTopic(uint256 topic) external;
    function getClaimTopics() external view returns (uint256[] memory);
}

interface IModularCompliance is IOwnable {
    function bindToken(address token) external;
    function getTokenBound() external view returns (address);
    function canTransfer(address from, address to, uint256 amount) external view returns (bool);
}

interface ITrexImplementationAuthority is IOwnable {
    struct Version {
        uint8 major;
        uint8 minor;
        uint8 patch;
    }

    struct TREXContracts {
        address tokenImplementation;
        address ctrImplementation;
        address irImplementation;
        address irsImplementation;
        address tirImplementation;
        address mcImplementation;
    }

    function addTREXVersion(Version calldata version, TREXContracts calldata contracts) external;
    function useTREXVersion(Version calldata version) external;
    function getCurrentVersion() external view returns (Version memory);
    function getTokenImplementation() external view returns (address);
    function isReferenceContract() external view returns (bool);
}

/// @dev ONCHAINID's Identity (ERC-734 keys, ERC-735 claims). Key purposes: 1 management, 2 action, 3 claim.
/// A key is `keccak256(abi.encode(address))`; a claim id is `keccak256(abi.encode(issuer, topic))`.
interface IOnchainId {
    function addKey(bytes32 key, uint256 purpose, uint256 keyType) external returns (bool);
    function removeKey(bytes32 key, uint256 purpose) external returns (bool);
    function keyHasPurpose(bytes32 key, uint256 purpose) external view returns (bool);
    function addClaim(
        uint256 topic,
        uint256 scheme,
        address issuer,
        bytes calldata signature,
        bytes calldata data,
        string calldata uri
    ) external returns (bytes32);
    function removeClaim(bytes32 claimId) external returns (bool);
    function getClaim(bytes32 claimId)
        external
        view
        returns (uint256, uint256, address, bytes memory, bytes memory, string memory);
    function getClaimIdsByTopic(uint256 topic) external view returns (bytes32[] memory);
}

/// @dev What the identity registry asks a claim issuer, and what ONCHAINID's ClaimIssuer answers.
interface IClaimIssuerLike {
    function isClaimValid(address identity, uint256 topic, bytes calldata signature, bytes calldata data)
        external
        view
        returns (bool);
    function isClaimRevoked(bytes calldata signature) external view returns (bool);
    function revokeClaimBySignature(bytes calldata signature) external;
}
