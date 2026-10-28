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
contract InvoiceFinancing is Ownable, Gated {
    using SafeERC20 for IERC20;

    /// @notice Where an invoice is in its life. `None` is an id nobody listed.
    enum Status {
        None,
        Listed,
        Funded,
        Repaid,
        Released
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

    // ---- whoever pays ----

    /// @notice Pay the face value of a funded invoice into the contract. Anyone may pay: the business,
    /// its debtor, a guarantor. No gate, because the chain's own permission check already decides who
    /// can send a transaction, and a credential is a condition on receiving money here, not on paying it.
    function repay(uint256 id) external {
        Invoice storage inv = _invoices[id];
        _requireStatus(id, inv.status, Status.Funded);
        inv.status = Status.Repaid;
        emit Repaid(id, msg.sender, inv.faceValue);
        stablecoin.safeTransferFrom(msg.sender, address(this), inv.faceValue);
    }

    // ---- reads ----

    /// @notice The advance an investor pays for an invoice: face value less the discount, rounded
    /// in the business's favour (the discount is floored).
    function advanceFor(uint256 faceValue, uint16 discountBps) public pure returns (uint256) {
        return faceValue - (faceValue * discountBps) / BPS;
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

    function _requireStatus(uint256 id, Status actual, Status expected) private pure {
        if (actual != expected) revert WrongStatus(id, expected, actual);
    }
}
