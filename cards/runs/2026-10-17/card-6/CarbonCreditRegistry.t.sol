// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { IERC1155Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import { CarbonCreditRegistry } from "../src/CarbonCreditRegistry.sol";

/// @notice Both gates in the five credential states, retirement in the five states, and the
/// one-way promise: a retired credit never comes back. The holder gate is request 18 and the
/// issuer gate is request 100 on the same ReceptorMock, so a wallet can be put into one state for
/// one gate and another state for the other, which is how the two-gates tests work.
contract CarbonCreditRegistryTest is GatedTest {
    CarbonCreditRegistry internal registry;
    uint64 internal constant HOLDER = 18;
    uint64 internal constant ISSUER = 100;
    address internal admin = makeAddr("admin");
    address internal issuer = makeAddr("issuer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    string internal constant PROJECT = "VCS-1234";
    uint16 internal constant VINTAGE = 2024;

    event Issued(
        uint256 indexed batchId,
        address indexed issuer,
        address indexed to,
        string projectId,
        uint16 vintage,
        uint256 amount
    );
    event Retired(
        uint256 indexed batchId,
        address indexed holder,
        address indexed beneficiary,
        string projectId,
        uint16 vintage,
        uint256 amount,
        string reason
    );

    function setUp() public {
        _deployMock();
        registry = new CarbonCreditRegistry(admin, mock, HOLDER, ISSUER);
    }

    function _holder(address who) internal {
        mock.setStatus(who, HOLDER, EligibilityStatus.Valid);
    }

    function _issuer(address who) internal {
        mock.setStatus(who, ISSUER, EligibilityStatus.Valid);
    }

    /// @dev One batch of 100 credits in alice's hands, issuer and alice both valid.
    function _issueToAlice() internal returns (uint256 batchId) {
        _issuer(issuer);
        _holder(alice);
        vm.prank(issuer);
        batchId = registry.mint(alice, PROJECT, VINTAGE, 100);
    }

    // ---- construction ----

    function test_constructor_bindsBothRequestIds() public view {
        assertEq(registry.requestId(), HOLDER);
        assertEq(registry.issuerRequestId(), ISSUER);
        assertEq(address(registry.verifier()), address(mock));
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_constructor_refusesZeroAdmin() public {
        vm.expectRevert(CarbonCreditRegistry.ZeroAdmin.selector);
        new CarbonCreditRegistry(address(0), mock, HOLDER, ISSUER);
    }

    // ---- the minting gate: the issuer in five states (request 100) ----

    function test_mint_issuerInFiveStates() public {
        _holder(alice);
        bytes memory call = abi.encodeCall(registry.mint, (alice, PROJECT, VINTAGE, 10));
        assertRevertsForAllInvalidStates(address(registry), call, issuer, ISSUER);
    }

    // ---- the holder gate: the recipient in five states (request 18) ----

    function test_mint_recipientInFiveStates() public {
        _issuer(issuer);
        EligibilityStatus[4] memory states = invalidStates();
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(alice, HOLDER, states[i]);
            vm.prank(issuer);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, HOLDER));
            registry.mint(alice, PROJECT, VINTAGE, 10);
        }
        _holder(alice);
        vm.prank(issuer);
        uint256 batchId = registry.mint(alice, PROJECT, VINTAGE, 10);
        assertEq(registry.balanceOf(alice, batchId), 10);
    }

    // ---- the two gates are different questions ----

    function test_gates_areIndependent() public {
        // Valid as a holder, nothing as an issuer: may hold, may not mint.
        _holder(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, alice, ISSUER));
        registry.mint(alice, PROJECT, VINTAGE, 10);

        // Valid as an issuer, nothing as a holder: may mint, may not hold.
        _issuer(issuer);
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, issuer, HOLDER));
        registry.mint(issuer, PROJECT, VINTAGE, 10);

        // Both on one wallet: an issuer who is also an eligible holder mints to itself.
        _holder(issuer);
        vm.prank(issuer);
        uint256 batchId = registry.mint(issuer, PROJECT, VINTAGE, 10);
        assertEq(registry.balanceOf(issuer, batchId), 10);
        assertTrue(registry.isIssuer(issuer));
        assertFalse(registry.isIssuer(alice));
    }

    // ---- transfers: both parties in five states ----

    function test_transfer_bothPartiesInFiveStates() public {
        uint256 batchId = _issueToAlice();
        bytes memory call = abi.encodeCall(registry.safeTransferFrom, (alice, bob, batchId, 1, ""));
        assertGatedPair(address(registry), call, alice, bob, HOLDER);
        assertEq(registry.balanceOf(bob, batchId), 2, "two successes in the pair walk");
    }

    function test_transfer_operatorIsNeverTheGatedParty() public {
        uint256 batchId = _issueToAlice();
        _holder(bob);
        address operator = makeAddr("operator"); // never given any credential
        vm.prank(alice);
        registry.setApprovalForAll(operator, true);
        vm.prank(operator);
        registry.safeTransferFrom(alice, bob, batchId, 5, "");
        assertEq(registry.balanceOf(bob, batchId), 5);
    }

    // ---- retirement: the holder in five states ----

    function test_retire_holderInFiveStates() public {
        uint256 batchId = _issueToAlice();
        bytes memory call = abi.encodeCall(registry.retire, (batchId, 1, address(0), "offset"));
        assertRevertsForAllInvalidStates(address(registry), call, alice, HOLDER);
        assertEq(registry.batch(batchId).retired, 1);
    }

    // ---- retirement is permanent ----

    function test_retire_burnsAndCounts() public {
        uint256 batchId = _issueToAlice();
        vm.prank(alice);
        vm.expectEmit(address(registry));
        emit Retired(batchId, alice, alice, PROJECT, VINTAGE, 40, "FY26 offset");
        registry.retire(batchId, 40, address(0), "FY26 offset");

        assertEq(registry.balanceOf(alice, batchId), 60);
        CarbonCreditRegistry.Batch memory b = registry.batch(batchId);
        assertEq(b.issued, 100, "issued never moves");
        assertEq(b.retired, 40);
        assertEq(registry.outstanding(batchId), 60);
    }

    function test_retire_namesABeneficiary() public {
        uint256 batchId = _issueToAlice();
        address client = makeAddr("client");
        vm.prank(alice);
        vm.expectEmit(address(registry));
        emit Retired(batchId, alice, client, PROJECT, VINTAGE, 1, "on behalf of a client");
        registry.retire(batchId, 1, client, "on behalf of a client");
    }

    function test_retire_refusesMoreThanHeld() public {
        uint256 batchId = _issueToAlice();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC1155Errors.ERC1155InsufficientBalance.selector, alice, 100, 101, batchId)
        );
        registry.retire(batchId, 101, address(0), "");
        assertEq(registry.batch(batchId).retired, 0, "a failed retirement counts nothing");
    }

    function test_retire_refusesZeroAndUnknown() public {
        uint256 batchId = _issueToAlice();
        vm.prank(alice);
        vm.expectRevert(CarbonCreditRegistry.ZeroAmount.selector);
        registry.retire(batchId, 0, address(0), "");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(CarbonCreditRegistry.UnknownBatch.selector, 99));
        registry.retire(99, 1, address(0), "");
    }

    function test_retire_wholeBatchLeavesNothingToMove() public {
        uint256 batchId = _issueToAlice();
        _holder(bob);
        vm.prank(alice);
        registry.retire(batchId, 100, address(0), "all of it");
        assertEq(registry.outstanding(batchId), 0);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC1155Errors.ERC1155InsufficientBalance.selector, alice, 0, 1, batchId)
        );
        registry.safeTransferFrom(alice, bob, batchId, 1, "");
    }

    /// @dev The one-way promise under random retirement amounts: issued is constant, retired only
    /// grows, and the sum of retired and outstanding is always what was issued.
    function testFuzz_retire_isOneWay(uint256 first, uint256 second) public {
        uint256 batchId = _issueToAlice();
        first = bound(first, 1, 99);
        second = bound(second, 1, 100 - first);
        vm.prank(alice);
        registry.retire(batchId, first, address(0), "");
        uint256 afterFirst = registry.batch(batchId).retired;
        vm.prank(alice);
        registry.retire(batchId, second, address(0), "");
        CarbonCreditRegistry.Batch memory b = registry.batch(batchId);
        assertEq(afterFirst, first);
        assertEq(b.retired, first + second);
        assertEq(b.issued, 100);
        assertEq(b.retired + registry.outstanding(batchId), b.issued);
    }

    // ---- batches ----

    function test_mint_recordsProjectAndVintage() public {
        _issuer(issuer);
        _holder(alice);
        vm.prank(issuer);
        vm.expectEmit(address(registry));
        emit Issued(1, issuer, alice, PROJECT, VINTAGE, 100);
        uint256 batchId = registry.mint(alice, PROJECT, VINTAGE, 100);
        assertEq(batchId, 1);
        CarbonCreditRegistry.Batch memory b = registry.batch(batchId);
        assertEq(b.issuer, issuer);
        assertEq(b.projectId, PROJECT);
        assertEq(b.vintage, VINTAGE);
        assertEq(b.issued, 100);
        assertEq(b.retired, 0);
        assertEq(registry.batchCount(), 1);
    }

    function test_mint_eachMintIsItsOwnBatch() public {
        _issuer(issuer);
        _holder(alice);
        vm.startPrank(issuer);
        uint256 a = registry.mint(alice, PROJECT, VINTAGE, 10);
        uint256 b = registry.mint(alice, PROJECT, VINTAGE, 10);
        vm.stopPrank();
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(registry.batchCount(), 2);
    }

    function test_mint_refusesEmptyInputs() public {
        _issuer(issuer);
        _holder(alice);
        vm.startPrank(issuer);
        vm.expectRevert(CarbonCreditRegistry.ZeroAmount.selector);
        registry.mint(alice, PROJECT, VINTAGE, 0);
        vm.expectRevert(CarbonCreditRegistry.EmptyProjectId.selector);
        registry.mint(alice, "", VINTAGE, 1);
        vm.expectRevert(CarbonCreditRegistry.ZeroVintage.selector);
        registry.mint(alice, PROJECT, 0, 1);
        vm.stopPrank();
    }

    function test_batch_unknownReverts() public {
        vm.expectRevert(abi.encodeWithSelector(CarbonCreditRegistry.UnknownBatch.selector, 1));
        registry.batch(1);
    }

    // ---- admin ----

    function test_setIssuerRequestId_adminOnly() public {
        // Read the role first: an external call inside the expectRevert argument would eat the prank.
        bytes32 adminRole = registry.DEFAULT_ADMIN_ROLE();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, adminRole)
        );
        registry.setIssuerRequestId(101);

        vm.prank(admin);
        registry.setIssuerRequestId(101);
        assertEq(registry.issuerRequestId(), 101);

        // Proofs under the old id stop counting, which is what the recipe wants when an issuer is dropped.
        _issuer(issuer);
        _holder(alice);
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, issuer, 101));
        registry.mint(alice, PROJECT, VINTAGE, 1);
    }

    function test_setRequestId_adminOnly() public {
        bytes32 adminRole = registry.DEFAULT_ADMIN_ROLE();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, adminRole)
        );
        registry.setRequestId(19);
        vm.prank(admin);
        registry.setRequestId(19);
        assertEq(registry.requestId(), 19);
    }
}
