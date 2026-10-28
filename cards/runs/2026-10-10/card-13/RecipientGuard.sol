// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev The network's bootstrap registry, the one fixed address on both chains. It names the
/// permission contract, which can move (its proxy admin changed hands on 14 September 2026),
/// so the guard asks the registry on every call rather than remembering an address.
interface IBootstrapRegistry {
    function getContractAddress(string calldata name) external view returns (address);
}

/// @dev The network's permission contract: true for an address that has passed the identity gate
/// on this chain. What it says about who is behind the address is not this contract's claim.
interface IPermission {
    function isAllowed(address wallet) external view returns (bool);
}

/// @title RecipientGuard
/// @notice A transfer that refuses to lose your money. Before RBNT or a token leaves the sender,
/// the guard asks the network whether the recipient has passed the identity gate on this chain.
/// If not, nothing moves: a typo that produces an address nobody holds cannot swallow the funds.
///
/// What the check is, and is not. `permission.isAllowed(to)` is true for an address that completed
/// identity verification and enabled it on this chain. It says nothing about which person or
/// institution that is: a typo that lands on another real, verified address goes through. The
/// address book in the web app is the other half of the answer; this contract is only the first.
///
/// Contract recipients. A contract has never been through the identity gate, so `isAllowed` is
/// not a meaningful question for one. The caller must say `allowContract` in the call; without it
/// a contract recipient is refused with `RecipientIsContract`. A wallet that has delegated its
/// code under EIP-7702 (23 bytes beginning 0xef0100) is still a wallet and is checked as one.
///
/// Holds nothing, owns nothing. There is no admin, no pause and no balance; the guard forwards
/// what it is given in the same call. A contract recipient that is explicitly allowed can call
/// back into `send` during the forward, and finds no state to disturb.
contract RecipientGuard {
    using SafeERC20 for IERC20;

    /// @notice The bootstrap registry, the same address on chain 151 and chain 153.
    address public constant BOOTSTRAP_REGISTRY = 0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5;

    /// @notice What the guard concludes about a recipient before it moves anything.
    enum Verdict {
        Permissioned,
        NotPermissioned,
        Contract,
        Zero
    }

    error ZeroRecipient();
    error NothingToSend();
    error RecipientNotPermissioned(address to);
    error RecipientIsContract(address to);
    error NativeTransferFailed(address to);
    error NoPermissionContract();

    event Sent(address indexed from, address indexed to, uint256 amount);
    event TokenSent(address indexed token, address indexed from, address indexed to, uint256 amount);

    /// @notice Sends the RBNT attached to the call to `to`, once `to` passes the check.
    /// @param allowContract True to let a contract receive. False refuses every contract.
    function send(address to, bool allowContract) external payable {
        if (msg.value == 0) revert NothingToSend();
        _requirePasses(to, allowContract);
        (bool ok,) = to.call{ value: msg.value }("");
        if (!ok) revert NativeTransferFailed(to);
        emit Sent(msg.sender, to, msg.value);
    }

    /// @notice Moves `amount` of `token` from the caller to `to`, once `to` passes the check.
    /// The caller approves this guard first; the token itself may add its own gate on top.
    function sendToken(IERC20 token, address to, uint256 amount, bool allowContract) external {
        if (amount == 0) revert NothingToSend();
        _requirePasses(to, allowContract);
        token.safeTransferFrom(msg.sender, to, amount);
        emit TokenSent(address(token), msg.sender, to, amount);
    }

    /// @notice The same conclusion `send` would reach, for a wallet to show before it asks for a signature.
    function check(address to) public view returns (Verdict) {
        if (to == address(0)) return Verdict.Zero;
        if (_isContract(to)) return Verdict.Contract;
        return permission().isAllowed(to) ? Verdict.Permissioned : Verdict.NotPermissioned;
    }

    /// @notice The permission contract the registry names right now.
    function permission() public view returns (IPermission) {
        if (BOOTSTRAP_REGISTRY.code.length == 0) revert NoPermissionContract();
        address p = IBootstrapRegistry(BOOTSTRAP_REGISTRY).getContractAddress("permission");
        if (p == address(0) || p.code.length == 0) revert NoPermissionContract();
        return IPermission(p);
    }

    function _requirePasses(address to, bool allowContract) internal view {
        Verdict v = check(to);
        if (v == Verdict.Zero) revert ZeroRecipient();
        if (v == Verdict.Contract) {
            if (!allowContract) revert RecipientIsContract(to);
            return;
        }
        if (v == Verdict.NotPermissioned) revert RecipientNotPermissioned(to);
    }

    function _isContract(address a) internal view returns (bool) {
        uint256 size = a.code.length;
        if (size == 0) return false;
        if (size == 23) {
            bytes memory code = a.code;
            // EIP-7702 delegation designator: a wallet, not a contract.
            if (code[0] == 0xef && code[1] == 0x01 && code[2] == 0x00) return false;
        }
        return true;
    }
}
