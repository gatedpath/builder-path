// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";

/// @title GatedTicket
/// @notice An event ticket as an ERC-721 where buying needs the over-18 credential, every resale
/// is capped at a set percentage of face value, a ticket that has been checked in at the door
/// can no longer change hands, and the organiser can refund.
///
/// Gating. `purchase` and `buy` carry `gated` so the rule is visible in the ABI, and `_update`
/// runs `_requireEligible` on the recipient of every mint and every transfer, so a ticket can
/// never land in a wallet that does not hold the credential, whatever path moved it. The seller
/// is not re-checked: a credential that lapsed after purchase stops the holder entering the
/// event (the door checks the wallet, not this contract) and does not stop them selling.
///
/// The resale cap is enforced inside the transfer itself. Every movement of a ticket passes
/// through `_update`. A movement from one holder to another is allowed only while `buy` is
/// running, because `buy` is the one place the contract can see the price: the RBNT passes
/// through it. A plain `transferFrom` or `safeTransferFrom`, with or without an approval, is
/// refused with `TransferOnlyThroughResale`. The alternative, letting plain transfers through at
/// a price of zero, would make the cap a suggestion: the money would simply change hands off
/// chain. So this ticket does not trade on a general marketplace, and says so.
///
/// Money. Purchase proceeds stay in the contract until the organiser withdraws them, so refunds
/// have something to draw on. `receive` accepts top-ups after a withdrawal.
contract GatedTicket is ERC721Enumerable, AccessControl, ReentrancyGuardTransient, Gated {
    /// @notice May check tickets in at the door. The organiser (admin) holds it too by default.
    bytes32 public constant DOOR_ROLE = keccak256("DOOR_ROLE");

    /// @notice Basis points in one whole: a `resaleCapBps` of 11_000 means 110% of face value.
    uint256 public constant BPS = 10_000;

    /// @notice Who holds what at construction. A zero `door` means the organiser.
    /// @param organiser `DEFAULT_ADMIN_ROLE`: refunds, withdrawals, opening sales, the verifier. A Safe.
    /// @param door `DOOR_ROLE`: check-in. The scanner's wallet, which should not hold the money.
    struct Roles {
        address organiser;
        address door;
    }

    /// @notice A resale offer: the holder's asking price, visible to the contract.
    /// @param listed False when the ticket is not for sale; a listed ticket may ask zero (a gift).
    /// @param price Asking price in wei of RBNT.
    struct Listing {
        bool listed;
        uint256 price;
    }

    /// @notice Price of one ticket at the organiser's sale, in wei of RBNT.
    uint256 public immutable faceValue;

    /// @notice How many tickets exist at most.
    uint256 public immutable maxSupply;

    /// @notice The resale ceiling as basis points of `faceValue`; fixed at construction so a buyer
    /// can trust it.
    uint256 public immutable resaleCapBps;

    /// @notice Whether `purchase` is open.
    bool public salesOpen;

    /// @notice Tickets minted so far; also the next token id.
    uint256 public minted;

    /// @notice Tickets that have been through the door. Set once, never cleared.
    mapping(uint256 tokenId => bool) public checkedIn;

    /// @notice Resale offers by ticket.
    mapping(uint256 tokenId => Listing) public listings;

    /// @dev True only while `buy` moves a ticket; `_update` refuses holder-to-holder moves otherwise.
    bool internal transient _resaleInFlight;
    /// @dev The price `buy` is moving the ticket at, for `_update` to check against the cap.
    uint256 internal transient _priceInFlight;

    event SalesOpenChanged(bool open);
    event Purchased(uint256 indexed tokenId, address indexed buyer, uint256 price);
    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Delisted(uint256 indexed tokenId);
    event Resold(uint256 indexed tokenId, address indexed from, address indexed to, uint256 price);
    event CheckedIn(uint256 indexed tokenId, address indexed holder, address door);
    event Refunded(uint256 indexed tokenId, address indexed holder, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    error ZeroOrganiser();
    error ZeroFaceValue();
    error ZeroSupply();
    error CapBelowFaceValue(uint256 resaleCapBps);
    error SalesClosed();
    error SoldOut(uint256 maxSupply);
    error WrongPrice(uint256 expected, uint256 sent);
    error NotTicketHolder(uint256 tokenId, address caller);
    error NotListed(uint256 tokenId);
    error OwnTicket(uint256 tokenId);
    error AboveResaleCap(uint256 price, uint256 cap);
    error TicketUsed(uint256 tokenId);
    error AlreadyCheckedIn(uint256 tokenId);
    error TransferOnlyThroughResale(uint256 tokenId);
    error PayoutFailed(address to, uint256 amount);

    /// @param name_ ERC-721 name.
    /// @param symbol_ ERC-721 symbol.
    /// @param roles Who holds which role; see `Roles`.
    /// @param verifier_ The dApp's verifier behind `IRedbellyVerifier` (an adapter, or the mock off mainnet).
    /// @param requestId_ The eligibility request the gate is bound to: 18 for the over-18 recipe.
    /// @param faceValue_ Price of one ticket at the sale, in wei of RBNT. Not zero.
    /// @param maxSupply_ How many tickets exist at most. Not zero.
    /// @param resaleCapBps_ The resale ceiling in basis points of face value; at least 10_000 (face value itself).
    constructor(
        string memory name_,
        string memory symbol_,
        Roles memory roles,
        IRedbellyVerifier verifier_,
        uint64 requestId_,
        uint256 faceValue_,
        uint256 maxSupply_,
        uint256 resaleCapBps_
    ) ERC721(name_, symbol_) Gated(verifier_, requestId_) {
        if (roles.organiser == address(0)) revert ZeroOrganiser();
        if (faceValue_ == 0) revert ZeroFaceValue();
        if (maxSupply_ == 0) revert ZeroSupply();
        if (resaleCapBps_ < BPS) revert CapBelowFaceValue(resaleCapBps_);
        _grantRole(DEFAULT_ADMIN_ROLE, roles.organiser);
        _grantRole(DOOR_ROLE, roles.door == address(0) ? roles.organiser : roles.door);
        faceValue = faceValue_;
        maxSupply = maxSupply_;
        resaleCapBps = resaleCapBps_;
    }

    /// @notice Top-ups from the organiser so refunds can be paid after a withdrawal.
    receive() external payable { }

    // ---- buying ----

    /// @notice Buy one ticket at face value. The caller must hold the over-18 credential.
    /// @return tokenId The ticket minted to the caller.
    function purchase() external payable gated returns (uint256 tokenId) {
        if (!salesOpen) revert SalesClosed();
        if (minted >= maxSupply) revert SoldOut(maxSupply);
        if (msg.value != faceValue) revert WrongPrice(faceValue, msg.value);
        // There is no limit on how many tickets one wallet may buy, on purpose. The access check
        // proves that this wallet holds a valid over-18 credential; it does not prove that two
        // wallets belong to two different people, and nothing on this chain can. A limit written
        // here would stop a buyer at N tickets per wallet and nothing more, and would read as a
        // promise the identity layer cannot keep. Where the ticket per person matters, that is a
        // rule for the issuer and the door, not for this contract.
        tokenId = minted;
        minted = tokenId + 1;
        _mint(msg.sender, tokenId);
        emit Purchased(tokenId, msg.sender, msg.value);
    }

    // ---- resale ----

    /// @notice Offer a ticket you hold for resale at `price`. Zero is allowed (a gift). The cap is
    /// checked here so a seller learns at once; the check that counts is the one in `_update`.
    function list(uint256 tokenId, uint256 price) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTicketHolder(tokenId, msg.sender);
        if (checkedIn[tokenId]) revert TicketUsed(tokenId);
        uint256 cap = resaleCap();
        if (price > cap) revert AboveResaleCap(price, cap);
        listings[tokenId] = Listing({ listed: true, price: price });
        emit Listed(tokenId, msg.sender, price);
    }

    /// @notice Withdraw a resale offer.
    function delist(uint256 tokenId) external {
        if (ownerOf(tokenId) != msg.sender) revert NotTicketHolder(tokenId, msg.sender);
        if (!listings[tokenId].listed) revert NotListed(tokenId);
        delete listings[tokenId];
        emit Delisted(tokenId);
    }

    /// @notice Buy a listed ticket at its asking price. The caller must hold the over-18
    /// credential; the price must be exactly the asking price; the seller is paid in the same call.
    function buy(uint256 tokenId) external payable gated nonReentrant {
        Listing memory offer = listings[tokenId];
        if (!offer.listed) revert NotListed(tokenId);
        if (msg.value != offer.price) revert WrongPrice(offer.price, msg.value);
        address seller = ownerOf(tokenId);
        if (seller == msg.sender) revert OwnTicket(tokenId);

        delete listings[tokenId];
        // The only path on which `_update` lets a ticket pass from one holder to another, and the
        // price it checks against the cap is the money that just arrived.
        _resaleInFlight = true;
        _priceInFlight = msg.value;
        _update(msg.sender, tokenId, address(0));
        _resaleInFlight = false;
        _priceInFlight = 0;

        emit Resold(tokenId, seller, msg.sender, msg.value);
        _pay(seller, msg.value);
    }

    // ---- the door ----

    /// @notice Mark a ticket as used. From then on it cannot be listed, bought or moved.
    function checkIn(uint256 tokenId) external onlyRole(DOOR_ROLE) {
        address holder = ownerOf(tokenId);
        if (checkedIn[tokenId]) revert AlreadyCheckedIn(tokenId);
        checkedIn[tokenId] = true;
        delete listings[tokenId];
        emit CheckedIn(tokenId, holder, msg.sender);
    }

    // ---- the organiser ----

    /// @notice Burn a ticket and pay its holder the face value from the contract's balance. Works
    /// on a checked-in ticket too (a cancelled event), and on a holder whose credential has lapsed:
    /// a burn has no recipient to check. Pays face value, not what the holder paid at resale.
    function refund(uint256 tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        address holder = ownerOf(tokenId);
        delete listings[tokenId];
        _burn(tokenId);
        emit Refunded(tokenId, holder, faceValue);
        _pay(holder, faceValue);
    }

    /// @notice Open or close the sale.
    function setSalesOpen(bool open) external onlyRole(DEFAULT_ADMIN_ROLE) {
        salesOpen = open;
        emit SalesOpenChanged(open);
    }

    /// @notice Move proceeds out. What is left is what refunds can draw on.
    function withdraw(address to, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        emit Withdrawn(to, amount);
        _pay(to, amount);
    }

    // ---- reads for a UI ----

    /// @notice The highest price a ticket may be resold for, in wei of RBNT.
    function resaleCap() public view returns (uint256) {
        return faceValue * resaleCapBps / BPS;
    }

    /// @notice Read-only mirror of `purchase`'s conditions. Not a substitute for the gate.
    function canPurchase(address wallet) external view returns (bool) {
        return salesOpen && minted < maxSupply && isEligible(wallet);
    }

    /// @notice Whether `tokenId` may still change hands: it exists and has not been through the door.
    function isTransferable(uint256 tokenId) external view returns (bool) {
        return _ownerOf(tokenId) != address(0) && !checkedIn[tokenId];
    }

    // ---- the rules on every movement ----

    /// @dev Every mint, transfer and burn passes through here. The recipient of a mint or a
    /// transfer must hold the credential. A holder-to-holder move must be a resale in flight and
    /// at or under the cap, and the ticket must not have been checked in. A burn checks nothing:
    /// the refund path must work for a holder whose credential has lapsed.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (to != address(0)) _requireEligible(to);
        if (from != address(0) && to != address(0)) {
            if (checkedIn[tokenId]) revert TicketUsed(tokenId);
            if (!_resaleInFlight) revert TransferOnlyThroughResale(tokenId);
            uint256 cap = resaleCap();
            if (_priceInFlight > cap) revert AboveResaleCap(_priceInFlight, cap);
        }
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value) internal override {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /// @dev Only the organiser may repoint the verifier or the request id.
    function _authorizeVerifierChange() internal view override onlyRole(DEFAULT_ADMIN_ROLE) { }

    /// @dev Native payout; a failure reverts the whole call, so a seller or holder that cannot
    /// receive RBNT blocks only their own sale or refund.
    function _pay(address to, uint256 amount) private {
        // slither-disable-next-line low-level-calls,arbitrary-send-eth
        (bool ok,) = payable(to).call{ value: amount }("");
        if (!ok) revert PayoutFailed(to, amount);
    }
}
