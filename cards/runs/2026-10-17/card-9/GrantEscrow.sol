// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";

/// @title GrantEscrow
/// @notice Card 9 of the builder path: a funder deposits stablecoin for a named grantee, the
/// grantee proves eligibility under the dApp's recipe, and a reviewer releases the money one
/// milestone at a time, writing a note on chain with every release.
///
/// Gating. Two functions are gated on the same request id. `accept` is `gated`: the grantee's
/// own call, the proof that the wallet named by the funder can pass the recipe. `release` is
/// `gatedFor(grantee)`: the check runs again at the moment money leaves, so a grantee whose
/// credential has lapsed between milestones is paid nothing further until it is valid again.
/// Funding is not gated: the funder is naming a wallet, not receiving anything.
///
/// Roles, the way the kit's token does them. `DEFAULT_ADMIN_ROLE` (a timelock fed by a Safe on
/// mainnet) grants roles and may repoint the verifier or the request id. `REVIEWER_ROLE` (a Safe)
/// releases tranches and cancels grants. Nobody else moves money; the funder gets the remainder
/// back only when the reviewer cancels.
///
/// The remainder. A grant has a fixed list of tranches set at funding and the sum is the deposit.
/// Released tranches go to the grantee; whatever is not yet released is the remainder, and it
/// leaves the contract in exactly one way: `cancel`, which sends all of it back to the funder with
/// the reviewer's note. A grant whose tranches are all released holds nothing.
///
/// What is on chain. Every note is stored in full beside its tranche and emitted in the event,
/// because the card's point is a written record: the explorer shows what the reviewer said when
/// the money moved, and no trace method is needed to read it back (the governors RPC serves none).
/// Nothing personal lands here: the chain sees a wallet, an amount, a request id and the words
/// the reviewer chose to write.
contract GrantEscrow is AccessControl, Gated {
    using SafeERC20 for IERC20;

    /// @notice May release tranches and cancel grants.
    bytes32 public constant REVIEWER_ROLE = keccak256("REVIEWER_ROLE");

    /// @notice Upper bound on tranches per grant, so the funding loop has a fixed ceiling.
    uint256 public constant MAX_MILESTONES = 24;

    /// @notice Who holds what at construction. Zero for the reviewer means `admin`.
    /// @param admin `DEFAULT_ADMIN_ROLE`: verifier and request id, role grants. Put a timelock here.
    /// @param reviewer `REVIEWER_ROLE`: releases and cancellations. A Safe.
    struct Roles {
        address admin;
        address reviewer;
    }

    struct Milestone {
        uint256 amount;
        bool released;
        string note;
    }

    struct Grant {
        address funder;
        address grantee;
        IERC20 token;
        uint256 deposited;
        uint256 released;
        uint256 nextMilestone;
        bool accepted;
        bool cancelled;
    }

    /// @notice How many grants have been funded; grant ids run from 1 to this number.
    uint256 public grantCount;

    mapping(uint256 grantId => Grant) private _grants;
    mapping(uint256 grantId => Milestone[]) private _milestones;

    /// @notice A funder deposited `amount` of `token` for `grantee`, split into `milestones` tranches.
    event Funded(
        uint256 indexed grantId,
        address indexed funder,
        address indexed grantee,
        address token,
        uint256 amount,
        uint256 milestones
    );

    /// @notice The grantee passed the gate and accepted the grant.
    event Accepted(uint256 indexed grantId, address indexed grantee);

    /// @notice The reviewer released tranche `milestone` of `amount` to the grantee, with `note`.
    event Released(uint256 indexed grantId, uint256 indexed milestone, uint256 amount, string note, address reviewer);

    /// @notice The reviewer cancelled the grant and `remainder` went back to the funder, with `note`.
    event Cancelled(uint256 indexed grantId, uint256 remainder, string note, address reviewer);

    error ZeroAdmin();
    error ZeroGrantee();
    error ZeroToken();
    error ZeroTranche(uint256 milestone);
    error NoMilestones();
    error TooManyMilestones(uint256 given, uint256 max);
    error TranchesDoNotSum(uint256 tranches, uint256 amount);
    error UnknownGrant(uint256 grantId);
    error NotTheGrantee(uint256 grantId, address caller);
    error AlreadyAccepted(uint256 grantId);
    error NotAccepted(uint256 grantId);
    error GrantCancelled(uint256 grantId);
    error NothingLeft(uint256 grantId);
    error EmptyNote();

    /// @param roles Who holds which role; see `Roles`.
    /// @param verifier_ The dApp's verifier behind `IRedbellyVerifier` (an adapter, or the mock off mainnet).
    /// @param requestId_ The recipe every gate here is bound to. 100 is the accredited-issuer recipe.
    constructor(Roles memory roles, IRedbellyVerifier verifier_, uint64 requestId_) Gated(verifier_, requestId_) {
        if (roles.admin == address(0)) revert ZeroAdmin();
        _grantRole(DEFAULT_ADMIN_ROLE, roles.admin);
        _grantRole(REVIEWER_ROLE, roles.reviewer == address(0) ? roles.admin : roles.reviewer);
    }

    // ---- the funder ----

    /// @notice Deposit `amount` of `token` for `grantee`, to be paid out in `tranches`, in order.
    /// The funder must have approved this contract for `amount` first. Anyone may fund; the gate
    /// is on the grantee, who has to accept before anything is released.
    /// @return grantId The new grant's id.
    function fund(address grantee, IERC20 token, uint256 amount, uint256[] calldata tranches)
        external
        returns (uint256 grantId)
    {
        if (grantee == address(0)) revert ZeroGrantee();
        if (address(token) == address(0)) revert ZeroToken();
        if (tranches.length == 0) revert NoMilestones();
        if (tranches.length > MAX_MILESTONES) revert TooManyMilestones(tranches.length, MAX_MILESTONES);

        grantId = ++grantCount;
        Grant storage g = _grants[grantId];
        g.funder = msg.sender;
        g.grantee = grantee;
        g.token = token;
        g.deposited = amount;

        uint256 sum;
        Milestone[] storage ms = _milestones[grantId];
        for (uint256 i = 0; i < tranches.length; ++i) {
            if (tranches[i] == 0) revert ZeroTranche(i);
            sum += tranches[i];
            ms.push(Milestone({ amount: tranches[i], released: false, note: "" }));
        }
        if (sum != amount) revert TranchesDoNotSum(sum, amount);

        emit Funded(grantId, msg.sender, grantee, address(token), amount, tranches.length);
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    // ---- the grantee ----

    /// @notice The grantee proves eligibility and takes the grant on. Until this call nothing can
    /// be released. The gate is on the caller, and the caller must be the wallet the funder named.
    function accept(uint256 grantId) external gated {
        Grant storage g = _requireGrant(grantId);
        if (msg.sender != g.grantee) revert NotTheGrantee(grantId, msg.sender);
        if (g.accepted) revert AlreadyAccepted(grantId);
        if (g.cancelled) revert GrantCancelled(grantId);
        g.accepted = true;
        emit Accepted(grantId, msg.sender);
    }

    // ---- the reviewer ----

    /// @notice Release the next tranche to the grantee with a written note. The grantee must be
    /// eligible at this moment, not only when they accepted; a lapsed credential holds the money.
    function release(uint256 grantId, string calldata note) external onlyRole(REVIEWER_ROLE) {
        Grant storage g = _requireGrant(grantId);
        _requireEligible(g.grantee);
        if (bytes(note).length == 0) revert EmptyNote();
        if (!g.accepted) revert NotAccepted(grantId);
        if (g.cancelled) revert GrantCancelled(grantId);
        Milestone[] storage ms = _milestones[grantId];
        uint256 index = g.nextMilestone;
        if (index >= ms.length) revert NothingLeft(grantId);

        Milestone storage m = ms[index];
        m.released = true;
        m.note = note;
        g.nextMilestone = index + 1;
        g.released += m.amount;

        emit Released(grantId, index, m.amount, note, msg.sender);
        g.token.safeTransfer(g.grantee, m.amount);
    }

    /// @notice End the grant. Whatever has not been released goes back to the funder, with the
    /// reviewer's note. A grant can be cancelled before or after acceptance, and after some
    /// tranches have gone out; released money is never clawed back.
    function cancel(uint256 grantId, string calldata note) external onlyRole(REVIEWER_ROLE) {
        Grant storage g = _requireGrant(grantId);
        if (bytes(note).length == 0) revert EmptyNote();
        if (g.cancelled) revert GrantCancelled(grantId);
        uint256 left = g.deposited - g.released;
        if (left == 0) revert NothingLeft(grantId);
        g.cancelled = true;

        emit Cancelled(grantId, left, note, msg.sender);
        g.token.safeTransfer(g.funder, left);
    }

    // ---- reads for a UI ----

    /// @notice The grant as stored.
    function grant(uint256 grantId) external view returns (Grant memory) {
        return _grants[grantId];
    }

    /// @notice One tranche: its amount, whether it went out, and the reviewer's note if it did.
    function milestone(uint256 grantId, uint256 index) external view returns (Milestone memory) {
        return _milestones[grantId][index];
    }

    /// @notice How many tranches the grant was split into.
    function milestoneCount(uint256 grantId) external view returns (uint256) {
        return _milestones[grantId].length;
    }

    /// @notice What is still held for this grant: the deposit less what was released, or zero
    /// once cancelled (the remainder has gone back to the funder).
    function remainder(uint256 grantId) external view returns (uint256) {
        Grant storage g = _grants[grantId];
        if (g.cancelled) return 0;
        return g.deposited - g.released;
    }

    /// @notice Read-only mirror of `release`'s conditions. Not a substitute for the gate.
    function canRelease(uint256 grantId) external view returns (bool) {
        Grant storage g = _grants[grantId];
        return g.funder != address(0) && g.accepted && !g.cancelled && g.nextMilestone < _milestones[grantId].length
            && isEligible(g.grantee);
    }

    // ---- internals ----

    function _requireGrant(uint256 grantId) private view returns (Grant storage g) {
        g = _grants[grantId];
        if (g.funder == address(0)) revert UnknownGrant(grantId);
    }

    /// @dev Only the admin may repoint the verifier or the request id.
    function _authorizeVerifierChange() internal view override onlyRole(DEFAULT_ADMIN_ROLE) { }
}
