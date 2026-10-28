// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";

/// @title CapTable
/// @notice A company's share register on chain: share classes, who holds how many of each, and
/// the board's say over every transfer. Each class names the credential a holder must prove
/// (its own request id on the company's verifier), so the register cannot drift away from who
/// is allowed to hold what.
///
/// Roles. `DEFAULT_ADMIN_ROLE` (a timelock fed by a Safe) creates classes, changes a class's
/// gate, raises the authorised count, repoints the verifier and grants roles. `BOARD_ROLE` (a
/// Safe of the directors) issues shares and approves or rejects transfers. `NOMINEE_ROLE` is for
/// a contract the company appoints to hold shares on a holder's behalf, a vesting vault; it may
/// receive shares without a credential of its own, and may release them to the beneficiary the
/// board named without a second board approval, because the board approved the grant.
///
/// Gating, per class. `issue` checks the recipient against the class's request id. A grant
/// through a nominee checks the beneficiary at the grant and again at every release. A
/// transfer checks the holder when they ask and the recipient when the board approves, so a
/// recipient whose credential lapsed between the request and the board meeting is refused at
/// the meeting. The holder is not re-checked at approval: a transfer out of a wallet whose
/// credential has lapsed is how that wallet leaves the register, and the board decides it.
///
/// Every refusal has a named error, and every entry in the register has an event, so the
/// register can be rebuilt from the log alone. Redbelly's RPC serves no trace methods; the
/// events are the audit trail.
///
/// The kit's `Gated` base holds one request id; a register with one gate per class cannot
/// inherit it. The verifier and the per-class check live here, and the refusal is the base's
/// own `NotEligible(wallet, requestId)` so the kit's five-state test helper proves every class.
contract CapTable is AccessControl {
    /// @notice Issues shares and approves or rejects transfers. A Safe of the directors.
    bytes32 public constant BOARD_ROLE = keccak256("BOARD_ROLE");

    /// @notice A contract appointed to hold shares for a beneficiary (a vesting vault).
    bytes32 public constant NOMINEE_ROLE = keccak256("NOMINEE_ROLE");

    /// @notice Classes a register may carry. Bounds the only loop a caller could grow.
    uint256 public constant MAX_CLASSES = 32;

    /// @notice Who holds what at construction. A zero board means the admin.
    /// @param admin `DEFAULT_ADMIN_ROLE`. Put a timelock here.
    /// @param board `BOARD_ROLE`. Put a Safe here.
    struct Roles {
        address admin;
        address board;
    }

    /// @notice One share class.
    /// @param name The class as the constitution names it ("Ordinary", "Series A Preference").
    /// @param requestId The credential a holder of this class must prove, on the company's verifier.
    /// @param authorised The most shares of this class that may be on issue.
    /// @param issued Shares of this class on issue now, nominees' holdings included.
    struct ShareClass {
        string name;
        uint64 requestId;
        uint256 authorised;
        uint256 issued;
    }

    /// @notice Where a transfer request stands.
    enum TransferStatus {
        None,
        Pending,
        Approved,
        Rejected,
        Cancelled
    }

    /// @notice One transfer, from the holder's request to the board's decision.
    /// @param classId The class the shares belong to; a transfer never crosses classes.
    /// @param from The holder who asked.
    /// @param to The wallet the shares go to.
    /// @param amount How many shares.
    /// @param status Where the request stands.
    /// @param resolution The board's words when it decided (a minute reference), empty until then.
    struct TransferRequest {
        uint256 classId;
        address from;
        address to;
        uint256 amount;
        TransferStatus status;
        string resolution;
    }

    /// @notice The company's verifier; every class gate reads it.
    IRedbellyVerifier public verifier;

    /// @notice Classes created so far; ids run from 1.
    uint256 public classCount;

    /// @notice Transfer requests made so far; ids run from 1.
    uint256 public transferCount;

    mapping(uint256 classId => ShareClass) private _classes;
    mapping(uint256 classId => mapping(address holder => uint256)) private _balances;
    mapping(uint256 transferId => TransferRequest) private _transfers;

    event VerifierChanged(address indexed previousVerifier, address indexed newVerifier);
    event ClassCreated(uint256 indexed classId, string name, uint64 requestId, uint256 authorised);
    event ClassRequestIdChanged(uint256 indexed classId, uint64 previousRequestId, uint64 newRequestId);
    event AuthorisedChanged(uint256 indexed classId, uint256 previousAuthorised, uint256 newAuthorised);
    event Issued(uint256 indexed classId, address indexed to, uint256 amount, address indexed by);
    /// @notice Shares issued to a nominee for `beneficiary`, who passed the class gate at the grant.
    event IssuedToNominee(
        uint256 indexed classId, address indexed nominee, address indexed beneficiary, uint256 amount
    );
    event ReleasedFromNominee(uint256 indexed classId, address indexed nominee, address indexed to, uint256 amount);
    event CancelledFromNominee(uint256 indexed classId, address indexed nominee, uint256 amount);
    event TransferRequested(
        uint256 indexed transferId, uint256 indexed classId, address indexed from, address to, uint256 amount
    );
    event TransferApproved(uint256 indexed transferId, address indexed by, string resolution);
    event TransferRejected(uint256 indexed transferId, address indexed by, string resolution);
    event TransferCancelled(uint256 indexed transferId);

    error ZeroAdmin();
    error ZeroVerifier();
    error ZeroParty();
    error ZeroAmount();
    error EmptyName();
    error EmptyResolution();
    error TooManyClasses(uint256 limit);
    error NoSuchClass(uint256 classId);
    error NoSuchTransfer(uint256 transferId);
    error ExceedsAuthorised(uint256 classId, uint256 issued, uint256 authorised);
    error BelowIssued(uint256 classId, uint256 issued, uint256 wanted);
    error InsufficientShares(uint256 classId, address holder, uint256 balance, uint256 wanted);
    error SelfTransfer();
    error NotTheHolder(uint256 transferId, address caller);
    error WrongStatus(uint256 transferId, TransferStatus expected, TransferStatus actual);

    /// @param roles Who holds which role; see `Roles`.
    /// @param verifier_ The company's verifier behind `IRedbellyVerifier` (an adapter, or the mock off mainnet).
    constructor(Roles memory roles, IRedbellyVerifier verifier_) {
        if (roles.admin == address(0)) revert ZeroAdmin();
        _grantRole(DEFAULT_ADMIN_ROLE, roles.admin);
        _grantRole(BOARD_ROLE, roles.board == address(0) ? roles.admin : roles.board);
        _setVerifier(verifier_);
    }

    // ---- the constitution: admin ----

    /// @notice Creates a class. `requestId` is the credential its holders must prove.
    /// @return classId The new class's id.
    function createClass(string calldata name, uint64 requestId_, uint256 authorised)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (uint256 classId)
    {
        if (bytes(name).length == 0) revert EmptyName();
        if (classCount == MAX_CLASSES) revert TooManyClasses(MAX_CLASSES);
        classId = ++classCount;
        _classes[classId] = ShareClass({ name: name, requestId: requestId_, authorised: authorised, issued: 0 });
        emit ClassCreated(classId, name, requestId_, authorised);
    }

    /// @notice Binds a class to a different credential. Holders already on the register keep
    /// their shares; the new gate applies to the next issue, release or transfer.
    function setClassRequestId(uint256 classId, uint64 requestId_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ShareClass storage c = _class(classId);
        emit ClassRequestIdChanged(classId, c.requestId, requestId_);
        c.requestId = requestId_;
    }

    /// @notice Changes how many shares of a class may be on issue. Never below what is issued.
    function setAuthorised(uint256 classId, uint256 authorised) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ShareClass storage c = _class(classId);
        if (authorised < c.issued) revert BelowIssued(classId, c.issued, authorised);
        emit AuthorisedChanged(classId, c.authorised, authorised);
        c.authorised = authorised;
    }

    /// @notice Points every class gate at a different verifier.
    function setVerifier(IRedbellyVerifier newVerifier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setVerifier(newVerifier);
    }

    // ---- issuing: board ----

    /// @notice Issues shares of a class to a wallet that passes the class's gate.
    function issue(uint256 classId, address to, uint256 amount) external onlyRole(BOARD_ROLE) {
        if (to == address(0)) revert ZeroParty();
        ShareClass storage c = _class(classId);
        _requireEligible(c.requestId, to);
        _issue(c, classId, to, amount);
        emit Issued(classId, to, amount, msg.sender);
    }

    // ---- a nominee holding for a beneficiary (a vesting vault) ----

    /// @notice Issues shares to the calling nominee for `beneficiary`, who must pass the class's
    /// gate now. The nominee decides who may ask it (the vault asks the board) and when the shares
    /// move on; this register checks the beneficiary again at each release.
    function issueToNominee(uint256 classId, address beneficiary, uint256 amount) external onlyRole(NOMINEE_ROLE) {
        if (beneficiary == address(0)) revert ZeroParty();
        ShareClass storage c = _class(classId);
        _requireEligible(c.requestId, beneficiary);
        _issue(c, classId, msg.sender, amount);
        emit IssuedToNominee(classId, msg.sender, beneficiary, amount);
    }

    /// @notice Moves shares the calling nominee holds to `to`, who must pass the class's gate now.
    function releaseFromNominee(uint256 classId, address to, uint256 amount) external onlyRole(NOMINEE_ROLE) {
        if (to == address(0)) revert ZeroParty();
        ShareClass storage c = _class(classId);
        _requireEligible(c.requestId, to);
        _move(classId, msg.sender, to, amount);
        emit ReleasedFromNominee(classId, msg.sender, to, amount);
    }

    /// @notice Cancels shares the calling nominee holds: they leave the issued count and may be
    /// issued again. The way unvested shares return to the company when a schedule is revoked.
    function cancelFromNominee(uint256 classId, uint256 amount) external onlyRole(NOMINEE_ROLE) {
        if (amount == 0) revert ZeroAmount();
        ShareClass storage c = _class(classId);
        uint256 held = _balances[classId][msg.sender];
        if (held < amount) revert InsufficientShares(classId, msg.sender, held, amount);
        _balances[classId][msg.sender] = held - amount;
        c.issued -= amount;
        emit CancelledFromNominee(classId, msg.sender, amount);
    }

    // ---- transfers: the holder asks, the board decides ----

    /// @notice A holder asks to transfer shares. The holder must pass the class's gate to ask;
    /// the recipient is checked when the board approves. Nothing moves here.
    /// @return transferId The request's id, for the board.
    function requestTransfer(uint256 classId, address to, uint256 amount) external returns (uint256 transferId) {
        if (to == address(0)) revert ZeroParty();
        if (to == msg.sender) revert SelfTransfer();
        if (amount == 0) revert ZeroAmount();
        ShareClass storage c = _class(classId);
        _requireEligible(c.requestId, msg.sender);
        uint256 held = _balances[classId][msg.sender];
        if (held < amount) revert InsufficientShares(classId, msg.sender, held, amount);
        transferId = ++transferCount;
        _transfers[transferId] = TransferRequest({
            classId: classId, from: msg.sender, to: to, amount: amount, status: TransferStatus.Pending, resolution: ""
        });
        emit TransferRequested(transferId, classId, msg.sender, to, amount);
    }

    /// @notice The board approves a pending request and the shares move, if the recipient passes
    /// the class's gate at this moment and the holder still has the shares.
    /// @param resolution The board's minute reference. Never empty.
    function approveTransfer(uint256 transferId, string calldata resolution) external onlyRole(BOARD_ROLE) {
        if (bytes(resolution).length == 0) revert EmptyResolution();
        TransferRequest storage t = _pending(transferId);
        _requireEligible(_classes[t.classId].requestId, t.to);
        t.status = TransferStatus.Approved;
        t.resolution = resolution;
        _move(t.classId, t.from, t.to, t.amount);
        emit TransferApproved(transferId, msg.sender, resolution);
    }

    /// @notice The board refuses a pending request, with its reason.
    function rejectTransfer(uint256 transferId, string calldata resolution) external onlyRole(BOARD_ROLE) {
        if (bytes(resolution).length == 0) revert EmptyResolution();
        TransferRequest storage t = _pending(transferId);
        t.status = TransferStatus.Rejected;
        t.resolution = resolution;
        emit TransferRejected(transferId, msg.sender, resolution);
    }

    /// @notice The holder withdraws a request the board has not decided.
    function cancelTransfer(uint256 transferId) external {
        TransferRequest storage t = _pending(transferId);
        if (t.from != msg.sender) revert NotTheHolder(transferId, msg.sender);
        t.status = TransferStatus.Cancelled;
        emit TransferCancelled(transferId);
    }

    // ---- reads for a page ----

    /// @notice A class's record.
    function shareClass(uint256 classId) external view returns (ShareClass memory) {
        return _class(classId);
    }

    /// @notice Shares of `classId` on the register in `holder`'s name.
    function balanceOf(uint256 classId, address holder) external view returns (uint256) {
        return _balances[classId][holder];
    }

    /// @notice A transfer request's record.
    function transferRequest(uint256 transferId) external view returns (TransferRequest memory) {
        TransferRequest memory t = _transfers[transferId];
        if (t.status == TransferStatus.None) revert NoSuchTransfer(transferId);
        return t;
    }

    /// @notice Whether `wallet` passes the gate of `classId` right now.
    function isEligibleFor(uint256 classId, address wallet) external view returns (bool) {
        return verifier.isEligible(wallet, _class(classId).requestId);
    }

    /// @notice Read-only mirror of `approveTransfer`'s conditions. Not a substitute for the gate.
    function canApprove(uint256 transferId) external view returns (bool) {
        TransferRequest memory t = _transfers[transferId];
        return t.status == TransferStatus.Pending && _balances[t.classId][t.from] >= t.amount
            && verifier.isEligible(t.to, _classes[t.classId].requestId);
    }

    /// @notice The first class's request id. The scaffold's local loop (`npm run dev`) reads
    /// `requestId()` from the deployed contract and seeds its five wallets for it; a register has
    /// one id per class, so this answers for class 1 and a page should read `shareClass` instead.
    function requestId() external view returns (uint64) {
        return _class(1).requestId;
    }

    // ---- internals ----

    function _issue(ShareClass storage c, uint256 classId, address to, uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        uint256 after_ = c.issued + amount;
        if (after_ > c.authorised) revert ExceedsAuthorised(classId, after_, c.authorised);
        c.issued = after_;
        _balances[classId][to] += amount;
    }

    function _move(uint256 classId, address from, address to, uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        uint256 held = _balances[classId][from];
        if (held < amount) revert InsufficientShares(classId, from, held, amount);
        _balances[classId][from] = held - amount;
        _balances[classId][to] += amount;
    }

    /// @dev The per-class gate. Reverts with the kit's own error so a refusal reads the same way
    /// as on any `Gated` contract and the kit's test helper can prove it.
    function _requireEligible(uint64 requestId_, address wallet) private view {
        if (!verifier.isEligible(wallet, requestId_)) revert Gated.NotEligible(wallet, requestId_);
    }

    function _class(uint256 classId) private view returns (ShareClass storage c) {
        c = _classes[classId];
        if (classId == 0 || classId > classCount) revert NoSuchClass(classId);
    }

    function _pending(uint256 transferId) private view returns (TransferRequest storage t) {
        t = _transfers[transferId];
        if (t.status == TransferStatus.None) revert NoSuchTransfer(transferId);
        if (t.status != TransferStatus.Pending) revert WrongStatus(transferId, TransferStatus.Pending, t.status);
    }

    function _setVerifier(IRedbellyVerifier newVerifier) private {
        if (address(newVerifier) == address(0)) revert ZeroVerifier();
        emit VerifierChanged(address(verifier), address(newVerifier));
        verifier = newVerifier;
    }
}
