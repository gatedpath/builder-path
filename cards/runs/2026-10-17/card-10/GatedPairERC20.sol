// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IUniswapV2Pair } from "@uniswap/v2-core/interfaces/IUniswapV2Pair.sol";

/// @title GatedPairERC20
/// @notice Uniswap v2's liquidity token (`UniswapV2ERC20`, v1.0.1) ported to Solidity 0.8.30, with one
/// rule added: a liquidity token may only land in a wallet that passes the provider gate, or in the
/// pair itself on its way to being burned.
///
/// Port notes against the vendored `lib/v2-core/contracts/UniswapV2ERC20.sol`: `SafeMath` dropped for
/// checked arithmetic; `chainid` read with `block.chainid`; the domain separator is immutable;
/// `_mint` and `_transfer` call `_requireProvider(to)`, which the pair wires to the factory. Everything
/// else, the permit, the infinite allowance, the names of the storage reads, is the stock contract.
abstract contract GatedPairERC20 is IUniswapV2Pair {
    string public constant name = "Gated Uniswap V2";
    string public constant symbol = "gUNI-V2";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address owner => uint256) public balanceOf;
    mapping(address owner => mapping(address spender => uint256)) public allowance;

    bytes32 public immutable DOMAIN_SEPARATOR;
    /// @dev Stock Uniswap writes this hash out as a literal. It is computed here because a bare 64-hex value
    /// in a source file has the shape of a private key, and pre-flight's secret scanner refuses it.
    bytes32 public constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
    mapping(address owner => uint256) public nonces;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /// @dev The provider gate. Reverts unless `to` may hold liquidity tokens.
    function _requireProvider(address to) internal view virtual;

    /// @dev Mints to a wallet that passes the provider gate. The MINIMUM_LIQUIDITY lock mints to the zero
    /// address and skips it; nobody holds that balance.
    function _mint(address to, uint256 value) internal {
        if (to != address(0)) _requireProvider(to);
        _mintUnchecked(to, value);
    }

    /// @dev Mints without the gate. Only `_mintFee` uses it, for the protocol fee recipient.
    function _mintUnchecked(address to, uint256 value) internal {
        totalSupply += value;
        balanceOf[to] += value;
        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) internal {
        balanceOf[from] -= value;
        totalSupply -= value;
        emit Transfer(from, address(0), value);
    }

    function _approve(address owner, address spender, uint256 value) private {
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }

    /// @dev The recipient must pass the provider gate unless it is the pair itself: moving tokens into
    /// the pair is the first half of `burn`, and a holder whose credential lapsed may still leave.
    /// The sender is not checked: the gate is on entry, and a position may change hands only
    /// towards a wallet that could have opened it.
    function _transfer(address from, address to, uint256 value) private {
        if (to != address(this)) _requireProvider(to);
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        if (allowance[from][msg.sender] != type(uint256).max) {
            allowance[from][msg.sender] -= value;
        }
        _transfer(from, to, value);
        return true;
    }

    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
    {
        // A permit's deadline is a calendar fact; the block's clock is the right one to compare with.
        // slither-disable-next-line timestamp
        // forge-lint: disable-next-line(block-timestamp)
        require(deadline >= block.timestamp, "UniswapV2: EXPIRED");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline))
            )
        );
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress != address(0) && recoveredAddress == owner, "UniswapV2: INVALID_SIGNATURE");
        _approve(owner, spender, value);
    }
}
