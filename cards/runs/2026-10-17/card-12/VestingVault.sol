// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { CapTable } from "./CapTable.sol";

/// @title VestingVault
/// @notice Holds shares on the register in its own name for a beneficiary until they vest, the
/// way an employee share trust does, and hands them over as they do. The board grants a
/// schedule; the vault receives the shares from the register as a nominee; the beneficiary
/// releases what has vested; the board may revoke what has not.
///
/// A schedule is a start time, a cliff and a duration. Nothing vests before the cliff. From the
/// cliff, vesting is linear from the start time, so at the cliff the cliff's share of the total
/// vests at once (one year of a four-year grant is a quarter). Everything has vested at
/// `start + duration`.
///
/// This contract holds no credential and checks none. The register checks the beneficiary
/// against the class's gate at the grant and at every release, so a beneficiary whose
/// credential lapsed has shares waiting in the vault until it is valid again or the board
/// revokes the schedule. Who may grant is the register's board role, read live; there is no
/// second list of directors to keep in step.
contract VestingVault {
    /// @notice One grant.
    /// @param classId The share class.
    /// @param beneficiary Who the shares vest to.
    /// @param total Shares granted; lowered to what had vested when the schedule is revoked.
    /// @param released Shares already moved to the beneficiary.
    /// @param start When vesting is measured from.
    /// @param cliff Seconds after `start` before anything can be released.
    /// @param duration Seconds after `start` by which everything has vested.
    /// @param revoked True once the board has stopped future vesting.
    struct Schedule {
        uint256 classId;
        address beneficiary;
        uint256 total;
        uint256 released;
        uint64 start;
        uint64 cliff;
        uint64 duration;
        bool revoked;
    }

    /// @notice The register this vault holds shares on.
    CapTable public immutable register;

    /// @notice Schedules granted so far; ids run from 1.
    uint256 public scheduleCount;

    mapping(uint256 scheduleId => Schedule) private _schedules;

    event Granted(
        uint256 indexed scheduleId,
        uint256 indexed classId,
        address indexed beneficiary,
        uint256 total,
        uint64 start,
        uint64 cliff,
        uint64 duration,
        address by
    );
    event Released(uint256 indexed scheduleId, address indexed beneficiary, uint256 amount);
    event Revoked(uint256 indexed scheduleId, uint256 cancelled, address indexed by, string reason);

    error ZeroRegister();
    error NotBoard(address caller);
    error BadSchedule();
    error NoSuchSchedule(uint256 scheduleId);
    error NotTheBeneficiary(uint256 scheduleId, address caller);
    error NothingVested(uint256 scheduleId);
    error AlreadyRevoked(uint256 scheduleId);
    error EmptyReason();

    /// @param register_ The register that has granted this vault `NOMINEE_ROLE`.
    constructor(CapTable register_) {
        if (address(register_) == address(0)) revert ZeroRegister();
        register = register_;
    }

    /// @dev The register's board, read live, is the only grantor and revoker.
    modifier onlyBoard() {
        if (!register.hasRole(register.BOARD_ROLE(), msg.sender)) revert NotBoard(msg.sender);
        _;
    }

    // ---- the board ----

    /// @notice Grants `total` shares of `classId` to `beneficiary` on a schedule. The register
    /// issues them to this vault and checks the beneficiary against the class's gate now.
    /// @return scheduleId The new schedule's id.
    function grant(uint256 classId, address beneficiary, uint256 total, uint64 start, uint64 cliff, uint64 duration)
        external
        onlyBoard
        returns (uint256 scheduleId)
    {
        if (total == 0 || duration == 0 || cliff > duration) revert BadSchedule();
        scheduleId = ++scheduleCount;
        _schedules[scheduleId] = Schedule({
            classId: classId,
            beneficiary: beneficiary,
            total: total,
            released: 0,
            start: start,
            cliff: cliff,
            duration: duration,
            revoked: false
        });
        register.issueToNominee(classId, beneficiary, total);
        emit Granted(scheduleId, classId, beneficiary, total, start, cliff, duration, msg.sender);
    }

    /// @notice Stops future vesting. What had vested by now stays releasable; the rest is
    /// cancelled on the register and may be issued again.
    function revoke(uint256 scheduleId, string calldata reason) external onlyBoard {
        if (bytes(reason).length == 0) revert EmptyReason();
        Schedule storage s = _schedule(scheduleId);
        if (s.revoked) revert AlreadyRevoked(scheduleId);
        uint256 vested = _vestedAt(s, block.timestamp);
        uint256 cancelled = s.total - vested;
        s.revoked = true;
        s.total = vested;
        if (cancelled > 0) register.cancelFromNominee(s.classId, cancelled);
        emit Revoked(scheduleId, cancelled, msg.sender, reason);
    }

    // ---- the beneficiary ----

    /// @notice Moves everything vested and not yet released to the beneficiary. The register
    /// checks the beneficiary against the class's gate at this moment.
    function release(uint256 scheduleId) external {
        Schedule storage s = _schedule(scheduleId);
        if (msg.sender != s.beneficiary) revert NotTheBeneficiary(scheduleId, msg.sender);
        uint256 amount = _vestedAt(s, block.timestamp) - s.released;
        if (amount == 0) revert NothingVested(scheduleId);
        s.released += amount;
        register.releaseFromNominee(s.classId, s.beneficiary, amount);
        emit Released(scheduleId, s.beneficiary, amount);
    }

    // ---- reads ----

    /// @notice A schedule's record.
    function schedule(uint256 scheduleId) external view returns (Schedule memory) {
        return _schedule(scheduleId);
    }

    /// @notice Shares of a schedule vested at `timestamp`, released or not.
    function vestedAt(uint256 scheduleId, uint256 timestamp) external view returns (uint256) {
        return _vestedAt(_schedule(scheduleId), timestamp);
    }

    /// @notice Shares vested now and not yet released.
    function releasable(uint256 scheduleId) external view returns (uint256) {
        Schedule storage s = _schedule(scheduleId);
        return _vestedAt(s, block.timestamp) - s.released;
    }

    // ---- internals ----

    /// @dev Zero before the cliff; linear from `start` after it; everything from `start + duration`.
    /// A revoked schedule's `total` is what had vested at revocation and all of it counts as
    /// vested: the line must not be drawn again over the smaller total (the first test run
    /// caught exactly that, at half the right answer).
    function _vestedAt(Schedule storage s, uint256 timestamp) private view returns (uint256) {
        if (s.revoked) return s.total;
        uint256 start = s.start;
        if (timestamp < start + s.cliff) return 0;
        if (timestamp >= start + s.duration) return s.total;
        return s.total * (timestamp - start) / s.duration;
    }

    function _schedule(uint256 scheduleId) private view returns (Schedule storage s) {
        s = _schedules[scheduleId];
        if (scheduleId == 0 || scheduleId > scheduleCount) revert NoSuchSchedule(scheduleId);
    }
}
