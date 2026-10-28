// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IUniswapV2Factory } from "@uniswap/v2-core/interfaces/IUniswapV2Factory.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { IPermission } from "./IPermission.sol";
import { GatedPair } from "./GatedPair.sol";

/// @title GatedPairFactory
/// @notice Uniswap v2's factory with the two gates every pair it creates consults.
///
/// The factory is the one `Gated` contract: it binds the dApp's verifier and the AU wholesale
/// investor recipe (request id 708) once, and every pair asks it `requireEligibleProvider(to)` before
/// liquidity tokens land in a wallet. The second gate is the network's own: `permission.isAllowed`,
/// the contract the bootstrap registry names `permission`, which every verified Redbelly wallet
/// passes. Pairs ask `requireVerifiedRecipient(to)` before swap output or withdrawn reserves leave
/// the pool. Both gates live here so the owner repoints them in one transaction for every pair.
///
/// The ABI is Uniswap's `IUniswapV2Factory`. `feeToSetter` is the owner (OpenZeppelin `Ownable`),
/// and `setFeeToSetter` is `transferOwnership` under Uniswap's name. `createPair` is open, as in
/// stock Uniswap: creating a pair places no money in it, and the chain already verified the caller.
contract GatedPairFactory is IUniswapV2Factory, Ownable, Gated {
    /// @notice Thrown when a swap or burn would send pool assets to an address the network has not verified.
    /// @param wallet The refused recipient.
    error NotVerified(address wallet);

    /// @notice Thrown when a zero address is supplied as the permission contract.
    error ZeroPermission();

    /// @notice Emitted when the permission contract changes, including at construction.
    event PermissionChanged(address indexed previousPermission, address indexed newPermission);

    /// @notice Emitted when the protocol fee recipient changes.
    event FeeToChanged(address indexed previousFeeTo, address indexed newFeeTo);

    /// @notice The network gate every recipient of pool assets must pass.
    IPermission public permission;

    /// @inheritdoc IUniswapV2Factory
    address public feeTo;

    /// @inheritdoc IUniswapV2Factory
    mapping(address tokenA => mapping(address tokenB => address pair)) public getPair;

    /// @inheritdoc IUniswapV2Factory
    address[] public allPairs;

    /// @notice True for every pair this factory created. A pair is a valid swap recipient (multi-hop).
    mapping(address pair => bool) public isPair;

    /// @param owner_ Repoints the gates and the fee recipient. A Safe, or the timelock in front of one.
    /// @param verifier_ The dApp's verifier behind `IRedbellyVerifier` (an adapter, or the mock off mainnet).
    /// @param requestId_ The recipe every liquidity provider must hold a proof for; 708 is AU wholesale.
    /// @param permission_ The network's permission contract, from the bootstrap registry.
    constructor(address owner_, IRedbellyVerifier verifier_, uint64 requestId_, IPermission permission_)
        Ownable(owner_)
        Gated(verifier_, requestId_)
    {
        _setPermission(permission_);
    }

    // ---- the two gates, as pairs read them ----

    /// @notice Reverts `NotEligible(wallet, requestId)` unless `wallet` holds an accepted proof for the recipe.
    /// @dev The pair calls this before any liquidity token lands in `wallet`. The revert bubbles up
    /// through the pair unchanged, so a refusal reads the same on every pair.
    function requireEligibleProvider(address wallet) external view {
        _requireEligible(wallet);
    }

    /// @notice Reverts `NotVerified(wallet)` unless the network verified `wallet`, or it is a pair of this factory.
    /// @dev The pair calls this before swap output, withdrawn reserves or skimmed excess leave it.
    /// A pair of this factory passes so a router can chain swaps through several pools.
    function requireVerifiedRecipient(address wallet) external view {
        if (!isVerifiedRecipient(wallet)) revert NotVerified(wallet);
    }

    /// @notice Read-only mirror of `requireVerifiedRecipient`. Not a substitute for the gate.
    function isVerifiedRecipient(address wallet) public view returns (bool) {
        return isPair[wallet] || permission.isAllowed(wallet);
    }

    // ---- Uniswap v2 factory ----

    /// @inheritdoc IUniswapV2Factory
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// @inheritdoc IUniswapV2Factory
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        require(tokenA != tokenB, "UniswapV2: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "UniswapV2: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "UniswapV2: PAIR_EXISTS");
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        pair = address(new GatedPair{ salt: salt }());
        GatedPair(pair).initialize(token0, token1);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        isPair[pair] = true;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    /// @inheritdoc IUniswapV2Factory
    /// @dev Uniswap's name for the owner.
    function feeToSetter() external view returns (address) {
        return owner();
    }

    /// @inheritdoc IUniswapV2Factory
    /// @dev The protocol fee recipient is the operator's treasury, named here; the pair mints its share
    /// of liquidity tokens to it without the provider gate (see `GatedPair._mintFee`).
    function setFeeTo(address newFeeTo) external onlyOwner {
        emit FeeToChanged(feeTo, newFeeTo);
        feeTo = newFeeTo;
    }

    /// @inheritdoc IUniswapV2Factory
    /// @dev Uniswap's name for `transferOwnership`.
    function setFeeToSetter(address newOwner) external onlyOwner {
        _transferOwnership(newOwner);
    }

    // ---- admin ----

    /// @notice Points the recipient gate at a different permission contract.
    function setPermission(IPermission newPermission) external onlyOwner {
        _setPermission(newPermission);
    }

    /// @dev Only the owner may repoint the verifier or the request id.
    function _authorizeVerifierChange() internal view override onlyOwner { }

    function _setPermission(IPermission newPermission) private {
        if (address(newPermission) == address(0)) revert ZeroPermission();
        emit PermissionChanged(address(permission), address(newPermission));
        permission = newPermission;
    }
}
