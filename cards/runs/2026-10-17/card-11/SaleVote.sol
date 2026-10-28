// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { PropertyUnits } from "./PropertyUnits.sol";

/// @title SaleVote
/// @notice A vote on selling a property, weighted by units. The proposer records the hash of the
/// sale terms and a deadline; each holder votes once with the units they held at the end of the
/// second before the proposal (the last closed second, which nothing after the proposal can alter),
/// read from the unit register's history, so units that change hands during the vote carry no
/// second vote. The proposal passes when the units voting for it are more than
/// half of every unit in existence at that moment: a sale is a decision of the whole register, not
/// of whoever turned up.
///
/// Gating. `castVote` is gated to the same request as the units: a holder whose credential has
/// lapsed is not counted until it is valid again, even though the units are still theirs.
///
/// Clock. Timestamps, not blocks (ERC-6372 `mode=timestamp`, as the units): Redbelly produces
/// blocks on demand, so a deadline in blocks would never arrive on a quiet day and would arrive in
/// minutes on a busy one.
contract SaleVote is AccessControl, Gated {
    /// @notice May propose a sale. The property manager's Safe, acting without delay.
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");

    /// @notice The shortest and longest voting periods a proposer may set.
    uint48 public constant MIN_VOTING_PERIOD = 1 days;
    uint48 public constant MAX_VOTING_PERIOD = 90 days;

    enum State {
        Active,
        Passed,
        Defeated
    }

    /// @notice One proposal to sell one property.
    /// @param propertyId The property.
    /// @param termsHash keccak256 of the sale terms. Keep the document.
    /// @param snapshot The clock reading weights are read at: the second before the proposal.
    /// @param deadline The last clock reading at which a vote counts.
    /// @param totalUnits Units in existence at the snapshot.
    /// @param forUnits Units voted for.
    /// @param againstUnits Units voted against.
    struct Proposal {
        uint256 propertyId;
        bytes32 termsHash;
        uint48 snapshot;
        uint48 deadline;
        uint256 totalUnits;
        uint256 forUnits;
        uint256 againstUnits;
    }

    /// @notice Who holds what at construction. Zero for the proposer means `admin`.
    struct Roles {
        address admin;
        address proposer;
    }

    /// @notice The unit register whose history weighs every vote.
    PropertyUnits public immutable units;

    /// @notice How many proposals have been made; ids run from 1.
    uint256 public proposalCount;

    mapping(uint256 proposalId => Proposal) private _proposals;
    mapping(uint256 proposalId => mapping(address voter => bool)) private _voted;

    /// @notice Emitted on every proposal.
    event SaleProposed(
        uint256 indexed proposalId,
        uint256 indexed propertyId,
        bytes32 indexed termsHash,
        uint48 snapshot,
        uint48 deadline,
        uint256 totalUnits
    );

    /// @notice Emitted on every vote.
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 unitsHeld);

    error ZeroAdmin();
    error ZeroAddress();
    error ZeroTermsHash();
    error NoUnits(uint256 propertyId);
    error VotingPeriodOutOfRange(uint48 period, uint48 min, uint48 max);
    error UnknownProposal(uint256 proposalId);
    error VotingNotOpen(uint256 proposalId, State state);
    error AlreadyVoted(uint256 proposalId, address voter);
    error NoUnitsAtSnapshot(uint256 proposalId, address voter);

    /// @param units_ The unit register.
    /// @param roles Who holds which role; see `Roles`.
    /// @param verifier_ The same verifier the units use.
    /// @param requestId_ The same request id the units are bound to.
    constructor(PropertyUnits units_, Roles memory roles, IRedbellyVerifier verifier_, uint64 requestId_)
        Gated(verifier_, requestId_)
    {
        if (roles.admin == address(0)) revert ZeroAdmin();
        if (address(units_) == address(0)) revert ZeroAddress();
        units = units_;
        _grantRole(DEFAULT_ADMIN_ROLE, roles.admin);
        _grantRole(PROPOSER_ROLE, roles.proposer == address(0) ? roles.admin : roles.proposer);
    }

    // ---- proposer ----

    /// @notice Propose selling a property on the terms whose hash is given. Weights are fixed at the
    /// end of the previous second; voting opens at once and closes `votingPeriod` seconds from now.
    /// @return proposalId The new proposal's id.
    function propose(uint256 propertyId, bytes32 termsHash, uint48 votingPeriod)
        external
        onlyRole(PROPOSER_ROLE)
        returns (uint256 proposalId)
    {
        if (termsHash == bytes32(0)) revert ZeroTermsHash();
        if (votingPeriod < MIN_VOTING_PERIOD || votingPeriod > MAX_VOTING_PERIOD) {
            revert VotingPeriodOutOfRange(votingPeriod, MIN_VOTING_PERIOD, MAX_VOTING_PERIOD);
        }
        uint48 current = units.clock();
        uint48 snapshot = current - 1;
        uint48 deadline = current + votingPeriod;
        uint256 total = units.getPastTotalUnits(propertyId, snapshot);
        if (total == 0) revert NoUnits(propertyId);
        proposalId = ++proposalCount;
        _proposals[proposalId] = Proposal({
            propertyId: propertyId,
            termsHash: termsHash,
            snapshot: snapshot,
            deadline: deadline,
            totalUnits: total,
            forUnits: 0,
            againstUnits: 0
        });
        emit SaleProposed(proposalId, propertyId, termsHash, snapshot, deadline, total);
    }

    // ---- holders ----

    /// @notice Vote with the units held at the proposal's snapshot. Once per holder per proposal; the
    /// caller must be eligible now.
    function castVote(uint256 proposalId, bool support) external gated returns (uint256 weight) {
        Proposal storage p = _proposals[proposalId];
        if (p.deadline == 0) revert UnknownProposal(proposalId);
        State s = _state(p);
        if (s != State.Active) revert VotingNotOpen(proposalId, s);
        if (_voted[proposalId][msg.sender]) revert AlreadyVoted(proposalId, msg.sender);
        weight = units.getPastUnits(p.propertyId, msg.sender, p.snapshot);
        if (weight == 0) revert NoUnitsAtSnapshot(proposalId, msg.sender);
        _voted[proposalId][msg.sender] = true;
        if (support) p.forUnits += weight;
        else p.againstUnits += weight;
        emit VoteCast(proposalId, msg.sender, support, weight);
    }

    // ---- reads ----

    /// @notice One proposal.
    function proposal(uint256 proposalId) external view returns (Proposal memory) {
        return _proposals[proposalId];
    }

    /// @notice Whether `voter` has voted on `proposalId`.
    function hasVoted(uint256 proposalId, address voter) external view returns (bool) {
        return _voted[proposalId][voter];
    }

    /// @notice Where a proposal stands: Active until the deadline, then Passed if more than half of all
    /// units at the snapshot voted for it, else Defeated.
    function state(uint256 proposalId) external view returns (State) {
        Proposal storage p = _proposals[proposalId];
        if (p.deadline == 0) revert UnknownProposal(proposalId);
        return _state(p);
    }

    function _state(Proposal storage p) private view returns (State) {
        if (units.clock() <= p.deadline) return State.Active;
        return p.forUnits * 2 > p.totalUnits ? State.Passed : State.Defeated;
    }

    /// @dev Only the admin may repoint the verifier or the request id.
    function _authorizeVerifierChange() internal view override onlyRole(DEFAULT_ADMIN_ROLE) { }
}
