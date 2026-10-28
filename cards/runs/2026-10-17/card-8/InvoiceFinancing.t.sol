// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus, IRedbellyVerifier } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { InvoiceFinancing } from "../src/InvoiceFinancing.sol";
import { MockStablecoin } from "../src/mocks/MockStablecoin.sol";

/// @notice Both gates in all five credential states, the discount arithmetic, and the whole life of
/// an invoice. One `ReceptorMock` answers both gates here, by request id (708 for investors, 0 for
/// the business delegate), which is what `npm run dev` does on a fork too; `test_list_readsTheBusinessVerifierNotTheInvestorOne`
/// uses a second mock to prove the lister gate reads its own verifier.
contract InvoiceFinancingTest is GatedTest {
    uint64 internal constant INVESTOR_REQUEST = 708; // recipes/au-wholesale-investor
    uint64 internal constant LISTER_REQUEST = 0; // recipes/business-delegate: either role

    uint256 internal constant FACE = 10_000e6; // 10,000.000000 mUSD
    uint16 internal constant DISCOUNT = 300; // 3 percent
    uint256 internal constant ADVANCE = 9_700e6;
    bytes32 internal constant DOC = keccak256("invoice INV-2026-0417.pdf");

    InvoiceFinancing internal fin;
    MockStablecoin internal usd;

    address internal admin = makeAddr("admin");
    address internal delegate = makeAddr("delegate"); // acts for the business
    address internal investor = makeAddr("investor");
    address internal stranger = makeAddr("stranger");
    address internal debtor = makeAddr("debtor");

    function setUp() public {
        _deployMock();
        usd = new MockStablecoin();
        fin = new InvoiceFinancing(admin, IERC20(address(usd)), mock, INVESTOR_REQUEST, mock, LISTER_REQUEST);
        vm.label(address(fin), "InvoiceFinancing");
        vm.label(address(usd), "mUSD");
    }

    // ---- helpers ----

    function _dueIn30Days() internal view returns (uint64) {
        return uint64(block.timestamp + 30 days);
    }

    function _listCall() internal view returns (bytes memory) {
        return abi.encodeCall(fin.list, (FACE, DISCOUNT, _dueIn30Days(), DOC));
    }

    function _asDelegate() internal {
        mock.setStatus(delegate, LISTER_REQUEST, EligibilityStatus.Valid);
    }

    function _asInvestor(address who) internal {
        mock.setStatus(who, INVESTOR_REQUEST, EligibilityStatus.Valid);
    }

    function _listed() internal returns (uint256 id) {
        _asDelegate();
        vm.prank(delegate);
        id = fin.list(FACE, DISCOUNT, _dueIn30Days(), DOC);
    }

    function _funded() internal returns (uint256 id) {
        id = _listed();
        _asInvestor(investor);
        usd.mint(investor, ADVANCE);
        vm.startPrank(investor);
        usd.approve(address(fin), ADVANCE);
        fin.fund(id);
        vm.stopPrank();
    }

    function _repaid() internal returns (uint256 id) {
        id = _funded();
        usd.mint(debtor, FACE);
        vm.startPrank(debtor);
        usd.approve(address(fin), FACE);
        fin.repay(id);
        vm.stopPrank();
    }

    // ---- construction ----

    function test_construction_bindsBothGates() public view {
        assertEq(fin.requestId(), INVESTOR_REQUEST, "investor gate request id");
        assertEq(address(fin.verifier()), address(mock), "investor verifier");
        assertEq(fin.listerRequestId(), LISTER_REQUEST, "lister gate request id");
        assertEq(address(fin.businessVerifier()), address(mock), "business verifier");
        assertEq(address(fin.stablecoin()), address(usd));
        assertEq(fin.owner(), admin);
        assertEq(fin.invoiceCount(), 0);
    }

    function test_construction_refusesZeroStablecoinAndZeroBusinessVerifier() public {
        vm.expectRevert(InvoiceFinancing.ZeroStablecoin.selector);
        new InvoiceFinancing(admin, IERC20(address(0)), mock, INVESTOR_REQUEST, mock, LISTER_REQUEST);
        vm.expectRevert(Gated.ZeroVerifier.selector);
        new InvoiceFinancing(
            admin, IERC20(address(usd)), mock, INVESTOR_REQUEST, IRedbellyVerifier(address(0)), LISTER_REQUEST
        );
    }

    // ---- the lister gate, five states ----

    function test_list_revertsInAllInvalidStates() public {
        assertRevertsForAllInvalidStates(address(fin), _listCall(), delegate, LISTER_REQUEST);
        assertEq(fin.invoiceCount(), 1, "only the Valid call should have listed");
    }

    function test_list_anInvestorCredentialDoesNotOpenTheListerGate() public {
        _asInvestor(investor);
        vm.prank(investor);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, investor, LISTER_REQUEST));
        fin.list(FACE, DISCOUNT, _dueIn30Days(), DOC);
    }

    function test_list_readsTheBusinessVerifierNotTheInvestorOne() public {
        ReceptorMock businessMock = new ReceptorMock();
        InvoiceFinancing two =
            new InvoiceFinancing(admin, IERC20(address(usd)), mock, INVESTOR_REQUEST, businessMock, LISTER_REQUEST);

        // Valid on the investor verifier at request 0 means nothing to the lister gate.
        mock.setStatus(delegate, LISTER_REQUEST, EligibilityStatus.Valid);
        assertFalse(two.isLister(delegate));
        vm.prank(delegate);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, delegate, LISTER_REQUEST));
        two.list(FACE, DISCOUNT, _dueIn30Days(), DOC);

        // Valid on the business verifier is what opens it.
        businessMock.setStatus(delegate, LISTER_REQUEST, EligibilityStatus.Valid);
        assertTrue(two.isLister(delegate));
        vm.prank(delegate);
        assertEq(two.list(FACE, DISCOUNT, _dueIn30Days(), DOC), 1);
    }

    function test_list_checksItsArguments() public {
        _asDelegate();
        uint64 due = _dueIn30Days();
        vm.startPrank(delegate);
        vm.expectRevert(InvoiceFinancing.ZeroFaceValue.selector);
        fin.list(0, DISCOUNT, due, DOC);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFinancing.BadDiscount.selector, uint16(0)));
        fin.list(FACE, 0, due, DOC);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFinancing.BadDiscount.selector, uint16(10_000)));
        fin.list(FACE, 10_000, due, DOC);
        uint64 past = uint64(block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFinancing.DueDateInThePast.selector, past));
        fin.list(FACE, DISCOUNT, past, DOC);
        vm.stopPrank();
        assertEq(fin.invoiceCount(), 0);
    }

    function test_list_recordsTheInvoiceAndEmits() public {
        _asDelegate();
        uint64 due = _dueIn30Days();
        vm.expectEmit(address(fin));
        emit InvoiceFinancing.Listed(1, delegate, FACE, DISCOUNT, due, DOC);
        vm.prank(delegate);
        uint256 id = fin.list(FACE, DISCOUNT, due, DOC);
        assertEq(id, 1);
        InvoiceFinancing.Invoice memory inv = fin.invoice(id);
        assertEq(inv.business, delegate);
        assertEq(inv.investor, address(0));
        assertEq(inv.faceValue, FACE);
        assertEq(inv.discountBps, DISCOUNT);
        assertEq(inv.dueDate, due);
        assertEq(uint8(inv.status), uint8(InvoiceFinancing.Status.Listed));
        assertEq(inv.documentHash, DOC);
        assertEq(uint8(fin.invoice(2).status), uint8(InvoiceFinancing.Status.None), "an unlisted id reads None");
    }

    // ---- the investor gate on fund, five states ----

    function test_fund_revertsInAllInvalidStates() public {
        uint256 id = _listed();
        usd.mint(investor, ADVANCE);
        vm.prank(investor);
        usd.approve(address(fin), ADVANCE);
        assertRevertsForAllInvalidStates(address(fin), abi.encodeCall(fin.fund, (id)), investor, INVESTOR_REQUEST);
        assertEq(usd.balanceOf(delegate), ADVANCE, "only the Valid call should have paid the advance");
        assertEq(usd.balanceOf(investor), 0);
    }

    function test_fund_aDelegateCredentialDoesNotOpenTheInvestorGate() public {
        uint256 id = _listed();
        vm.prank(delegate);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, delegate, INVESTOR_REQUEST));
        fin.fund(id);
    }

    function test_fund_paysTheDiscountedAdvanceToTheBusiness() public {
        uint256 id = _listed();
        _asInvestor(investor);
        usd.mint(investor, FACE);
        vm.startPrank(investor);
        usd.approve(address(fin), ADVANCE);
        vm.expectEmit(address(fin));
        emit InvoiceFinancing.Funded(id, investor, ADVANCE);
        fin.fund(id);
        vm.stopPrank();
        assertEq(usd.balanceOf(delegate), ADVANCE, "the business holds the advance");
        assertEq(usd.balanceOf(investor), FACE - ADVANCE, "the investor paid exactly the advance");
        assertEq(usd.balanceOf(address(fin)), 0, "the contract holds nothing until repayment");
        InvoiceFinancing.Invoice memory inv = fin.invoice(id);
        assertEq(inv.investor, investor);
        assertEq(uint8(inv.status), uint8(InvoiceFinancing.Status.Funded));
    }

    function test_fund_onlyAListedInvoiceAndOnlyOnce() public {
        uint256 id = _funded();
        _asInvestor(stranger);
        vm.startPrank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                InvoiceFinancing.WrongStatus.selector,
                id,
                InvoiceFinancing.Status.Listed,
                InvoiceFinancing.Status.Funded
            )
        );
        fin.fund(id);
        vm.expectRevert(
            abi.encodeWithSelector(
                InvoiceFinancing.WrongStatus.selector, 99, InvoiceFinancing.Status.Listed, InvoiceFinancing.Status.None
            )
        );
        fin.fund(99);
        vm.stopPrank();
    }

    function test_fund_withoutTheAdvanceApprovedReverts() public {
        uint256 id = _listed();
        _asInvestor(investor);
        usd.mint(investor, ADVANCE);
        vm.prank(investor);
        vm.expectRevert();
        fin.fund(id);
        assertEq(uint8(fin.invoice(id).status), uint8(InvoiceFinancing.Status.Listed), "nothing changed");
    }

    // ---- repayment ----

    function test_repay_anyoneMayPayAFundedInvoice() public {
        uint256 id = _funded();
        assertFalse(mock.isEligible(debtor, INVESTOR_REQUEST));
        assertFalse(mock.isEligible(debtor, LISTER_REQUEST));
        usd.mint(debtor, FACE);
        vm.startPrank(debtor);
        usd.approve(address(fin), FACE);
        vm.expectEmit(address(fin));
        emit InvoiceFinancing.Repaid(id, debtor, FACE);
        fin.repay(id);
        vm.stopPrank();
        assertEq(usd.balanceOf(address(fin)), FACE, "the contract escrows the face value");
        assertEq(uint8(fin.invoice(id).status), uint8(InvoiceFinancing.Status.Repaid));
    }

    function test_repay_onlyAFundedInvoiceAndOnlyOnce() public {
        uint256 id = _listed();
        vm.expectRevert(
            abi.encodeWithSelector(
                InvoiceFinancing.WrongStatus.selector,
                id,
                InvoiceFinancing.Status.Funded,
                InvoiceFinancing.Status.Listed
            )
        );
        fin.repay(id);
        uint256 paid = _repaid();
        vm.expectRevert(
            abi.encodeWithSelector(
                InvoiceFinancing.WrongStatus.selector,
                paid,
                InvoiceFinancing.Status.Funded,
                InvoiceFinancing.Status.Repaid
            )
        );
        fin.repay(paid);
    }

    // ---- the investor gate on release, five states ----

    function test_release_revertsInAllInvalidStates() public {
        uint256 id = _repaid();
        assertRevertsForAllInvalidStates(address(fin), abi.encodeCall(fin.release, (id)), investor, INVESTOR_REQUEST);
        assertEq(usd.balanceOf(investor), FACE, "the Valid call released the face value");
        assertEq(usd.balanceOf(address(fin)), 0);
        assertEq(uint8(fin.invoice(id).status), uint8(InvoiceFinancing.Status.Released));
    }

    function test_release_onlyTheInvestorWhoFunded() public {
        uint256 id = _repaid();
        _asInvestor(stranger);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(InvoiceFinancing.NotTheInvestor.selector, id, stranger));
        fin.release(id);
    }

    function test_release_onlyAfterRepaymentAndOnlyOnce() public {
        uint256 id = _funded();
        vm.prank(investor);
        vm.expectRevert(
            abi.encodeWithSelector(
                InvoiceFinancing.WrongStatus.selector,
                id,
                InvoiceFinancing.Status.Repaid,
                InvoiceFinancing.Status.Funded
            )
        );
        fin.release(id);

        uint256 paid = _repaid();
        vm.startPrank(investor);
        fin.release(paid);
        vm.expectRevert(
            abi.encodeWithSelector(
                InvoiceFinancing.WrongStatus.selector,
                paid,
                InvoiceFinancing.Status.Repaid,
                InvoiceFinancing.Status.Released
            )
        );
        fin.release(paid);
        vm.stopPrank();
    }

    // ---- the discount arithmetic ----

    function test_advanceFor_roundsTheDiscountDown() public view {
        assertEq(fin.advanceFor(10_000e6, 300), 9_700e6, "3 percent of 10,000");
        assertEq(fin.advanceFor(1_001, 250), 976, "25.025 floors to 25");
        assertEq(fin.advanceFor(1, 9_999), 1, "a discount below one unit is nothing");
        assertEq(fin.advanceFor(FACE, 1), FACE - 1e6, "one basis point of 10,000 is 1");
    }

    function testFuzz_advanceFor_neverExceedsFaceValueAndNeverReachesZero(uint256 faceValue, uint16 discountBps)
        public
        view
    {
        faceValue = bound(faceValue, 1, 1e30);
        discountBps = uint16(bound(discountBps, 1, 9_999));
        uint256 advance = fin.advanceFor(faceValue, discountBps);
        assertLe(advance, faceValue);
        assertGe(advance, 1);
        assertEq(
            faceValue - advance, (faceValue * discountBps) / 10_000, "the investor's return is the floored discount"
        );
    }

    // ---- the whole life of one invoice ----

    function test_lifecycle_investorEarnsTheDiscountBusinessPaysIt() public {
        uint256 id = _listed();
        _asInvestor(investor);
        usd.mint(investor, ADVANCE);
        vm.startPrank(investor);
        usd.approve(address(fin), ADVANCE);
        fin.fund(id);
        vm.stopPrank();
        // The business collects the invoice from its debtor off chain and repays here itself.
        usd.mint(delegate, FACE - ADVANCE);
        vm.startPrank(delegate);
        usd.approve(address(fin), FACE);
        fin.repay(id);
        vm.stopPrank();
        vm.prank(investor);
        fin.release(id);

        assertEq(usd.balanceOf(investor), FACE, "advance back plus the discount");
        assertEq(usd.balanceOf(delegate), 0, "the business paid the discount");
        assertEq(usd.balanceOf(address(fin)), 0);
    }

    // ---- admin ----

    function test_admin_onlyTheOwnerRepointsEitherGate() public {
        ReceptorMock other = new ReceptorMock();
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        fin.setBusinessVerifier(other, 1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        fin.setVerifier(other);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        fin.setRequestId(1);
        vm.stopPrank();

        vm.startPrank(admin);
        vm.expectEmit(address(fin));
        emit InvoiceFinancing.BusinessVerifierChanged(address(mock), address(other), LISTER_REQUEST, 1);
        fin.setBusinessVerifier(other, 1);
        fin.setVerifier(other);
        vm.stopPrank();
        assertEq(address(fin.businessVerifier()), address(other));
        assertEq(fin.listerRequestId(), 1, "representatives only");
        assertEq(address(fin.verifier()), address(other));
    }
}
