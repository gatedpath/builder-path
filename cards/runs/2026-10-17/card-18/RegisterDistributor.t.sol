// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test, Vm } from "forge-std/Test.sol";
import { RegisterDistributor } from "../src/RegisterDistributor.sol";
import { MockStable } from "./mocks/MockStable.sol";
import { MockRegister } from "./mocks/MockRegister.sol";

/// The table the tests pay: four holders of a mock register, read at a snapshot block, one of them with
/// a zero balance. Balances are in the register's 18 decimals; the stablecoin has 6.
contract RegisterDistributorTest is Test {
    RegisterDistributor internal distributor;
    MockStable internal coin;
    MockRegister internal reg;

    address internal admin = makeAddr("administrator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");
    address internal stranger = makeAddr("stranger");

    address[] internal holders;
    uint256[] internal balances;
    uint256 internal snapshot;

    uint256 internal constant TOTAL = 1_000_000_000; // 1,000 mAUD

    function setUp() public {
        distributor = new RegisterDistributor();
        coin = new MockStable();
        reg = new MockRegister();

        reg.register(alice);
        reg.register(bob);
        reg.register(carol);
        reg.register(dave);
        reg.mint(alice, 500e18);
        reg.mint(bob, 300e18);
        reg.mint(carol, 200e18);
        // dave is registered and listed but holds nothing

        vm.roll(100);
        snapshot = block.number;
        holders = [alice, bob, carol, dave];
        balances = [reg.balanceOf(alice), reg.balanceOf(bob), reg.balanceOf(carol), reg.balanceOf(dave)];

        coin.mint(admin, TOTAL);
        vm.prank(admin);
        coin.approve(address(distributor), TOTAL);
    }

    function _open() internal returns (uint256 id) {
        vm.prank(admin);
        id = distributor.open(address(coin), address(reg), snapshot, TOTAL, holders, balances);
    }

    // ---- the happy path ---------------------------------------------------------------------------

    function test_open_recordsTheTableAndTransfersNothing() public {
        uint256 id = _open();
        RegisterDistributor.Distribution memory d = distributor.distribution(id);
        assertEq(id, 1);
        assertEq(d.payer, admin);
        assertEq(d.stablecoin, address(coin));
        assertEq(d.register, address(reg));
        assertEq(d.snapshotBlock, snapshot);
        assertEq(d.total, TOTAL);
        assertEq(d.totalBalance, 1000e18);
        assertEq(d.holderCount, 4);
        assertEq(coin.balanceOf(admin), TOTAL, "open moves no money");
    }

    function test_pay_everyHolderProRataInOneTransaction() public {
        uint256 id = _open();
        vm.prank(admin);
        distributor.pay(id, 100);
        assertEq(coin.balanceOf(alice), 500_000_000);
        assertEq(coin.balanceOf(bob), 300_000_000);
        assertEq(coin.balanceOf(carol), 200_000_000);
        assertEq(coin.balanceOf(dave), 0);
        assertEq(coin.balanceOf(admin), 0);
        RegisterDistributor.Distribution memory d = distributor.distribution(id);
        assertEq(d.cursor, 4);
        assertEq(d.paid, TOTAL);
        assertEq(d.paidCount, 3);
        assertEq(d.failedCount, 0);
    }

    function test_pay_inSeveralTransactionsReachesTheSameResult() public {
        uint256 id = _open();
        vm.startPrank(admin);
        distributor.pay(id, 1);
        assertEq(coin.balanceOf(alice), 500_000_000);
        assertEq(coin.balanceOf(bob), 0, "bob waits for the next batch");
        distributor.pay(id, 2);
        assertEq(coin.balanceOf(bob), 300_000_000);
        assertEq(coin.balanceOf(carol), 200_000_000);
        vm.expectEmit(true, false, false, true);
        emit RegisterDistributor.Completed(id, TOTAL, 3, 0, 0);
        distributor.pay(id, 5);
        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.NothingLeftToPay.selector, id));
        distributor.pay(id, 1);
        vm.stopPrank();
    }

    function test_pay_emitsOneEventPerPayment() public {
        uint256 id = _open();
        vm.expectEmit(true, true, false, true);
        emit RegisterDistributor.Paid(id, alice, 500_000_000, 500e18);
        vm.expectEmit(true, true, false, true);
        emit RegisterDistributor.Paid(id, bob, 300_000_000, 300e18);
        vm.expectEmit(true, true, false, true);
        emit RegisterDistributor.Paid(id, carol, 200_000_000, 200e18);
        vm.expectEmit(true, true, false, true);
        emit RegisterDistributor.Skipped(id, dave);
        vm.prank(admin);
        distributor.pay(id, 4);
    }

    // ---- the four cases the card asks for -------------------------------------------------------

    /// A holder whose register balance moved after the snapshot is paid by the snapshot, not by today.
    function test_holderWhoseBalanceMovedAfterTheSnapshotIsPaidBySnapshot() public {
        uint256 id = _open();
        // after the snapshot, alice sells 400 units to bob on the register
        vm.roll(snapshot + 10);
        vm.prank(alice);
        reg.transfer(bob, 400e18);
        assertEq(reg.balanceOf(alice), 100e18);
        assertEq(reg.balanceOf(bob), 700e18);

        vm.prank(admin);
        distributor.pay(id, 4);
        assertEq(coin.balanceOf(alice), 500_000_000, "alice is paid on her 500 at the snapshot");
        assertEq(coin.balanceOf(bob), 300_000_000, "bob is paid on his 300 at the snapshot");
    }

    /// A holder with a zero balance at the snapshot is in the table, is skipped, and no transfer is made.
    function test_zeroBalanceHolderIsSkippedWithoutATransfer() public {
        uint256 id = _open();
        vm.prank(admin);
        distributor.pay(id, 4);
        (address holder, uint256 bal, uint256 amount, RegisterDistributor.Status status) = distributor.holderAt(id, 3);
        assertEq(holder, dave);
        assertEq(bal, 0);
        assertEq(amount, 0);
        assertEq(uint256(status), uint256(RegisterDistributor.Status.Skipped));
        assertEq(coin.balanceOf(dave), 0);
    }

    /// Three equal holders and a total that does not divide: each gets the floor, the dust stays with the
    /// payer and is reported in Completed. Nothing is minted, nothing is lost.
    function test_roundingDustStaysWithThePayerAndIsReported() public {
        address[] memory three = new address[](3);
        three[0] = alice;
        three[1] = bob;
        three[2] = carol;
        uint256[] memory same = new uint256[](3);
        same[0] = 1e18;
        same[1] = 1e18;
        same[2] = 1e18;
        uint256 total = 100;

        vm.startPrank(admin);
        uint256 id = distributor.open(address(coin), address(reg), snapshot, total, three, same);
        vm.expectEmit(true, false, false, true);
        emit RegisterDistributor.Completed(id, 99, 3, 0, 1);
        distributor.pay(id, 3);
        vm.stopPrank();

        assertEq(coin.balanceOf(alice), 33);
        assertEq(coin.balanceOf(bob), 33);
        assertEq(coin.balanceOf(carol), 33);
        assertEq(coin.balanceOf(admin), TOTAL - 99, "the one unit of dust never left the wallet");
    }

    /// A payment that fails part way: the coin refuses bob. Alice before him and carol after him are paid in
    /// the same transaction, bob is recorded as Failed with the coin's reason, and a retry pays him once the
    /// refusal is lifted.
    function test_paymentThatFailsPartWayDoesNotStopTheBatchAndCanBeRetried() public {
        uint256 id = _open();
        coin.setDenied(bob, true);

        vm.expectEmit(true, true, false, true);
        emit RegisterDistributor.PaymentFailed(
            id, bob, 300_000_000, abi.encodeWithSelector(MockStable.Denied.selector, bob)
        );
        vm.prank(admin);
        distributor.pay(id, 4);

        assertEq(coin.balanceOf(alice), 500_000_000);
        assertEq(coin.balanceOf(bob), 0);
        assertEq(coin.balanceOf(carol), 200_000_000);
        RegisterDistributor.Distribution memory d = distributor.distribution(id);
        assertEq(d.paid, 700_000_000);
        assertEq(d.failedCount, 1);
        assertEq(uint256(distributor.statusOf(id, bob)), uint256(RegisterDistributor.Status.Failed));

        // still refused: the retry fails again and the count holds
        vm.prank(admin);
        distributor.retry(id, bob);
        assertEq(distributor.distribution(id).failedCount, 1);

        coin.setDenied(bob, false);
        vm.prank(admin);
        distributor.retry(id, bob);
        assertEq(coin.balanceOf(bob), 300_000_000);
        d = distributor.distribution(id);
        assertEq(d.paid, TOTAL);
        assertEq(d.failedCount, 0);
        assertEq(uint256(distributor.statusOf(id, bob)), uint256(RegisterDistributor.Status.Paid));

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.NotFailed.selector, id, bob));
        distributor.retry(id, bob);
    }

    /// A coin that returns false instead of reverting is a failure too.
    function test_paymentReturningFalseIsRecordedAsFailed() public {
        uint256 id = _open();
        coin.setReturnsFalseFor(carol, true);
        vm.expectEmit(true, true, false, true);
        emit RegisterDistributor.PaymentFailed(id, carol, 200_000_000, "transferFrom returned false");
        vm.prank(admin);
        distributor.pay(id, 4);
        assertEq(coin.balanceOf(carol), 0);
        assertEq(distributor.distribution(id).failedCount, 1);
    }

    /// The case the prompt names: a coin that refuses contract spenders. Every payment fails and is
    /// recorded; the administrator then pays from the wallet directly (the fallback the interface must say).
    function test_coinThatRefusesContractSpendersFailsEveryPaymentAndKeepsTheMoney() public {
        uint256 id = _open();
        coin.setRefuseContractSpenders(true);
        vm.prank(admin);
        distributor.pay(id, 4);
        RegisterDistributor.Distribution memory d = distributor.distribution(id);
        assertEq(d.paid, 0);
        assertEq(d.failedCount, 3);
        assertEq(coin.balanceOf(admin), TOTAL);
        // the direct fallback works from the wallet
        vm.prank(admin);
        assertTrue(coin.transfer(alice, 500_000_000));
    }

    // ---- what the distributor never does ----------------------------------------------------------

    /// The distributor is not registered on the register and never needs to be: no call of its reaches the
    /// register. The register would refuse it if one did.
    function test_distributorNeverTouchesTheRegister() public {
        uint256 id = _open();
        uint256 supplyBefore = reg.totalSupply();
        uint256 aliceBefore = reg.balanceOf(alice);
        vm.recordLogs();
        vm.prank(admin);
        distributor.pay(id, 4);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; i++) {
            assertTrue(logs[i].emitter != address(reg), "no event came from the register");
        }
        assertEq(reg.totalSupply(), supplyBefore);
        assertEq(reg.balanceOf(alice), aliceBefore);
        assertFalse(reg.registry().isVerified(address(distributor)));
    }

    // ---- refusals -------------------------------------------------------------------------------

    function test_open_refusesBadTables() public {
        uint256[] memory short = new uint256[](3);
        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.LengthMismatch.selector, 4, 3));
        distributor.open(address(coin), address(reg), snapshot, TOTAL, holders, short);

        vm.expectRevert(RegisterDistributor.ZeroTotal.selector);
        distributor.open(address(coin), address(reg), snapshot, 0, holders, balances);

        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.NotAContract.selector, stranger));
        distributor.open(stranger, address(reg), snapshot, TOTAL, holders, balances);

        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.NotAContract.selector, stranger));
        distributor.open(address(coin), stranger, snapshot, TOTAL, holders, balances);

        vm.expectRevert(
            abi.encodeWithSelector(RegisterDistributor.SnapshotInFuture.selector, block.number + 1, block.number)
        );
        distributor.open(address(coin), address(reg), block.number + 1, TOTAL, holders, balances);

        address[] memory dup = new address[](2);
        dup[0] = alice;
        dup[1] = alice;
        uint256[] memory two = new uint256[](2);
        two[0] = 1;
        two[1] = 1;
        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.DuplicateHolder.selector, alice));
        distributor.open(address(coin), address(reg), snapshot, TOTAL, dup, two);

        address[] memory none = new address[](0);
        uint256[] memory noneB = new uint256[](0);
        vm.expectRevert(RegisterDistributor.NoHolders.selector);
        distributor.open(address(coin), address(reg), snapshot, TOTAL, none, noneB);

        address[] memory one = new address[](1);
        one[0] = dave;
        uint256[] memory zero = new uint256[](1);
        vm.expectRevert(RegisterDistributor.ZeroTotalBalance.selector);
        distributor.open(address(coin), address(reg), snapshot, TOTAL, one, zero);
        vm.stopPrank();
    }

    function test_onlyThePayerPaysRetriesOrCloses() public {
        uint256 id = _open();
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.NotPayer.selector, stranger, admin));
        distributor.pay(id, 4);
        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.NotPayer.selector, stranger, admin));
        distributor.retry(id, alice);
        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.NotPayer.selector, stranger, admin));
        distributor.close(id);
        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.UnknownDistribution.selector, 99));
        distributor.pay(99, 1);
        vm.stopPrank();
    }

    function test_close_onlyWhenFinishedAndThenNothingMoreMoves() public {
        uint256 id = _open();
        vm.startPrank(admin);
        distributor.pay(id, 2);
        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.NotFinished.selector, id, 2, 4));
        distributor.close(id);
        distributor.pay(id, 2);
        distributor.close(id);
        assertTrue(distributor.distribution(id).closed);
        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.AlreadyClosed.selector, id));
        distributor.pay(id, 1);
        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.AlreadyClosed.selector, id));
        distributor.retry(id, alice);
        vm.expectRevert(abi.encodeWithSelector(RegisterDistributor.AlreadyClosed.selector, id));
        distributor.close(id);
        vm.stopPrank();
    }

    function test_twoDistributionsOnOneContractDoNotMix() public {
        uint256 first = _open();
        coin.mint(admin, TOTAL);
        vm.startPrank(admin);
        coin.approve(address(distributor), 2 * TOTAL);
        uint256 second = distributor.open(address(coin), address(reg), snapshot, TOTAL / 2, holders, balances);
        distributor.pay(second, 4);
        assertEq(coin.balanceOf(alice), 250_000_000);
        assertEq(distributor.distribution(first).paid, 0);
        distributor.pay(first, 4);
        assertEq(coin.balanceOf(alice), 750_000_000);
        vm.stopPrank();
    }

    // ---- the fuzz: whatever the table and the total, paid plus dust equals the total ----------------

    function testFuzz_paidPlusDustEqualsTotal(uint256 total, uint8 count, uint256 seed) public {
        total = bound(total, 1, 1e15);
        count = uint8(bound(count, 1, 40));
        address[] memory hs = new address[](count);
        uint256[] memory bs = new uint256[](count);
        uint256 sum;
        for (uint256 i = 0; i < count; i++) {
            hs[i] = address(uint160(uint256(keccak256(abi.encode(seed, i))) | 1));
            bs[i] = uint256(keccak256(abi.encode(seed, i, "b"))) % 1e24;
            sum += bs[i];
        }
        vm.assume(sum > 0);

        coin.mint(admin, total);
        vm.startPrank(admin);
        coin.approve(address(distributor), TOTAL + total);
        uint256 id = distributor.open(address(coin), address(reg), snapshot, total, hs, bs);
        distributor.pay(id, 7);
        if (count > 7) distributor.pay(id, 100);
        vm.stopPrank();

        RegisterDistributor.Distribution memory d = distributor.distribution(id);
        uint256 received;
        for (uint256 i = 0; i < count; i++) {
            received += coin.balanceOf(hs[i]);
        }
        assertEq(d.cursor, count);
        assertEq(received, d.paid);
        assertEq(d.paid + (total - d.due), total, "paid plus dust is the total");
        assertEq(coin.balanceOf(admin), TOTAL + total - d.paid, "the dust is still in the wallet");
        assertLe(total - d.due, count, "dust is less than one unit per holder");
    }
}
