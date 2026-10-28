// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IUniswapV2Pair } from "@uniswap/v2-core/interfaces/IUniswapV2Pair.sol";
import { IUniswapV2Callee } from "@uniswap/v2-core/interfaces/IUniswapV2Callee.sol";
import { GatedPairERC20 } from "./GatedPairERC20.sol";
import { GatedPairFactory } from "./GatedPairFactory.sol";

/// @title GatedPair
/// @notice Uniswap v2's pair (`UniswapV2Pair`, v1.0.1) ported to Solidity 0.8.30, with two gates read
/// from the factory.
///
/// Where the gates go. Pool entry is the moment liquidity tokens land in a wallet: `_mint` and
/// `_transfer` in `GatedPairERC20` ask the factory `requireEligibleProvider(to)`, so only a wallet
/// holding an accepted proof for the AU wholesale investor recipe can add liquidity or receive a
/// position, whoever sent the transaction (a router included). Swap output, withdrawn reserves and
/// skimmed excess leave the pool only to a recipient the network verified, or to another pair of this
/// factory: `swap`, `burn` and `skim` ask `requireVerifiedRecipient(to)`. Removing liquidity is not
/// gated on the credential: a holder whose certificate lapsed moves the tokens into the pair and
/// burns, as any holder does. The trade-offs are in `TRADE-OFFS.md` beside this file.
///
/// Port notes against the vendored `lib/v2-core/contracts/UniswapV2Pair.sol`: `SafeMath` dropped for
/// checked arithmetic, with `unchecked` only where the stock code wants the overflow (the 32-bit
/// timestamp and the price accumulators); OpenZeppelin's `SafeERC20` instead of the hand-rolled
/// `_safeTransfer`; OpenZeppelin's `Math.sqrt` and `Math.min`; the reentrancy lock in transient
/// storage; `uint112(-1)` is `type(uint112).max`. The maths of `mint`, `burn`, `swap` and the fee
/// are the stock lines.
contract GatedPair is GatedPairERC20 {
    using SafeERC20 for IERC20;

    uint256 public constant MINIMUM_LIQUIDITY = 10 ** 3;
    uint224 private constant Q112 = 2 ** 112;

    address public immutable factory;
    address public token0;
    address public token1;

    uint112 private _reserve0;
    uint112 private _reserve1;
    uint32 private _blockTimestampLast;

    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;
    /// @notice reserve0 * reserve1, as of immediately after the most recent liquidity event.
    uint256 public kLast;

    bool private transient _locked;

    constructor() {
        factory = msg.sender;
    }

    modifier lock() {
        _enterLock();
        _;
        _exitLock();
    }

    /// @inheritdoc IUniswapV2Pair
    function initialize(address token0_, address token1_) external {
        require(msg.sender == factory, "UniswapV2: FORBIDDEN");
        token0 = token0_;
        token1 = token1_;
    }

    /// @inheritdoc IUniswapV2Pair
    function getReserves() public view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) {
        reserve0 = _reserve0;
        reserve1 = _reserve1;
        blockTimestampLast = _blockTimestampLast;
    }

    /// @notice Mints liquidity tokens for the balances sent in since the last event. `to` must pass the
    /// provider gate; the sender may be a router.
    /// @dev Low-level, as in Uniswap: call it from a contract that performs the safety checks.
    function mint(address to) external lock returns (uint256 liquidity) {
        (uint112 reserve0, uint112 reserve1,) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - reserve0;
        uint256 amount1 = balance1 - reserve1;

        bool feeOn = _mintFee(reserve0, reserve1);
        uint256 supply = totalSupply; // after _mintFee, which can change it
        if (supply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            liquidity = Math.min(amount0 * supply / reserve0, amount1 * supply / reserve1);
        }
        require(liquidity > 0, "UniswapV2: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);

        _update(balance0, balance1, reserve0, reserve1);
        if (feeOn) kLast = uint256(_reserve0) * _reserve1;
        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice Burns the liquidity tokens held by the pair and sends the reserves they represent to `to`,
    /// which must be a verified wallet. The credential is not checked: exit is always open.
    function burn(address to) external lock returns (uint256 amount0, uint256 amount1) {
        _requireRecipient(to);
        (uint112 reserve0, uint112 reserve1,) = getReserves();
        IERC20 t0 = IERC20(token0);
        IERC20 t1 = IERC20(token1);
        uint256 balance0 = t0.balanceOf(address(this));
        uint256 balance1 = t1.balanceOf(address(this));
        uint256 liquidity = balanceOf[address(this)];

        bool feeOn = _mintFee(reserve0, reserve1);
        uint256 supply = totalSupply; // after _mintFee, which can change it
        amount0 = liquidity * balance0 / supply; // balances, not reserves: pro-rata of what is really here
        amount1 = liquidity * balance1 / supply;
        require(amount0 > 0 && amount1 > 0, "UniswapV2: INSUFFICIENT_LIQUIDITY_BURNED");
        _burn(address(this), liquidity);
        t0.safeTransfer(to, amount0);
        t1.safeTransfer(to, amount1);
        balance0 = t0.balanceOf(address(this));
        balance1 = t1.balanceOf(address(this));

        _update(balance0, balance1, reserve0, reserve1);
        if (feeOn) kLast = uint256(_reserve0) * _reserve1;
        emit Burn(msg.sender, amount0, amount1, to);
    }

    /// @notice Sends `amount0Out` and `amount1Out` to `to` and requires the constant product to hold
    /// after the fee. `to` must be a verified wallet or a pair of this factory; the caller is whoever
    /// the chain let send the transaction, which on Redbelly is a verified wallet or a contract one called.
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external lock {
        _requireRecipient(to);
        require(amount0Out > 0 || amount1Out > 0, "UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT");
        (uint112 reserve0, uint112 reserve1,) = getReserves();
        require(amount0Out < reserve0 && amount1Out < reserve1, "UniswapV2: INSUFFICIENT_LIQUIDITY");

        uint256 balance0;
        uint256 balance1;
        {
            address t0 = token0;
            address t1 = token1;
            require(to != t0 && to != t1, "UniswapV2: INVALID_TO");
            if (amount0Out > 0) IERC20(t0).safeTransfer(to, amount0Out); // optimistic, as in Uniswap
            if (amount1Out > 0) IERC20(t1).safeTransfer(to, amount1Out);
            if (data.length > 0) IUniswapV2Callee(to).uniswapV2Call(msg.sender, amount0Out, amount1Out, data);
            balance0 = IERC20(t0).balanceOf(address(this));
            balance1 = IERC20(t1).balanceOf(address(this));
        }
        uint256 amount0In = balance0 > reserve0 - amount0Out ? balance0 - (reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > reserve1 - amount1Out ? balance1 - (reserve1 - amount1Out) : 0;
        require(amount0In > 0 || amount1In > 0, "UniswapV2: INSUFFICIENT_INPUT_AMOUNT");
        {
            uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
            uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
            require(
                balance0Adjusted * balance1Adjusted >= uint256(reserve0) * uint256(reserve1) * (1000 ** 2),
                "UniswapV2: K"
            );
        }

        _update(balance0, balance1, reserve0, reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    /// @notice Sends any balance above the reserves to `to`, a verified wallet.
    function skim(address to) external lock {
        _requireRecipient(to);
        IERC20 t0 = IERC20(token0);
        IERC20 t1 = IERC20(token1);
        t0.safeTransfer(to, t0.balanceOf(address(this)) - _reserve0);
        t1.safeTransfer(to, t1.balanceOf(address(this)) - _reserve1);
    }

    /// @notice Sets the reserves to the balances.
    function sync() external lock {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)), _reserve0, _reserve1);
    }

    // ---- the gates, read from the factory ----

    /// @dev Pool entry: `to` must hold an accepted proof for the recipe. Reverts `NotEligible(to, requestId)`.
    function _requireProvider(address to) internal view override {
        GatedPairFactory(factory).requireEligibleProvider(to);
    }

    /// @dev Pool exit and swap output: `to` must be a verified wallet or a pair. Reverts `NotVerified(to)`.
    function _requireRecipient(address to) private view {
        GatedPairFactory(factory).requireVerifiedRecipient(to);
    }

    // ---- stock Uniswap internals ----

    /// @dev Updates the reserves and, on the first call in a block, the price accumulators.
    function _update(uint256 balance0, uint256 balance1, uint112 reserve0, uint112 reserve1) private {
        require(balance0 <= type(uint112).max && balance1 <= type(uint112).max, "UniswapV2: OVERFLOW");
        // The accumulators are a time-weighted price: block.timestamp is the point, and the 32-bit wrap
        // and the accumulator overflow are the design (Uniswap v2 whitepaper, section 2.2).
        // slither-disable-next-line timestamp
        // forge-lint: disable-next-line(block-timestamp)
        uint256 timestamp = block.timestamp % 2 ** 32;
        // the modulo above keeps it inside 32 bits
        // forge-lint: disable-next-line(unsafe-typecast)
        uint32 blockTimestamp = uint32(timestamp);
        unchecked {
            uint32 timeElapsed = blockTimestamp - _blockTimestampLast; // overflow is desired
            if (timeElapsed > 0 && reserve0 != 0 && reserve1 != 0) {
                // * never overflows, and + overflow is desired
                price0CumulativeLast += uint256(_uqdiv(_encode(reserve1), reserve0)) * timeElapsed;
                price1CumulativeLast += uint256(_uqdiv(_encode(reserve0), reserve1)) * timeElapsed;
            }
        }
        // both checked against type(uint112).max above
        // forge-lint: disable-next-line(unsafe-typecast)
        _reserve0 = uint112(balance0);
        // forge-lint: disable-next-line(unsafe-typecast)
        _reserve1 = uint112(balance1);
        _blockTimestampLast = blockTimestamp;
        emit Sync(_reserve0, _reserve1);
    }

    /// @dev If the fee is on, mints liquidity equal to a sixth of the growth in sqrt(k) to the fee
    /// recipient. The recipient is the operator's treasury named by the factory owner, not a liquidity
    /// provider, so it is minted without the provider gate: a treasury that could not pass the
    /// credential must not freeze every mint and burn in the pool.
    function _mintFee(uint112 reserve0, uint112 reserve1) private returns (bool feeOn) {
        address feeTo = GatedPairFactory(factory).feeTo();
        feeOn = feeTo != address(0);
        uint256 k = kLast;
        if (feeOn) {
            if (k != 0) {
                uint256 rootK = Math.sqrt(uint256(reserve0) * reserve1);
                uint256 rootKLast = Math.sqrt(k);
                if (rootK > rootKLast) {
                    uint256 numerator = totalSupply * (rootK - rootKLast);
                    uint256 denominator = rootK * 5 + rootKLast;
                    uint256 liquidity = numerator / denominator;
                    if (liquidity > 0) _mintUnchecked(feeTo, liquidity);
                }
            }
        } else if (k != 0) {
            kLast = 0;
        }
    }

    /// @dev UQ112x112.encode: a uint112 as a binary fixed point number.
    function _encode(uint112 y) private pure returns (uint224) {
        return uint224(y) * Q112; // never overflows
    }

    /// @dev UQ112x112.uqdiv: a UQ112x112 divided by a uint112.
    function _uqdiv(uint224 x, uint112 y) private pure returns (uint224) {
        return x / uint224(y);
    }

    function _enterLock() private {
        require(!_locked, "UniswapV2: LOCKED");
        _locked = true;
    }

    function _exitLock() private {
        _locked = false;
    }
}
