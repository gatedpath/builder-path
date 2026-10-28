// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { IERC721Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import { GatedTicket } from "../src/GatedTicket.sol";
import { TicketHarness } from "./mocks/TicketHarness.sol";

/// @notice The ticket in the five credential states for purchase and for resale, then the resale
/// cap, the check-in lock and the refund. `GatedTest`'s `assertRevertsForAllInvalidStates` sends a
/// plain call with no value, and `purchase` and `buy` are payable with an exact price, so the five
/// states are walked by hand here with the same `invalidStates()` list and the same assertion.
contract GatedTicketTest is GatedTest {
    GatedTicket internal ticket;
    uint64 internal constant REQUEST = 18;
    /// @dev Read once here, not inside an expectRevert argument after a prank: a view call there would
    /// spend the prank and the refused call would come from the test contract instead.
    bytes32 internal constant ADMIN_ROLE = 0x00;
    bytes32 internal constant DOOR = keccak256("DOOR_ROLE");
    uint256 internal constant FACE = 1 ether;
    uint256 internal constant SUPPLY = 5;
    uint256 internal constant CAP_BPS = 11_000; // 110% of face value
    address internal organiser = makeAddr("organiser");
    address internal door = makeAddr("door");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    function setUp() public {
        _deployMock();
        ticket = new GatedTicket(
            "Card 7 Ticket",
            "TIX",
            GatedTicket.Roles({ organiser: organiser, door: door }),
            mock,
            REQUEST,
            FACE,
            SUPPLY,
            CAP_BPS
        );
        vm.prank(organiser);
        ticket.setSalesOpen(true);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function _valid(address who) internal {
        mock.setStatus(who, REQUEST, EligibilityStatus.Valid);
    }

    /// @dev Alice buys ticket 0 and lists it at `price`.
    function _aliceLists(uint256 price) internal returns (uint256 tokenId) {
        _valid(alice);
        vm.prank(alice);
        tokenId = ticket.purchase{ value: FACE }();
        vm.prank(alice);
        ticket.list(tokenId, price);
    }

    function _expectNotEligible(address wallet) internal {
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, wallet, REQUEST));
    }

    // ---- construction ----

    function test_construction() public view {
        assertEq(ticket.faceValue(), FACE);
        assertEq(ticket.maxSupply(), SUPPLY);
        assertEq(ticket.resaleCapBps(), CAP_BPS);
        assertEq(ticket.resaleCap(), 1.1 ether);
        assertEq(ticket.requestId(), REQUEST);
        assertEq(address(ticket.verifier()), address(mock));
        assertTrue(ticket.hasRole(ADMIN_ROLE, organiser));
        assertTrue(ticket.hasRole(DOOR, door));
        assertFalse(ticket.hasRole(DOOR, organiser));
    }

    function test_construction_doorFallsBackToOrganiser() public {
        GatedTicket t = new GatedTicket(
            "T",
            "T",
            GatedTicket.Roles({ organiser: organiser, door: address(0) }),
            mock,
            REQUEST,
            FACE,
            SUPPLY,
            CAP_BPS
        );
        assertTrue(t.hasRole(t.DOOR_ROLE(), organiser));
    }

    function test_construction_refusals() public {
        GatedTicket.Roles memory roles = GatedTicket.Roles({ organiser: organiser, door: door });
        vm.expectRevert(GatedTicket.ZeroOrganiser.selector);
        new GatedTicket(
            "T", "T", GatedTicket.Roles({ organiser: address(0), door: door }), mock, REQUEST, FACE, SUPPLY, CAP_BPS
        );
        vm.expectRevert(GatedTicket.ZeroFaceValue.selector);
        new GatedTicket("T", "T", roles, mock, REQUEST, 0, SUPPLY, CAP_BPS);
        vm.expectRevert(GatedTicket.ZeroSupply.selector);
        new GatedTicket("T", "T", roles, mock, REQUEST, FACE, 0, CAP_BPS);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.CapBelowFaceValue.selector, 9_999));
        new GatedTicket("T", "T", roles, mock, REQUEST, FACE, SUPPLY, 9_999);
    }

    // ---- purchase, five states ----

    function test_purchase_revertsInAllInvalidStates_thenValidSucceeds() public {
        EligibilityStatus[4] memory states = invalidStates();
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(alice, REQUEST, states[i]);
            assertFalse(ticket.canPurchase(alice), stateName(states[i]));
            vm.prank(alice);
            _expectNotEligible(alice);
            ticket.purchase{ value: FACE }();
            assertEq(ticket.balanceOf(alice), 0, string.concat("a ticket was minted while ", stateName(states[i])));
        }
        _valid(alice);
        assertTrue(ticket.canPurchase(alice));
        vm.prank(alice);
        vm.expectEmit(address(ticket));
        emit GatedTicket.Purchased(0, alice, FACE);
        uint256 tokenId = ticket.purchase{ value: FACE }();
        assertEq(tokenId, 0);
        assertEq(ticket.ownerOf(0), alice);
        assertEq(ticket.minted(), 1);
        assertEq(address(ticket).balance, FACE, "the proceeds stay in the contract");
    }

    function test_purchase_expiredByWarp() public {
        mock.setValidUntil(alice, REQUEST, uint64(block.timestamp + 1 days));
        vm.prank(alice);
        ticket.purchase{ value: FACE }();
        vm.warp(block.timestamp + 1 days);
        assertEq(uint8(mock.eligibilityStatus(alice, REQUEST)), uint8(EligibilityStatus.Expired));
        vm.prank(alice);
        _expectNotEligible(alice);
        ticket.purchase{ value: FACE }();
    }

    function test_purchase_wrongPrice() public {
        _valid(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.WrongPrice.selector, FACE, FACE - 1));
        ticket.purchase{ value: FACE - 1 }();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.WrongPrice.selector, FACE, FACE + 1));
        ticket.purchase{ value: FACE + 1 }();
    }

    function test_purchase_closedAndSoldOut() public {
        _valid(alice);
        vm.prank(organiser);
        ticket.setSalesOpen(false);
        assertFalse(ticket.canPurchase(alice));
        vm.prank(alice);
        vm.expectRevert(GatedTicket.SalesClosed.selector);
        ticket.purchase{ value: FACE }();

        vm.prank(organiser);
        ticket.setSalesOpen(true);
        for (uint256 i = 0; i < SUPPLY; ++i) {
            vm.prank(alice);
            ticket.purchase{ value: FACE }();
        }
        // No per-wallet limit, on purpose: see the comment in purchase().
        assertEq(ticket.balanceOf(alice), SUPPLY);
        assertFalse(ticket.canPurchase(alice));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.SoldOut.selector, SUPPLY));
        ticket.purchase{ value: FACE }();
    }

    function test_setSalesOpen_onlyOrganiser() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, ADMIN_ROLE)
        );
        ticket.setSalesOpen(false);
    }

    // ---- resale: the buyer in five states ----

    function test_buy_revertsInAllInvalidStates_thenValidSucceeds() public {
        uint256 tokenId = _aliceLists(1 ether);
        EligibilityStatus[4] memory states = invalidStates();
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(bob, REQUEST, states[i]);
            vm.prank(bob);
            _expectNotEligible(bob);
            ticket.buy{ value: 1 ether }(tokenId);
            assertEq(ticket.ownerOf(tokenId), alice, string.concat("the ticket moved while ", stateName(states[i])));
        }
        _valid(bob);
        uint256 aliceBefore = alice.balance;
        vm.prank(bob);
        vm.expectEmit(address(ticket));
        emit GatedTicket.Resold(tokenId, alice, bob, 1 ether);
        ticket.buy{ value: 1 ether }(tokenId);
        assertEq(ticket.ownerOf(tokenId), bob);
        assertEq(alice.balance, aliceBefore + 1 ether, "the seller is paid in the same call");
        (bool listed,) = ticket.listings(tokenId);
        assertFalse(listed, "the listing is cleared");
    }

    /// @dev The seller's credential is not re-checked on resale: a lapsed credential keeps the
    /// holder out of the event, not out of selling the ticket.
    function test_buy_sellerCredentialLapsedStillSells() public {
        uint256 tokenId = _aliceLists(1 ether);
        mock.setStatus(alice, REQUEST, EligibilityStatus.Revoked);
        _valid(bob);
        vm.prank(bob);
        ticket.buy{ value: 1 ether }(tokenId);
        assertEq(ticket.ownerOf(tokenId), bob);
    }

    // ---- resale: the cap ----

    function test_list_atCapAllowed_aboveCapRefused() public {
        _valid(alice);
        vm.prank(alice);
        uint256 tokenId = ticket.purchase{ value: FACE }();
        uint256 cap = ticket.resaleCap();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.AboveResaleCap.selector, cap + 1, cap));
        ticket.list(tokenId, cap + 1);
        vm.prank(alice);
        ticket.list(tokenId, cap);
        (bool listed, uint256 price) = ticket.listings(tokenId);
        assertTrue(listed);
        assertEq(price, cap);
    }

    function test_list_zeroIsAGift() public {
        uint256 tokenId = _aliceLists(0);
        _valid(bob);
        vm.prank(bob);
        ticket.buy{ value: 0 }(tokenId);
        assertEq(ticket.ownerOf(tokenId), bob);
    }

    function test_list_onlyHolder_andDelist() public {
        _valid(alice);
        vm.prank(alice);
        uint256 tokenId = ticket.purchase{ value: FACE }();
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.NotTicketHolder.selector, tokenId, bob));
        ticket.list(tokenId, 1 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.NotListed.selector, tokenId));
        ticket.delist(tokenId);
        vm.prank(alice);
        ticket.list(tokenId, 1 ether);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.NotTicketHolder.selector, tokenId, bob));
        ticket.delist(tokenId);
        vm.prank(alice);
        ticket.delist(tokenId);
        _valid(bob);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.NotListed.selector, tokenId));
        ticket.buy{ value: 1 ether }(tokenId);
    }

    function test_buy_wrongPrice_notListed_ownTicket() public {
        uint256 tokenId = _aliceLists(1 ether);
        _valid(bob);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.WrongPrice.selector, 1 ether, 0.5 ether));
        ticket.buy{ value: 0.5 ether }(tokenId);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.OwnTicket.selector, tokenId));
        ticket.buy{ value: 1 ether }(tokenId);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.NotListed.selector, 7));
        ticket.buy{ value: 1 ether }(7);
    }

    /// @dev The cap lives in `_update`, the hook every movement passes through, not only in `list`.
    /// The harness reaches `_update` with a price in flight and no listing at all; above the cap
    /// it refuses, at the cap it moves.
    function test_capIsEnforcedInsideTheTransfer() public {
        TicketHarness h = new TicketHarness(mock, REQUEST, FACE, SUPPLY, CAP_BPS);
        h.setSalesOpen(true);
        _valid(alice);
        _valid(bob);
        vm.prank(alice);
        uint256 tokenId = h.purchase{ value: FACE }();
        uint256 cap = h.resaleCap();
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.AboveResaleCap.selector, cap + 1, cap));
        h.moveAtPrice(bob, tokenId, cap + 1);
        assertEq(h.ownerOf(tokenId), alice);
        h.moveAtPrice(bob, tokenId, cap);
        assertEq(h.ownerOf(tokenId), bob);
    }

    /// @dev Even with a price under the cap, the recipient has to hold the credential.
    function test_transferInsideResaleStillChecksRecipient() public {
        TicketHarness h = new TicketHarness(mock, REQUEST, FACE, SUPPLY, CAP_BPS);
        h.setSalesOpen(true);
        _valid(alice);
        vm.prank(alice);
        uint256 tokenId = h.purchase{ value: FACE }();
        _expectNotEligible(bob);
        h.moveAtPrice(bob, tokenId, 0);
    }

    /// @dev Plain transfers, approved or not, are refused: the contract cannot see their price.
    function test_plainTransfersRefused() public {
        _valid(alice);
        _valid(bob);
        vm.prank(alice);
        uint256 tokenId = ticket.purchase{ value: FACE }();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.TransferOnlyThroughResale.selector, tokenId));
        ticket.transferFrom(alice, bob, tokenId);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.TransferOnlyThroughResale.selector, tokenId));
        ticket.safeTransferFrom(alice, bob, tokenId);

        vm.prank(alice);
        ticket.approve(carol, tokenId);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.TransferOnlyThroughResale.selector, tokenId));
        ticket.transferFrom(alice, bob, tokenId);
        assertEq(ticket.ownerOf(tokenId), alice);
    }

    function testFuzz_resalePriceAgainstCap(uint256 price) public {
        price = bound(price, 0, 10 * FACE);
        uint256 cap = ticket.resaleCap();
        _valid(alice);
        _valid(bob);
        vm.prank(alice);
        uint256 tokenId = ticket.purchase{ value: FACE }();
        vm.deal(bob, price);
        if (price > cap) {
            vm.prank(alice);
            vm.expectRevert(abi.encodeWithSelector(GatedTicket.AboveResaleCap.selector, price, cap));
            ticket.list(tokenId, price);
            return;
        }
        vm.prank(alice);
        ticket.list(tokenId, price);
        uint256 aliceBefore = alice.balance;
        vm.prank(bob);
        ticket.buy{ value: price }(tokenId);
        assertEq(ticket.ownerOf(tokenId), bob);
        assertEq(alice.balance - aliceBefore, price);
    }

    // ---- check-in ----

    function test_checkIn_locksTheTicket() public {
        uint256 tokenId = _aliceLists(1 ether);
        assertTrue(ticket.isTransferable(tokenId));
        vm.prank(door);
        vm.expectEmit(address(ticket));
        emit GatedTicket.CheckedIn(tokenId, alice, door);
        ticket.checkIn(tokenId);
        assertTrue(ticket.checkedIn(tokenId));
        assertFalse(ticket.isTransferable(tokenId));
        (bool listed,) = ticket.listings(tokenId);
        assertFalse(listed, "check-in clears a standing offer");

        // Nothing moves it now: not a listing, not a buy, not a plain transfer.
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.TicketUsed.selector, tokenId));
        ticket.list(tokenId, 1 ether);
        _valid(bob);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.NotListed.selector, tokenId));
        ticket.buy{ value: 1 ether }(tokenId);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.TicketUsed.selector, tokenId));
        ticket.transferFrom(alice, bob, tokenId);
        assertEq(ticket.ownerOf(tokenId), alice);
    }

    /// @dev A buy that was in flight when the door scanned the ticket: the lock wins inside `_update`.
    function test_checkIn_beatsAResaleInFlight() public {
        TicketHarness h = new TicketHarness(mock, REQUEST, FACE, SUPPLY, CAP_BPS);
        h.setSalesOpen(true);
        _valid(alice);
        _valid(bob);
        vm.prank(alice);
        uint256 tokenId = h.purchase{ value: FACE }();
        h.checkIn(tokenId);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.TicketUsed.selector, tokenId));
        h.moveAtPrice(bob, tokenId, 0);
    }

    function test_checkIn_onlyDoor_once_andMustExist() public {
        _valid(alice);
        vm.prank(alice);
        uint256 tokenId = ticket.purchase{ value: FACE }();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, DOOR));
        ticket.checkIn(tokenId);
        vm.prank(organiser);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, organiser, DOOR)
        );
        ticket.checkIn(tokenId);
        vm.prank(door);
        ticket.checkIn(tokenId);
        vm.prank(door);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.AlreadyCheckedIn.selector, tokenId));
        ticket.checkIn(tokenId);
        vm.prank(door);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 9));
        ticket.checkIn(9);
    }

    // ---- refund ----

    function test_refund_burnsAndPaysFaceValue() public {
        uint256 tokenId = _aliceLists(1 ether);
        uint256 aliceBefore = alice.balance;
        vm.prank(organiser);
        vm.expectEmit(address(ticket));
        emit GatedTicket.Refunded(tokenId, alice, FACE);
        ticket.refund(tokenId);
        assertEq(alice.balance, aliceBefore + FACE);
        assertEq(ticket.balanceOf(alice), 0);
        assertEq(address(ticket).balance, 0);
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, tokenId));
        ticket.ownerOf(tokenId);
        (bool listed,) = ticket.listings(tokenId);
        assertFalse(listed);
    }

    /// @dev A holder whose credential lapsed is still refunded: a burn has no recipient to check.
    function test_refund_holderCredentialLapsed() public {
        _valid(alice);
        vm.prank(alice);
        uint256 tokenId = ticket.purchase{ value: FACE }();
        mock.setStatus(alice, REQUEST, EligibilityStatus.Revoked);
        uint256 before = alice.balance;
        vm.prank(organiser);
        ticket.refund(tokenId);
        assertEq(alice.balance, before + FACE);
    }

    function test_refund_afterCheckIn_andPaysFaceNotResalePrice() public {
        uint256 tokenId = _aliceLists(1.1 ether);
        _valid(bob);
        vm.prank(bob);
        ticket.buy{ value: 1.1 ether }(tokenId);
        vm.prank(door);
        ticket.checkIn(tokenId);
        uint256 before = bob.balance;
        vm.prank(organiser);
        ticket.refund(tokenId);
        assertEq(bob.balance, before + FACE, "face value, not the 1.1 paid at resale");
    }

    function test_refund_onlyOrganiser_andNeedsBalance() public {
        _valid(alice);
        vm.prank(alice);
        uint256 tokenId = ticket.purchase{ value: FACE }();
        vm.prank(door);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, door, ADMIN_ROLE)
        );
        ticket.refund(tokenId);

        vm.prank(organiser);
        ticket.withdraw(organiser, FACE);
        assertEq(address(ticket).balance, 0);
        vm.prank(organiser);
        vm.expectRevert(abi.encodeWithSelector(GatedTicket.PayoutFailed.selector, alice, FACE));
        ticket.refund(tokenId);
        assertEq(ticket.ownerOf(tokenId), alice, "a failed refund burns nothing");

        // A top-up through receive() makes the refund possible again.
        vm.prank(organiser);
        (bool ok,) = address(ticket).call{ value: FACE }("");
        assertTrue(ok);
        vm.prank(organiser);
        ticket.refund(tokenId);
        assertEq(ticket.balanceOf(alice), 0);
    }

    function test_withdraw_onlyOrganiser() public {
        _valid(alice);
        vm.prank(alice);
        ticket.purchase{ value: FACE }();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, ADMIN_ROLE)
        );
        ticket.withdraw(alice, FACE);
        uint256 before = organiser.balance;
        vm.prank(organiser);
        ticket.withdraw(organiser, FACE);
        assertEq(organiser.balance, before + FACE);
    }

    // ---- the verifier is the organiser's to change ----

    function test_setVerifier_onlyOrganiser() public {
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, ADMIN_ROLE)
        );
        ticket.setRequestId(19);
        vm.prank(organiser);
        ticket.setRequestId(19);
        assertEq(ticket.requestId(), 19);
    }
}
