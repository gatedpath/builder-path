// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

/// @title RegisterDistributor
/// @notice Pays a distribution in a stablecoin to every holder of an ERC-3643 register, pro rata to
/// each holder's balance at a snapshot block, from the administrator's own wallet.
///
/// The holder table is rebuilt off chain (scripts/holders.mjs: Transfer events windowed at 100 blocks,
/// then balanceOf at the snapshot block) because no contract can read a past balance. The administrator
/// hands the table in with `open`, approves this contract for the total, and calls `pay` as many times
/// as it takes. Every stablecoin transfer is `transferFrom(payer, holder, amount)`: this contract never
/// holds funds and never calls the register. The register's address and the snapshot block are recorded
/// and emitted so a receipt can be checked against the chain, and nothing else is done with them, so no
/// register gate is ever crossed by a contract of ours.
///
/// Rounding: each holder gets floor(total * balance / totalBalance). What the floors leave over (the dust)
/// never leaves the payer's wallet and is reported in `Completed`. A payment that reverts or returns
/// false is recorded as Failed and the batch carries on; the payer can `retry` it later.
contract RegisterDistributor is ReentrancyGuardTransient {
    enum Status {
        Pending,
        Paid,
        Skipped,
        Failed
    }

    struct Distribution {
        address payer;
        address stablecoin;
        address register;
        uint256 snapshotBlock;
        uint256 total;
        uint256 totalBalance;
        uint256 holderCount;
        uint256 cursor;
        uint256 due;
        uint256 paid;
        uint256 paidCount;
        uint256 failedCount;
        bool closed;
    }

    uint256 public constant MAX_HOLDERS = 2000;

    uint256 public distributionCount;
    mapping(uint256 => Distribution) private _distributions;
    mapping(uint256 => address[]) private _holders;
    mapping(uint256 => uint256[]) private _balances;
    mapping(uint256 => mapping(address => Status)) private _status;
    mapping(uint256 => mapping(address => bool)) private _listed;

    event Opened(
        uint256 indexed id,
        address indexed payer,
        address indexed stablecoin,
        address register,
        uint256 snapshotBlock,
        uint256 total,
        uint256 holderCount,
        uint256 totalBalance
    );
    event Paid(uint256 indexed id, address indexed holder, uint256 amount, uint256 snapshotBalance);
    event Skipped(uint256 indexed id, address indexed holder);
    event PaymentFailed(uint256 indexed id, address indexed holder, uint256 amount, bytes reason);
    event Completed(uint256 indexed id, uint256 paid, uint256 paidCount, uint256 failedCount, uint256 dust);
    event Closed(uint256 indexed id);

    error LengthMismatch(uint256 holders, uint256 balances);
    error NoHolders();
    error TooManyHolders(uint256 count, uint256 max);
    error ZeroTotal();
    error ZeroTotalBalance();
    error NotAContract(address what);
    error SnapshotInFuture(uint256 snapshotBlock, uint256 current);
    error DuplicateHolder(address holder);
    error ZeroHolder();
    error NotPayer(address caller, address payer);
    error NothingLeftToPay(uint256 id);
    error NotFinished(uint256 id, uint256 cursor, uint256 holderCount);
    error AlreadyClosed(uint256 id);
    error NotFailed(uint256 id, address holder);
    error UnknownDistribution(uint256 id);

    modifier onlyPayer(uint256 id) {
        address payer = _distributions[id].payer;
        if (payer == address(0)) revert UnknownDistribution(id);
        if (msg.sender != payer) revert NotPayer(msg.sender, payer);
        _;
    }

    /// @notice Records a distribution: the table, the coin, the register it pays and the block the table was
    /// read at. Nothing is transferred here. Approve this contract for `total` before `pay`.
    function open(
        address stablecoin,
        address register,
        uint256 snapshotBlock,
        uint256 total,
        address[] calldata holders,
        uint256[] calldata balances
    ) external returns (uint256 id) {
        if (holders.length != balances.length) revert LengthMismatch(holders.length, balances.length);
        if (holders.length == 0) revert NoHolders();
        if (holders.length > MAX_HOLDERS) revert TooManyHolders(holders.length, MAX_HOLDERS);
        if (total == 0) revert ZeroTotal();
        if (stablecoin.code.length == 0) revert NotAContract(stablecoin);
        if (register.code.length == 0) revert NotAContract(register);
        if (snapshotBlock > block.number) revert SnapshotInFuture(snapshotBlock, block.number);

        id = ++distributionCount;
        uint256 totalBalance = 0;
        for (uint256 i = 0; i < holders.length; i++) {
            address holder = holders[i];
            if (holder == address(0)) revert ZeroHolder();
            if (_listed[id][holder]) revert DuplicateHolder(holder);
            _listed[id][holder] = true;
            totalBalance += balances[i];
        }
        if (totalBalance == 0) revert ZeroTotalBalance();

        Distribution storage d = _distributions[id];
        d.payer = msg.sender;
        d.stablecoin = stablecoin;
        d.register = register;
        d.snapshotBlock = snapshotBlock;
        d.total = total;
        d.totalBalance = totalBalance;
        d.holderCount = holders.length;
        _holders[id] = holders;
        _balances[id] = balances;

        emit Opened(id, msg.sender, stablecoin, register, snapshotBlock, total, holders.length, totalBalance);
    }

    /// @notice Pays the next `maxCount` holders in table order, from the payer's wallet. Call until the
    /// cursor reaches the holder count; `Completed` says when. A failed transfer does not stop the batch.
    function pay(uint256 id, uint256 maxCount) external nonReentrant onlyPayer(id) {
        Distribution storage d = _distributions[id];
        if (d.closed) revert AlreadyClosed(id);
        uint256 end = d.cursor + maxCount;
        if (end > d.holderCount) end = d.holderCount;
        if (d.cursor >= end) revert NothingLeftToPay(id);

        for (uint256 i = d.cursor; i < end; i++) {
            address holder = _holders[id][i];
            uint256 balance = _balances[id][i];
            if (balance == 0) {
                _status[id][holder] = Status.Skipped;
                emit Skipped(id, holder);
                continue;
            }
            uint256 amount = (d.total * balance) / d.totalBalance;
            d.due += amount;
            _attempt(d, id, holder, amount, balance);
        }
        d.cursor = end;

        if (end == d.holderCount) {
            emit Completed(id, d.paid, d.paidCount, d.failedCount, d.total - d.due);
        }
    }

    /// @notice Tries a Failed payment again, for instance after the holder came off a stablecoin's deny list.
    function retry(uint256 id, address holder) external nonReentrant onlyPayer(id) {
        Distribution storage d = _distributions[id];
        if (d.closed) revert AlreadyClosed(id);
        if (_status[id][holder] != Status.Failed) revert NotFailed(id, holder);
        uint256 balance = _balanceOf(id, holder);
        uint256 amount = (d.total * balance) / d.totalBalance;
        d.failedCount -= 1;
        _attempt(d, id, holder, amount, balance);
    }

    /// @notice Ends the distribution once every holder has been reached. No payment or retry after this.
    function close(uint256 id) external onlyPayer(id) {
        Distribution storage d = _distributions[id];
        if (d.closed) revert AlreadyClosed(id);
        if (d.cursor != d.holderCount) revert NotFinished(id, d.cursor, d.holderCount);
        d.closed = true;
        emit Closed(id);
    }

    function distribution(uint256 id) external view returns (Distribution memory) {
        return _distributions[id];
    }

    function holderAt(uint256 id, uint256 index)
        external
        view
        returns (address holder, uint256 snapshotBalance, uint256 amount, Status status)
    {
        Distribution storage d = _distributions[id];
        holder = _holders[id][index];
        snapshotBalance = _balances[id][index];
        amount = d.totalBalance == 0 ? 0 : (d.total * snapshotBalance) / d.totalBalance;
        status = _status[id][holder];
    }

    function statusOf(uint256 id, address holder) external view returns (Status) {
        return _status[id][holder];
    }

    /// @dev One stablecoin transfer, payer to holder. A revert or a false return is a Failed payment, not a
    /// reverted batch; the reason is kept in the log so the receipt can say why.
    function _attempt(Distribution storage d, uint256 id, address holder, uint256 amount, uint256 balance) private {
        bool ok = false;
        bytes memory reason = "";
        try IERC20(d.stablecoin).transferFrom(d.payer, holder, amount) returns (bool result) {
            ok = result;
            if (!ok) reason = "transferFrom returned false";
        } catch (bytes memory err) {
            reason = err;
        }
        if (ok) {
            _status[id][holder] = Status.Paid;
            d.paid += amount;
            d.paidCount += 1;
            emit Paid(id, holder, amount, balance);
        } else {
            _status[id][holder] = Status.Failed;
            d.failedCount += 1;
            emit PaymentFailed(id, holder, amount, reason);
        }
    }

    function _balanceOf(uint256 id, address holder) private view returns (uint256) {
        address[] storage holders = _holders[id];
        for (uint256 i = 0; i < holders.length; i++) {
            if (holders[i] == holder) return _balances[id][i];
        }
        return 0;
    }
}
