// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { GatedERC20 } from "./GatedERC20.sol";

/// @title TokenisedBond
/// @notice A fixed-coupon bond on the gated ERC-20. One unit of the token (1e18) is one unit of
/// the bond. The gate, the issuer allowance, the compliance role's forced transfer with its
/// justification hash, and the pause all come from `GatedERC20` unchanged; this contract adds the
/// coupons and nothing else.
///
/// Coupons. The coupon is fixed when the bond is deployed: `couponPerUnit` stablecoin base units
/// for each whole unit of the bond, once per `couponPeriod`, `totalCoupons` times, the first due at
/// `firstCouponAt`. The paying agent funds each coupon in one call, no earlier than its due time,
/// and the amount is computed from the supply at that moment, never passed in. Holders then claim.
///
/// Why accounting and not a loop. Paying every holder in a loop has no upper bound on gas, and
/// the project's review page treats an unbounded loop as fatal. Instead each coupon raises one
/// number, the coupons owed per unit so far, and every balance change records a correction so that
/// a unit earns only the coupons funded while its holder held it. Because the coupon is fixed per
/// unit, that number rises by exactly `couponPerUnit` each time: nothing is divided by the supply,
/// so a holder of whole units is owed an exact amount, to the last base unit of the stablecoin.
///
/// Rounding, and why the contract can always pay. A holder of a fraction of a unit is owed a
/// fraction of a coupon, rounded down. Funding is rounded up. Every coupon therefore brings in at
/// least what it creates in claims, and the sum owed can never exceed the sum funded; the
/// difference is dust of under one base unit per coupon, which stays in the contract. A holder who buys after a coupon
/// does not receive it; a holder who sells after a coupon keeps it. `_update` is the one place
/// every movement passes through (transfer, mint, burn, forced transfer), so that is where the
/// correction is made, after `super._update` has run the eligibility check and the pause.
///
/// Claiming is gated. A holder must be eligible at the moment it claims, as it must be to do
/// anything else here. A holder whose credential lapses keeps what it has accrued: the amount
/// waits, and is claimable again once the wallet is eligible again. If the compliance role moves
/// the units away, the coupons funded before the move stay with the wallet that held them then.
///
/// Out of scope, on purpose: redemption of principal at maturity, day-count conventions, and
/// partial periods. The card asks for a fixed coupon on a schedule; this is that and no more.
contract TokenisedBond is GatedERC20 {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using SafeCast for int256;

    /// @notice Funds coupons. Separate from the admin so the account that holds the stablecoin
    /// is not the account that can change roles.
    bytes32 public constant PAYING_AGENT_ROLE = keccak256("PAYING_AGENT_ROLE");

    /// @dev One whole unit of the bond, the scale `couponPerUnit` is quoted against.
    uint256 private constant UNIT = 1e18;

    /// @notice The stablecoin coupons are paid in.
    IERC20 public immutable stablecoin;
    /// @notice Stablecoin base units paid per whole bond unit (1e18) per coupon.
    uint256 public immutable couponPerUnit;
    /// @notice When the first coupon falls due.
    uint64 public immutable firstCouponAt;
    /// @notice Seconds between coupons.
    uint64 public immutable couponPeriod;
    /// @notice How many coupons the bond pays in all.
    uint32 public immutable totalCoupons;

    /// @notice Coupons funded so far.
    uint32 public couponsPaid;
    /// @notice Stablecoin funded for coupons, in total.
    uint256 public totalFunded;
    /// @notice Stablecoin claimed by holders, in total.
    uint256 public totalClaimed;
    /// @notice Stablecoin each wallet has claimed.
    mapping(address => uint256) public claimedBy;

    /// @dev Stablecoin base units owed per whole unit across every coupon funded so far.
    uint256 private _cumulativeCouponPerUnit;
    mapping(address => int256) private _corrections;

    /// @notice A coupon was funded. `number` counts from 1.
    event CouponPaid(uint32 indexed number, uint256 amount, uint256 supply, address indexed payingAgent);
    /// @notice A holder claimed its accrued coupons.
    event CouponClaimed(address indexed holder, uint256 amount);

    error ZeroStablecoin();
    error BadSchedule();
    error CouponNotDue(uint32 number, uint64 dueAt);
    error AllCouponsPaid();
    error NoUnitsOutstanding();
    error NothingToClaim();
    error NoSuchCoupon(uint32 number);

    /// @param stablecoin_ The ERC-20 coupons are paid in.
    /// @param couponPerUnit_ Stablecoin base units per whole bond unit per coupon. Not zero.
    /// @param firstCouponAt_ Due time of the first coupon.
    /// @param couponPeriod_ Seconds between coupons. Not zero.
    /// @param totalCoupons_ Number of coupons. Not zero.
    /// @param payingAgent Who funds coupons; the admin when zero, as the other roles default.
    constructor(
        string memory name_,
        string memory symbol_,
        Roles memory roles,
        IRedbellyVerifier verifier_,
        uint64 requestId_,
        IERC20 stablecoin_,
        uint256 couponPerUnit_,
        uint64 firstCouponAt_,
        uint64 couponPeriod_,
        uint32 totalCoupons_,
        address payingAgent
    ) GatedERC20(name_, symbol_, roles, verifier_, requestId_, 0) {
        // The subscription amount is zero and subscriptions start closed: a bond is issued by its
        // issuer through `mint`, not claimed by whoever turns up.
        if (address(stablecoin_) == address(0)) revert ZeroStablecoin();
        if (couponPerUnit_ == 0 || couponPeriod_ == 0 || totalCoupons_ == 0) revert BadSchedule();
        stablecoin = stablecoin_;
        couponPerUnit = couponPerUnit_;
        firstCouponAt = firstCouponAt_;
        couponPeriod = couponPeriod_;
        totalCoupons = totalCoupons_;
        _grantRole(PAYING_AGENT_ROLE, payingAgent == address(0) ? roles.admin : payingAgent);
    }

    // ---- the schedule ----

    /// @notice When coupon `number` falls due. Coupons count from 1 to `totalCoupons`; any other
    /// number is refused by name, where the subtraction below would otherwise panic on zero.
    function couponDueAt(uint32 number) public view returns (uint64) {
        if (number == 0 || number > totalCoupons) revert NoSuchCoupon(number);
        return firstCouponAt + uint64(number - 1) * couponPeriod;
    }

    /// @notice What the next coupon will cost the paying agent at the current supply. Rounded up:
    /// see the contract's note on rounding.
    function nextCouponAmount() public view returns (uint256) {
        return Math.mulDiv(totalSupply(), couponPerUnit, UNIT, Math.Rounding.Ceil);
    }

    /// @notice Fund the next coupon. The amount is the fixed coupon times the units outstanding
    /// now; the caller approves that much stablecoin first. Refused before the due time, after
    /// the last coupon, while paused, and when no units exist to receive it.
    function payCoupon() external onlyRole(PAYING_AGENT_ROLE) whenNotPaused {
        uint32 number = couponsPaid + 1;
        if (number > totalCoupons) revert AllCouponsPaid();
        uint64 dueAt = couponDueAt(number);
        // A coupon date is days away, not seconds: a validator's few seconds of drift cannot matter.
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp < dueAt) revert CouponNotDue(number, dueAt);
        uint256 supply = totalSupply();
        if (supply == 0) revert NoUnitsOutstanding();

        uint256 amount = nextCouponAmount();
        couponsPaid = number;
        totalFunded += amount;
        _cumulativeCouponPerUnit += couponPerUnit;

        stablecoin.safeTransferFrom(msg.sender, address(this), amount);
        emit CouponPaid(number, amount, supply, msg.sender);
    }

    // ---- holders ----

    /// @notice Coupons `holder` has accrued and not yet claimed.
    function claimable(address holder) public view returns (uint256) {
        return _accrued(holder) - claimedBy[holder];
    }

    /// @notice Claim everything accrued. The caller must be eligible now, like every other action
    /// on this token; an amount that cannot be claimed today is not lost, it waits.
    function claimCoupons() external gated whenNotPaused returns (uint256 amount) {
        amount = claimable(msg.sender);
        if (amount == 0) revert NothingToClaim();
        claimedBy[msg.sender] += amount;
        totalClaimed += amount;
        stablecoin.safeTransfer(msg.sender, amount);
        emit CouponClaimed(msg.sender, amount);
    }

    // ---- accounting ----

    function _accrued(address holder) private view returns (uint256) {
        // Checked casts: a silent wrap here would be money appearing or vanishing. SafeCast reverts.
        int256 scaled = (_cumulativeCouponPerUnit * balanceOf(holder)).toInt256() + _corrections[holder];
        return scaled.toUint256() / UNIT;
    }

    /// @dev Every movement of units passes through here. `super._update` first: it is the
    /// eligibility check and the pause, and it must never be skipped. Then the corrections that
    /// keep each wallet's accrued coupons exactly what they were before its balance changed.
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        int256 shift = (_cumulativeCouponPerUnit * value).toInt256();
        if (from != address(0)) _corrections[from] += shift;
        if (to != address(0)) _corrections[to] -= shift;
    }
}
