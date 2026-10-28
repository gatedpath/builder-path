// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";

/// @title InvoiceFinancing
/// @notice A verified business lists an invoice, an eligible investor funds it at a discount, and
/// repayment releases the face value to the investor. Two gates on one contract, each with its own
/// verifier and request id:
///
/// - The lister gate (`list`) is the business-delegate recipe: the caller is an authorised delegate
///   or representative of a verified business, read live from the business's own identifier through
///   `businessVerifier` (on a real network a `BusinessDelegateAdapter` over the `BusinessIdentifier`;
///   the recipe binds request id 0 for either role, 1 for representatives only). The lister is a wallet
///   acting for the business, not a person holding a credential of their own.
/// - The investor gate (`fund`, `release`) is the AU wholesale investor recipe, request id 708, through
///   the `Gated` base the scaffold's own token uses.
///
/// Money moves in one ERC-20 stablecoin. `fund` pays the discounted advance straight to the business
/// wallet that listed the invoice; `repay` takes the face value from whoever pays it (the business or
/// its debtor, no gate: paying money in needs no credential); `release` hands it to the recorded investor,
/// who must still pass the investor gate. An investor whose credential lapses between funding and release
/// is frozen until it is restored, the same policy the kit's token applies to a lapsed holder. Decide
/// whether that is the policy you want before anything real sits here.
///
/// Nothing personal is stored: the invoice is a face value, a discount, a due date and the keccak256 of
/// the off-chain document. Who the debtor is stays off chain.
///
/// Version 2 (26 October 2026) adds what a contract can do about payment terms, which is three things and
/// no more: `collect` pulls the face value the business pre-authorised once the due date has passed, so a
/// keeper or the investor presses the button and the business committed when it listed; `declareDefault`
/// lets the investor record a default after the due date plus a grace period, counted against the wallet
/// that listed so the next investor can read a business's history before funding it; `cancel` closes an
/// unfunded listing, by the lister at any time or by anyone once the listing window has passed. A contract
/// cannot make a debtor pay, and nothing here happens by itself when a date passes: someone sends the
/// transaction. A late repayment is still accepted, and it cures a default.
contract InvoiceFinancing is Ownable, Gated {
    using SafeERC20 for IERC20;

    /// @notice Where an invoice is in its life. `None` is an id nobody listed.
    enum Status {
        None,
        Listed,
        Funded,
        Repaid,
        Released,
        Defaulted,
        Cancelled
    }

    /// @notice One invoice.
    /// @param business The delegate wallet that listed it; receives the advance.
    /// @param investor The wallet that funded it; receives the face value after repayment.
    /// @param faceValue What the debtor owes, in the stablecoin's units.
    /// @param discountBps The investor's discount in basis points of face value (1 to 9,999).
    /// @param dueDate When the invoice falls due. Recorded for the investor's judgement; nothing here enforces it.
    /// @param status See `Status`.
    /// @param documentHash keccak256 of the invoice document, kept off chain.
    struct Invoice {
        address business;
        address investor;
        uint256 faceValue;
        uint16 discountBps;
        uint64 dueDate;
        Status status;
        bytes32 documentHash;
    }

    /// @notice One hundred percent, in basis points.
    uint16 public constant BPS = 10_000;

    /// @notice The stablecoin every invoice is priced and settled in.
    IERC20 public immutable stablecoin;

    /// @notice The verifier the lister gate reads; one adapter per business on a real network.
    IRedbellyVerifier public businessVerifier;

    /// @notice The request id the lister gate is bound to (the business-delegate recipe: 0 either role, 1 representatives).
    uint64 public listerRequestId;

    /// @notice How many invoices have been listed; ids run from 1 to this.
    uint256 public invoiceCount;

    /// @notice How long after the due date a funded invoice may stay unpaid before the investor may declare a default.
    uint64 public gracePeriod = 7 days;

    /// @notice How long after its due date an unfunded listing may be cancelled by anyone, not only the lister.
    uint64 public listingWindow = 30 days;

    /// @notice Defaults declared against invoices listed by this wallet, as a count and as the unpaid face value.
    /// A late repayment cures the invoice but the count stays: it is history, which is what the next investor reads.
    mapping(address business => uint256) public defaultsBy;
    mapping(address business => uint256) public unpaidBy;

    mapping(uint256 id => Invoice) private _invoices;

    /// @notice Emitted when a business lists an invoice.
    event Listed(
        uint256 indexed id,
        address indexed business,
        uint256 faceValue,
        uint16 discountBps,
        uint64 dueDate,
        bytes32 documentHash
    );

    /// @notice Emitted when an investor funds an invoice and the advance reaches the business.
    event Funded(uint256 indexed id, address indexed investor, uint256 advance);

    /// @notice Emitted when the face value is paid into the contract.
    event Repaid(uint256 indexed id, address indexed payer, uint256 amount);

    /// @notice Emitted when the face value leaves the contract for the investor.
    event Released(uint256 indexed id, address indexed investor, uint256 amount);

    /// @notice Emitted when the face value is pulled from the business's pre-authorised allowance after the due date.
    event Collected(uint256 indexed id, address indexed caller, uint256 amount);

    /// @notice Emitted when the investor records a default: the due date and the grace period have passed unpaid.
    event Defaulted(uint256 indexed id, address indexed business, uint256 faceValue, address businessVerifier);

    /// @notice Emitted when an unfunded listing is closed.
    event Cancelled(uint256 indexed id, address indexed caller);

    /// @notice Emitted when the owner changes the grace period or the listing window.
    event TermsChanged(uint64 gracePeriod, uint64 listingWindow);

    /// @notice Emitted when the owner repoints the lister gate, including at construction.
    event BusinessVerifierChanged(
        address indexed previousVerifier, address indexed newVerifier, uint64 previousRequestId, uint64 newRequestId
    );

    error ZeroStablecoin();
    error ZeroFaceValue();
    error BadDiscount(uint16 discountBps);
    error DueDateInThePast(uint64 dueDate);
    error WrongStatus(uint256 id, Status expected, Status actual);
    error NotTheInvestor(uint256 id, address caller);
    error NotTheLister(uint256 id, address caller);
    error TooEarly(uint256 id, uint64 notBefore);

    /// @param admin Owns the contract: may repoint either verifier or request id. A Safe on a real network.
    /// @param stablecoin_ The ERC-20 invoices are settled in.
    /// @param investorVerifier_ The verifier behind the investor gate (an adapter over your verifier, or the mock off mainnet).
    /// @param investorRequestId_ The request id of the investor recipe (708, AU wholesale investor).
    /// @param businessVerifier_ The verifier behind the lister gate (a BusinessDelegateAdapter, or the mock off mainnet).
    /// @param listerRequestId_ The request id of the business-delegate recipe (0 either role, 1 representatives only).
    constructor(
        address admin,
        IERC20 stablecoin_,
        IRedbellyVerifier investorVerifier_,
        uint64 investorRequestId_,
        IRedbellyVerifier businessVerifier_,
        uint64 listerRequestId_
    ) Ownable(admin) Gated(investorVerifier_, investorRequestId_) {
        if (address(stablecoin_) == address(0)) revert ZeroStablecoin();
        stablecoin = stablecoin_;
        _setBusinessVerifier(businessVerifier_, listerRequestId_);
    }

    /// @notice Requires `msg.sender` to pass the lister gate.
    modifier listerGated() {
        _requireLister(msg.sender);
        _;
    }

    // ---- the business ----

    /// @notice List an invoice for funding. The caller must be a delegate or representative of the
    /// verified business; the advance will be paid to this wallet.
    /// @param faceValue What the debtor owes. Never zero.
    /// @param discountBps The discount offered to the investor, 1 to 9,999 basis points.
    /// @param dueDate When the invoice falls due; must be in the future.
    /// @param documentHash keccak256 of the invoice document.
    /// @return id The new invoice's id.
    function list(uint256 faceValue, uint16 discountBps, uint64 dueDate, bytes32 documentHash)
        external
        listerGated
        returns (uint256 id)
    {
        if (faceValue == 0) revert ZeroFaceValue();
        if (discountBps == 0 || discountBps >= BPS) revert BadDiscount(discountBps);
        // A due date is a calendar fact, so the block's clock is the right one to compare with.
        // slither-disable-next-line timestamp
        // forge-lint: disable-next-line(block-timestamp)
        if (dueDate <= block.timestamp) revert DueDateInThePast(dueDate);
        id = ++invoiceCount;
        _invoices[id] = Invoice({
            business: msg.sender,
            investor: address(0),
            faceValue: faceValue,
            discountBps: discountBps,
            dueDate: dueDate,
            status: Status.Listed,
            documentHash: documentHash
        });
        emit Listed(id, msg.sender, faceValue, discountBps, dueDate, documentHash);
    }

    // ---- the investor ----

    /// @notice Fund a listed invoice: the caller pays the discounted advance to the business and
    /// becomes the invoice's investor. Approve the advance on the stablecoin first.
    function fund(uint256 id) external gated {
        Invoice storage inv = _invoices[id];
        _requireStatus(id, inv.status, Status.Listed);
        uint256 advance = advanceFor(inv.faceValue, inv.discountBps);
        inv.investor = msg.sender;
        inv.status = Status.Funded;
        emit Funded(id, msg.sender, advance);
        stablecoin.safeTransferFrom(msg.sender, inv.business, advance);
    }

    /// @notice Take the repaid face value. Only the investor who funded the invoice, and only after
    /// repayment; the investor must still pass the investor gate.
    function release(uint256 id) external gated {
        Invoice storage inv = _invoices[id];
        _requireStatus(id, inv.status, Status.Repaid);
        if (msg.sender != inv.investor) revert NotTheInvestor(id, msg.sender);
        inv.status = Status.Released;
        emit Released(id, msg.sender, inv.faceValue);
        stablecoin.safeTransfer(msg.sender, inv.faceValue);
    }

    /// @notice Close an unfunded listing. The lister may at any time; anyone may once the listing window
    /// after the due date has passed, so a stale listing does not sit at `Listed` forever.
    function cancel(uint256 id) external {
        Invoice storage inv = _invoices[id];
        _requireStatus(id, inv.status, Status.Listed);
        if (msg.sender != inv.business) {
            uint64 notBefore = inv.dueDate + listingWindow;
            // slither-disable-next-line timestamp
            // forge-lint: disable-next-line(block-timestamp)
            if (block.timestamp < notBefore) revert TooEarly(id, notBefore);
        }
        inv.status = Status.Cancelled;
        emit Cancelled(id, msg.sender);
    }

    // ---- whoever pays ----

    /// @notice Pay the face value of a funded invoice into the contract. Anyone may pay: the business,
    /// its debtor, a guarantor. No gate, because the chain's own permission check already decides who
    /// can send a transaction, and a credential is a condition on receiving money here, not on paying it.
    /// A payment after a default is accepted too, and cures it: the invoice goes to `Repaid` and the
    /// unpaid amount recorded against the business comes off, while the count of defaults stays.
    function repay(uint256 id) external {
        _settle(id, msg.sender);
    }

    /// @notice Pull the face value from the business's pre-authorised allowance once the due date has
    /// passed. Anyone may call: the investor, a keeper, the business itself. This is the direct debit the
    /// business agreed to when it listed; if the balance or the allowance is not there the call reverts,
    /// and that failure is the evidence of non-payment.
    function collect(uint256 id) external {
        Invoice storage inv = _invoices[id];
        // slither-disable-next-line timestamp
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp <= inv.dueDate) revert TooEarly(id, inv.dueDate);
        emit Collected(id, msg.sender, inv.faceValue);
        _settle(id, inv.business);
    }

    /// @notice Record a default: the invoice was funded, the due date and the grace period have passed,
    /// and nobody has paid. The investor only. The default is counted against the wallet that listed and
    /// the event names the lister gate's verifier, so an investor can read a business's history.
    function declareDefault(uint256 id) external {
        Invoice storage inv = _invoices[id];
        _requireStatus(id, inv.status, Status.Funded);
        if (msg.sender != inv.investor) revert NotTheInvestor(id, msg.sender);
        uint64 notBefore = inv.dueDate + gracePeriod;
        // slither-disable-next-line timestamp
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp <= notBefore) revert TooEarly(id, notBefore);
        inv.status = Status.Defaulted;
        defaultsBy[inv.business] += 1;
        unpaidBy[inv.business] += inv.faceValue;
        emit Defaulted(id, inv.business, inv.faceValue, address(businessVerifier));
    }

    // ---- reads ----

    /// @notice The advance an investor pays for an invoice: face value less the discount, rounded
    /// in the business's favour (the discount is floored).
    function advanceFor(uint256 faceValue, uint16 discountBps) public pure returns (uint256) {
        return faceValue - (faceValue * discountBps) / BPS;
    }

    /// @notice Whether a funded invoice is past its due date and unpaid. Free to read; nothing changes until
    /// someone calls `collect` or `declareDefault`.
    function isOverdue(uint256 id) external view returns (bool) {
        Invoice storage inv = _invoices[id];
        // slither-disable-next-line timestamp
        // forge-lint: disable-next-line(block-timestamp)
        return (inv.status == Status.Funded || inv.status == Status.Defaulted) && block.timestamp > inv.dueDate;
    }

    /// @notice One invoice by id. `status` is `None` for an id nobody listed.
    function invoice(uint256 id) external view returns (Invoice memory) {
        return _invoices[id];
    }

    /// @notice Whether `wallet` would pass the lister gate right now. The read is live on a real
    /// identifier: a removed delegate fails at once.
    function isLister(address wallet) public view returns (bool) {
        return businessVerifier.isEligible(wallet, listerRequestId);
    }

    // ---- admin ----

    /// @notice Set the grace period before a default may be declared and the window after which anyone may
    /// cancel an unfunded listing. Terms, so the owner's, and on a real network a Safe's.
    function setTerms(uint64 newGracePeriod, uint64 newListingWindow) external onlyOwner {
        gracePeriod = newGracePeriod;
        listingWindow = newListingWindow;
        emit TermsChanged(newGracePeriod, newListingWindow);
    }

    /// @notice Repoint the lister gate at another business's adapter or another request id.
    function setBusinessVerifier(IRedbellyVerifier newVerifier, uint64 newRequestId) external onlyOwner {
        _setBusinessVerifier(newVerifier, newRequestId);
    }

    /// @dev Only the owner may repoint the investor gate (`Gated.setVerifier`, `Gated.setRequestId`).
    function _authorizeVerifierChange() internal view override onlyOwner { }

    function _setBusinessVerifier(IRedbellyVerifier newVerifier, uint64 newRequestId) private {
        if (address(newVerifier) == address(0)) revert ZeroVerifier();
        emit BusinessVerifierChanged(address(businessVerifier), address(newVerifier), listerRequestId, newRequestId);
        businessVerifier = newVerifier;
        listerRequestId = newRequestId;
    }

    /// @dev The lister gate reverts with the same `NotEligible` the `Gated` base uses, carrying the
    /// lister request id, so a failure reads the same way on both gates and in the kit's failure table.
    function _requireLister(address wallet) private view {
        if (!isLister(wallet)) revert NotEligible(wallet, listerRequestId);
    }

    /// @dev The one path money comes in on: from `payer`, for a funded or defaulted invoice, to `Repaid`.
    function _settle(uint256 id, address payer) private {
        Invoice storage inv = _invoices[id];
        if (inv.status != Status.Funded && inv.status != Status.Defaulted) {
            revert WrongStatus(id, Status.Funded, inv.status);
        }
        if (inv.status == Status.Defaulted) unpaidBy[inv.business] -= inv.faceValue;
        inv.status = Status.Repaid;
        emit Repaid(id, payer, inv.faceValue);
        stablecoin.safeTransferFrom(payer, address(this), inv.faceValue);
    }

    function _requireStatus(uint256 id, Status actual, Status expected) private pure {
        if (actual != expected) revert WrongStatus(id, expected, actual);
    }
}
