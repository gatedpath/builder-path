// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Pausable } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { IssuerRegistry } from "./IssuerRegistry.sol";

/// @title GatedERC20
/// @notice Contract kit v1: an ERC-20 where every holder must be eligible under the dApp's
/// Receptor verifier. Both parties of every movement are checked. Issuers mint inside a
/// time-boxed allowance, a compliance officer can move tokens with an on-chain justification
/// hash, a pauser can stop everything, and the admin (a timelock fed by a Safe) is the only
/// role that can unpause, change the verifier or hand out roles.
///
/// Gating. `transfer`, `transferFrom`, `subscribe`, `mint`, `burn` and `forceTransfer` all end in
/// `_update`, which runs the same `_requireEligible` check that `Gated.gatedFor` wraps, on the
/// real sender and the real recipient (never on a spender). `mint` and `forceTransfer` also carry
/// `gatedFor(to)` on the signature so the rule is visible in the ABI. A mint into a wallet that
/// is not eligible reverts; a forced transfer out of a wallet that is no longer eligible does not.
///
/// Revocation policy. A holder whose credential lapses keeps the balance but cannot send,
/// receive or burn. The compliance officer moves it with `forceTransfer`. Decide this before
/// mainnet and write the decision in your threat model; changing it later is a migration.
///
/// Non-reverting denial. `distribute` skips recipients who are not eligible instead of
/// reverting the whole batch, and records each skip with `Gated._recordDenial`, so the
/// `EligibilityDenied` event is on the log. That matters on Redbelly: the governors RPC serves
/// no trace methods, so the reason for a reverted transaction is gone once it is mined.
contract GatedERC20 is ERC20, ERC20Pausable, AccessControl, IssuerRegistry, Gated {
    /// @notice May move tokens out of any wallet with a justification hash.
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    /// @notice May pause. Unpausing needs `DEFAULT_ADMIN_ROLE`.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice Who holds what at construction. Zero for any operational role means `admin`.
    /// @param admin `DEFAULT_ADMIN_ROLE`: unpause, verifier and request id, subscriptions, role grants. Put a timelock here.
    /// @param pauser `PAUSER_ROLE`: the emergency path. Put a Safe here, not the timelock.
    /// @param compliance `COMPLIANCE_ROLE`: forced transfers. A Safe.
    /// @param issuerAdmin `ISSUER_ADMIN_ROLE`: grants time-boxed mint permissions. A Safe.
    struct Roles {
        address admin;
        address pauser;
        address compliance;
        address issuerAdmin;
    }

    /// @notice Tokens each eligible wallet receives on its one subscription.
    uint256 public immutable subscriptionAmount;

    /// @notice Whether `subscribe` is open.
    bool public subscriptionsOpen;

    /// @notice Which wallets have already subscribed.
    mapping(address wallet => bool) public hasSubscribed;

    /// @dev Set for the duration of a forced transfer so `_update` skips the check on `from`.
    bool private transient _forcing;
    /// @dev How many accounts hold DEFAULT_ADMIN_ROLE; never allowed back to zero.
    uint256 private _adminCount;

    /// @notice Emitted when the admin opens or closes subscriptions.
    event SubscriptionsOpenChanged(bool open);

    /// @notice Emitted on every subscription.
    event Subscribed(address indexed wallet, uint256 amount);

    /// @notice Emitted on every forced transfer. `justificationHash` is the keccak256 of the
    /// off-chain document (court order, regulator direction, incident ticket) that authorised
    /// it. Keep the document; the hash is what an auditor asks you to match it against.
    event ForcedTransfer(
        address indexed from, address indexed to, uint256 amount, bytes32 indexed justificationHash, address officer
    );

    /// @notice Emitted once per `distribute` call with what landed and what was skipped.
    event Distributed(address indexed issuer, uint256 recipients, uint256 minted, uint256 skipped);

    error SubscriptionsClosed();
    error AlreadySubscribed(address wallet);
    error EmptyJustification();
    error ZeroAdmin();
    error ZeroParty();
    error LastAdmin();
    error LengthMismatch(uint256 recipients, uint256 amounts);

    /// @param name_ ERC-20 name.
    /// @param symbol_ ERC-20 symbol.
    /// @param roles Who holds which role; see `Roles`.
    /// @param verifier_ The dApp's verifier behind `IRedbellyVerifier` (an adapter, or the mock off mainnet).
    /// @param requestId_ The eligibility request every gate here is bound to.
    /// @param subscriptionAmount_ Tokens minted by one `subscribe` call.
    constructor(
        string memory name_,
        string memory symbol_,
        Roles memory roles,
        IRedbellyVerifier verifier_,
        uint64 requestId_,
        uint256 subscriptionAmount_
    ) ERC20(name_, symbol_) Gated(verifier_, requestId_) {
        if (roles.admin == address(0)) revert ZeroAdmin();
        _grantRole(DEFAULT_ADMIN_ROLE, roles.admin);
        _grantRole(PAUSER_ROLE, roles.pauser == address(0) ? roles.admin : roles.pauser);
        _grantRole(COMPLIANCE_ROLE, roles.compliance == address(0) ? roles.admin : roles.compliance);
        _grantRole(ISSUER_ADMIN_ROLE, roles.issuerAdmin == address(0) ? roles.admin : roles.issuerAdmin);
        subscriptionAmount = subscriptionAmount_;
    }

    // ---- holder actions ----

    /// @notice Mint the subscription amount to the caller, once, while subscriptions are open.
    function subscribe() external gated whenNotPaused {
        if (!subscriptionsOpen) revert SubscriptionsClosed();
        if (hasSubscribed[msg.sender]) revert AlreadySubscribed(msg.sender);
        hasSubscribed[msg.sender] = true;
        _mint(msg.sender, subscriptionAmount);
        emit Subscribed(msg.sender, subscriptionAmount);
    }

    /// @notice Destroy `amount` of the caller's tokens. The caller must still be eligible: a
    /// holder whose credential has lapsed is frozen, not free to exit by burning.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    // ---- reads for a UI ----

    /// @notice Read-only mirror of `subscribe`'s conditions. Not a substitute for the gate.
    function canSubscribe(address wallet) external view returns (bool) {
        return subscriptionsOpen && !paused() && !hasSubscribed[wallet] && isEligible(wallet);
    }

    /// @notice Read-only mirror of a plain transfer's conditions. Not a substitute for the gate.
    function canTransfer(address from, address to, uint256 amount) external view returns (bool) {
        return !paused() && balanceOf(from) >= amount && isEligible(from) && isEligible(to);
    }

    // ---- issuers ----

    /// @notice Mint to one eligible wallet. The caller must hold an open issuer permission
    /// with enough allowance left (see `IssuerRegistry`).
    function mint(address to, uint256 amount) external gatedFor(to) {
        _consumeIssuance(msg.sender, amount);
        _mint(to, amount);
    }

    /// @notice Mint to many wallets, skipping any that are not eligible instead of reverting.
    /// Each skip emits `EligibilityDenied` from `Gated`, so the log says who was left out and
    /// why the totals do not add up. The issuer's allowance is charged for what was minted only.
    /// @return minted Total amount minted.
    /// @return skipped Total amount not minted because the recipient was not eligible.
    function distribute(address[] calldata to, uint256[] calldata amounts)
        external
        returns (uint256 minted, uint256 skipped)
    {
        if (to.length != amounts.length) revert LengthMismatch(to.length, amounts.length);
        for (uint256 i = 0; i < to.length; ++i) {
            if (!_checkEligible(to[i])) {
                _recordDenial(to[i]);
                skipped += amounts[i];
                continue;
            }
            minted += amounts[i];
        }
        _consumeIssuance(msg.sender, minted);
        for (uint256 i = 0; i < to.length; ++i) {
            if (_checkEligible(to[i])) _mint(to[i], amounts[i]);
        }
        emit Distributed(msg.sender, to.length, minted, skipped);
    }

    // ---- compliance ----

    /// @notice Move tokens out of any wallet, with the hash of the written reason. The recipient
    /// must be eligible; the sender need not be (that is the point). Refused while paused.
    /// @dev Both parties must be real wallets. In an ERC-20 a move from the zero address is a mint
    /// and a move to it is a burn, and neither belongs to the compliance role: minting is the
    /// issuers', inside their allowance and window, and burning is the holder's.
    /// @param justificationHash keccak256 of the document that authorised the move. Never zero.
    function forceTransfer(address from, address to, uint256 amount, bytes32 justificationHash)
        external
        onlyRole(COMPLIANCE_ROLE)
        gatedFor(to)
    {
        if (from == address(0) || to == address(0)) revert ZeroParty();
        if (justificationHash == bytes32(0)) revert EmptyJustification();
        _forcing = true;
        _update(from, to, amount);
        _forcing = false;
        emit ForcedTransfer(from, to, amount, justificationHash, msg.sender);
    }

    // ---- admin ----

    /// @notice Stop every movement. Fast path: the pauser is a Safe, not the timelock.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resume. Slow path on purpose: only the admin, which on mainnet is the timelock.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Open or close `subscribe`.
    function setSubscriptionsOpen(bool open) external onlyRole(DEFAULT_ADMIN_ROLE) {
        subscriptionsOpen = open;
        emit SubscriptionsOpenChanged(open);
    }

    // ---- the gate on every movement ----

    /// @dev Every mint, burn and transfer passes through here. The real parties must be
    /// eligible unless a compliance officer is forcing the move, and then only the recipient.
    /// @dev `virtual` so a product built on the kit (a bond that accrues coupons, a fund that tracks
    /// units) can account for every balance change. An override MUST call `super._update` first, or
    /// it bypasses the eligibility check and the pause; the bond in project 5 shows the shape.
    function _update(address from, address to, uint256 value) internal virtual override(ERC20, ERC20Pausable) {
        if (!_forcing) {
            if (from != address(0)) _requireEligible(from);
            if (to != address(0)) _requireEligible(to);
        }
        super._update(from, to, value);
    }

    // ---- the admin role cannot be emptied ----

    /// @dev Only the admin can unpause, repoint the verifier and grant roles, so a token whose last
    /// admin renounced (or was revoked) while paused would stay frozen for good. The last admin can
    /// do neither. Handing over is two steps: grant the next admin, then leave.
    function _grantRole(bytes32 role, address account) internal override returns (bool granted) {
        granted = super._grantRole(role, account);
        if (granted && role == DEFAULT_ADMIN_ROLE) _adminCount += 1;
    }

    function _revokeRole(bytes32 role, address account) internal override returns (bool revoked) {
        if (role == DEFAULT_ADMIN_ROLE && _adminCount == 1 && hasRole(role, account)) revert LastAdmin();
        revoked = super._revokeRole(role, account);
        if (revoked && role == DEFAULT_ADMIN_ROLE) _adminCount -= 1;
    }

    /// @dev Only the admin may repoint the verifier or the request id.
    function _authorizeVerifierChange() internal view override onlyRole(DEFAULT_ADMIN_ROLE) { }
}
