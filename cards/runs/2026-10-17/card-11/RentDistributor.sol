// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { PropertyUnits } from "./PropertyUnits.sol";

/// @title RentDistributor
/// @notice Pays rental income to the holders of a property's units, pro rata, in a stablecoin. The
/// manager deposits one round; the round records the amount and a snapshot, the end of the second
/// before the deposit (the last closed second, which nothing after the deposit can alter); each
/// holder pulls their share, which is the round's amount times the units they held at the snapshot
/// over the units in existence then. No loop over holders anywhere: the unit register's own
/// balance history answers both questions.
///
/// Gating. `claim` is gated to the same request as the units, so a holder whose credential has
/// lapsed is paid nothing until it is valid again; the share waits in the contract. Deposits are
/// not gated: the manager is paying, not receiving.
///
/// Dust. Every share rounds down, so a round can leave a few smallest units of the stablecoin in
/// the contract once everyone has claimed. `unclaimed(round)` says how much is left; nothing moves
/// it, and a fee-on-transfer or rebasing stablecoin would make the figure wrong (see the threat
/// model; USDC-style coins do not do this).
contract RentDistributor is AccessControl, Gated {
    using SafeERC20 for IERC20;

    /// @notice May deposit rent. The property manager's Safe, acting without delay.
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    /// @notice One deposit of rent for one property.
    /// @param propertyId The property whose holders are paid.
    /// @param amount What was deposited, in the stablecoin's smallest unit.
    /// @param snapshot The clock reading the shares are computed at: the second before the deposit.
    /// @param totalUnits Units in existence at the snapshot.
    /// @param claimed Paid out so far.
    struct Round {
        uint256 propertyId;
        uint256 amount;
        uint48 snapshot;
        uint256 totalUnits;
        uint256 claimed;
    }

    /// @notice Who holds what at construction. Zero for the manager means `admin`.
    struct Roles {
        address admin;
        address manager;
    }

    /// @notice The unit register whose history decides every share.
    PropertyUnits public immutable units;

    /// @notice The stablecoin rent is paid in.
    IERC20 public immutable stable;

    /// @notice How many rounds have been deposited; round ids run from 1.
    uint256 public roundCount;

    mapping(uint256 roundId => Round) private _rounds;
    mapping(uint256 roundId => mapping(address holder => bool)) private _claimed;

    /// @notice Emitted on every deposit.
    event RentDeposited(
        uint256 indexed roundId, uint256 indexed propertyId, uint256 amount, uint48 snapshot, uint256 totalUnits
    );

    /// @notice Emitted on every claim.
    event RentClaimed(uint256 indexed roundId, address indexed holder, uint256 unitsHeld, uint256 amount);

    error ZeroAdmin();
    error ZeroAddress();
    error ZeroAmount();
    error NoUnits(uint256 propertyId);
    error UnknownRound(uint256 roundId);
    error AlreadyClaimed(uint256 roundId, address holder);
    error NothingToClaim(uint256 roundId, address holder);

    /// @param units_ The unit register.
    /// @param stable_ The stablecoin.
    /// @param roles Who holds which role; see `Roles`.
    /// @param verifier_ The same verifier the units use.
    /// @param requestId_ The same request id the units are bound to.
    constructor(
        PropertyUnits units_,
        IERC20 stable_,
        Roles memory roles,
        IRedbellyVerifier verifier_,
        uint64 requestId_
    ) Gated(verifier_, requestId_) {
        if (roles.admin == address(0)) revert ZeroAdmin();
        if (address(units_) == address(0) || address(stable_) == address(0)) revert ZeroAddress();
        units = units_;
        stable = stable_;
        _grantRole(DEFAULT_ADMIN_ROLE, roles.admin);
        _grantRole(MANAGER_ROLE, roles.manager == address(0) ? roles.admin : roles.manager);
    }

    // ---- manager ----

    /// @notice Deposit one round of rent for a property. The manager approves this contract first.
    /// The shares are fixed at the end of the previous second: units that change hands from now on carry
    /// no claim on it.
    /// @return roundId The new round's id.
    function deposit(uint256 propertyId, uint256 amount) external onlyRole(MANAGER_ROLE) returns (uint256 roundId) {
        if (amount == 0) revert ZeroAmount();
        uint48 snapshot = units.clock() - 1;
        uint256 total = units.getPastTotalUnits(propertyId, snapshot);
        if (total == 0) revert NoUnits(propertyId);
        roundId = ++roundCount;
        _rounds[roundId] =
            Round({ propertyId: propertyId, amount: amount, snapshot: snapshot, totalUnits: total, claimed: 0 });
        stable.safeTransferFrom(msg.sender, address(this), amount);
        emit RentDeposited(roundId, propertyId, amount, snapshot, total);
    }

    // ---- holders ----

    /// @notice Pull the caller's share of a round. Once per holder per round; the caller must be
    /// eligible now, whatever their state was at the snapshot.
    function claim(uint256 roundId) external gated returns (uint256 amount) {
        Round storage r = _rounds[roundId];
        if (r.amount == 0) revert UnknownRound(roundId);
        if (_claimed[roundId][msg.sender]) revert AlreadyClaimed(roundId, msg.sender);
        uint256 held = units.getPastUnits(r.propertyId, msg.sender, r.snapshot);
        amount = _share(r, held);
        if (amount == 0) revert NothingToClaim(roundId, msg.sender);
        _claimed[roundId][msg.sender] = true;
        r.claimed += amount;
        stable.safeTransfer(msg.sender, amount);
        emit RentClaimed(roundId, msg.sender, held, amount);
    }

    // ---- reads ----

    /// @notice One round.
    function round(uint256 roundId) external view returns (Round memory) {
        return _rounds[roundId];
    }

    /// @notice Whether `holder` has claimed `roundId`.
    function hasClaimed(uint256 roundId, address holder) external view returns (bool) {
        return _claimed[roundId][holder];
    }

    /// @notice What `holder` could pull from `roundId` right now: zero once claimed and zero for a
    /// wallet that held nothing at the snapshot. Does not consult the gate; `claim` does.
    function claimable(uint256 roundId, address holder) external view returns (uint256) {
        Round storage r = _rounds[roundId];
        if (r.amount == 0 || _claimed[roundId][holder]) return 0;
        return _share(r, units.getPastUnits(r.propertyId, holder, r.snapshot));
    }

    /// @notice What is left of a round in this contract: the shares not yet pulled, and, once every
    /// holder has pulled, the dust that rounding left behind.
    function unclaimed(uint256 roundId) external view returns (uint256) {
        Round storage r = _rounds[roundId];
        return r.amount - r.claimed;
    }

    function _share(Round storage r, uint256 held) private view returns (uint256) {
        return (r.amount * held) / r.totalUnits;
    }

    /// @dev Only the admin may repoint the verifier or the request id.
    function _authorizeVerifierChange() internal view override onlyRole(DEFAULT_ADMIN_ROLE) { }
}
