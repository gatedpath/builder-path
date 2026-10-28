// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { GatedTest } from "@gatedpath/receptor-mock-test/GatedTest.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { Gated } from "@gatedpath/receptor-mock/Gated.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IUniswapV2Callee } from "@uniswap/v2-core/interfaces/IUniswapV2Callee.sol";
import { GatedPairFactory } from "../src/pool/GatedPairFactory.sol";
import { GatedPair } from "../src/pool/GatedPair.sol";
import { IPermission } from "../src/pool/IPermission.sol";
import { MockERC20 } from "../src/mocks/MockERC20.sol";
import { PermissionMock } from "./mocks/RedbellyMocks.sol";

/// @dev A flash-swap borrower: a contract as `to`. The network never verifies a contract, so the pair
/// refuses it before any token moves.
contract FlashBorrower is IUniswapV2Callee {
    function uniswapV2Call(address, uint256, uint256, bytes calldata) external pure { }
}

/// @notice The pool's two gates in every credential state, the stock Uniswap behaviour the gates sit
/// on, and the privileged paths. Request id 708 is the AU wholesale investor recipe.
contract GatedPairTest is GatedTest {
    uint64 internal constant REQUEST = 708;
    uint256 internal constant SEED = 100_000e18;

    PermissionMock internal permission;
    GatedPairFactory internal factory;
    GatedPair internal pair;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal wholesale = makeAddr("wholesale"); // Valid on 708, verified
    address internal retail = makeAddr("retail"); // NeverIssued on 708, verified
    address internal lapsed = makeAddr("lapsed"); // Valid until a date, then Expired
    address internal stranger = makeAddr("stranger"); // never verified by the network

    function setUp() public {
        _deployMock();
        permission = new PermissionMock();
        factory = new GatedPairFactory(owner, mock, REQUEST, IPermission(address(permission)));
        tokenA = new MockERC20("Pool Token A", "PTA");
        tokenB = new MockERC20("Pool Token B", "PTB");
        pair = GatedPair(factory.createPair(address(tokenA), address(tokenB)));
        vm.label(address(pair), "pair");

        address[4] memory everyone = [wholesale, retail, lapsed, treasury];
        for (uint256 i = 0; i < everyone.length; ++i) {
            permission.setAllowed(everyone[i], true);
            tokenA.mint(everyone[i], 10 * SEED);
            tokenB.mint(everyone[i], 10 * SEED);
        }
        tokenA.mint(stranger, 10 * SEED);
        tokenB.mint(stranger, 10 * SEED);
        mock.setStatus(wholesale, REQUEST, EligibilityStatus.Valid);
    }

    // ---- helpers ----

    function _send(address from, uint256 amountA, uint256 amountB) internal {
        vm.startPrank(from);
        if (amountA > 0) tokenA.transfer(address(pair), amountA);
        if (amountB > 0) tokenB.transfer(address(pair), amountB);
        vm.stopPrank();
    }

    /// @dev Seeds the pool from the wholesale wallet: SEED of each token.
    function _seedPool() internal returns (uint256 liquidity) {
        _send(wholesale, SEED, SEED);
        vm.prank(wholesale);
        liquidity = pair.mint(wholesale);
    }

    function _isA0() internal view returns (bool) {
        return pair.token0() == address(tokenA);
    }

    /// @dev Uniswap's getAmountOut for a 0.3 percent fee.
    function _amountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint256) {
        uint256 amountInWithFee = amountIn * 997;
        return amountInWithFee * reserveOut / (reserveIn * 1000 + amountInWithFee);
    }

    /// @dev Swaps `amountIn` of token A for token B, output to `to`, as `from`.
    function _swapAForB(address from, uint256 amountIn, address to) internal returns (uint256 out) {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 reserveIn, uint256 reserveOut) = _isA0() ? (r0, r1) : (r1, r0);
        out = _amountOut(amountIn, reserveIn, reserveOut);
        _send(from, amountIn, 0);
        vm.prank(from);
        if (_isA0()) pair.swap(0, out, to, "");
        else pair.swap(out, 0, to, "");
    }

    // ---- construction ----

    function test_factory_bindsTheRecipeAndTheNetworkGate() public view {
        assertEq(factory.requestId(), REQUEST);
        assertEq(address(factory.verifier()), address(mock));
        assertEq(address(factory.permission()), address(permission));
        assertEq(factory.owner(), owner);
        assertEq(factory.feeToSetter(), owner);
        assertEq(factory.allPairsLength(), 1);
        assertEq(factory.getPair(address(tokenA), address(tokenB)), address(pair));
        assertEq(factory.getPair(address(tokenB), address(tokenA)), address(pair));
        assertTrue(factory.isPair(address(pair)));
        assertEq(pair.factory(), address(factory));
        assertEq(pair.MINIMUM_LIQUIDITY(), 1000);
    }

    function test_factory_refusesZeroPermission() public {
        vm.expectRevert(GatedPairFactory.ZeroPermission.selector);
        new GatedPairFactory(owner, mock, REQUEST, IPermission(address(0)));
    }

    function test_createPair_isDeterministicAndRefusesDuplicates() public {
        vm.expectRevert(bytes("UniswapV2: PAIR_EXISTS"));
        factory.createPair(address(tokenB), address(tokenA));
        vm.expectRevert(bytes("UniswapV2: IDENTICAL_ADDRESSES"));
        factory.createPair(address(tokenA), address(tokenA));
        // the stranger may create a pair: no money moves, and the chain verified the sender anyway
        MockERC20 tokenC = new MockERC20("Pool Token C", "PTC");
        vm.prank(stranger);
        address created = factory.createPair(address(tokenA), address(tokenC));
        assertTrue(factory.isPair(created));
        assertEq(factory.allPairsLength(), 2);
    }

    // ---- pool entry: adding liquidity, in five credential states ----

    function test_addLiquidity_fiveStatesOnTheProvider() public {
        _seedPool();
        // the helper repeats the call once per state; the tokens sent in stay in the pair until the Valid
        // call mints them, so one deposit serves all five
        _send(retail, SEED / 10, SEED / 10);
        assertRevertsForAllInvalidStates(address(pair), abi.encodeCall(pair.mint, (retail)), retail, REQUEST);
        assertGt(pair.balanceOf(retail), 0);
    }

    function test_addLiquidity_firstDepositIsGatedToo() public {
        _send(retail, SEED, SEED);
        assertRevertsForAllInvalidStates(address(pair), abi.encodeCall(pair.mint, (retail)), retail, REQUEST);
        assertEq(pair.balanceOf(retail), SEED - pair.MINIMUM_LIQUIDITY());
        assertEq(pair.balanceOf(address(0)), pair.MINIMUM_LIQUIDITY());
    }

    function test_addLiquidity_gateIsOnTheWalletThatReceivesThePosition() public {
        _seedPool();
        // a router shape: the sender has no credential, the position goes to a wholesale wallet
        _send(retail, SEED / 10, SEED / 10);
        vm.prank(retail);
        uint256 minted = pair.mint(wholesale);
        assertGt(minted, 0);
        // the reverse: a wholesale sender cannot park a position in a retail wallet
        _send(wholesale, SEED / 10, SEED / 10);
        vm.prank(wholesale);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, retail, REQUEST));
        pair.mint(retail);
    }

    function test_lpTransfer_recipientMustPassTheProviderGate() public {
        uint256 liquidity = _seedPool();
        EligibilityStatus[4] memory states = invalidStates();
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(retail, REQUEST, states[i]);
            vm.prank(wholesale);
            vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, retail, REQUEST));
            pair.transfer(retail, liquidity / 2);
        }
        mock.setStatus(retail, REQUEST, EligibilityStatus.Valid);
        vm.prank(wholesale);
        pair.transfer(retail, liquidity / 2);
        assertEq(pair.balanceOf(retail), liquidity / 2);
        // transferFrom is the same gate
        mock.setStatus(retail, REQUEST, EligibilityStatus.Revoked);
        vm.prank(wholesale);
        pair.approve(retail, liquidity);
        vm.prank(retail);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, retail, REQUEST));
        pair.transferFrom(wholesale, retail, 1);
    }

    // ---- swaps: open to any verified wallet ----

    function test_swap_verifiedWalletWithoutTheCredentialSwaps() public {
        _seedPool();
        assertEq(uint8(mock.eligibilityStatus(retail, REQUEST)), uint8(EligibilityStatus.NeverIssued));
        uint256 before = tokenB.balanceOf(retail);
        uint256 out = _swapAForB(retail, 1_000e18, retail);
        assertEq(tokenB.balanceOf(retail) - before, out);
        assertGt(out, 0);
    }

    function test_swap_everyNonValidStateStillSwaps() public {
        _seedPool();
        EligibilityStatus[4] memory states = invalidStates();
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(retail, REQUEST, states[i]);
            uint256 before = tokenB.balanceOf(retail);
            uint256 out = _swapAForB(retail, 100e18, retail);
            assertEq(tokenB.balanceOf(retail) - before, out, stateName(states[i]));
        }
    }

    function test_swap_unverifiedRecipientIsRefused() public {
        _seedPool();
        _send(stranger, 1_000e18, 0);
        (uint256 out0, uint256 out1) = _isA0() ? (uint256(0), uint256(1)) : (uint256(1), uint256(0));
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(GatedPairFactory.NotVerified.selector, stranger));
        pair.swap(out0, out1, stranger, "");
        // a verified sender cannot route output to an unverified wallet either
        vm.prank(retail);
        vm.expectRevert(abi.encodeWithSelector(GatedPairFactory.NotVerified.selector, stranger));
        pair.swap(out0, out1, stranger, "");
    }

    function test_swap_flashBorrowerContractIsRefused() public {
        _seedPool();
        FlashBorrower borrower = new FlashBorrower();
        _send(retail, 1_000e18, 0);
        (uint256 out0, uint256 out1) = _isA0() ? (uint256(0), uint256(1)) : (uint256(1), uint256(0));
        vm.prank(retail);
        vm.expectRevert(abi.encodeWithSelector(GatedPairFactory.NotVerified.selector, address(borrower)));
        pair.swap(out0, out1, address(borrower), "x");
    }

    function test_swap_toAnotherPairOfTheFactoryIsAllowed() public {
        _seedPool();
        MockERC20 tokenC = new MockERC20("Pool Token C", "PTC");
        GatedPair second = GatedPair(factory.createPair(address(tokenB), address(tokenC)));
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 reserveIn, uint256 reserveOut) = _isA0() ? (r0, r1) : (r1, r0);
        uint256 out = _amountOut(1_000e18, reserveIn, reserveOut);
        _send(retail, 1_000e18, 0);
        vm.prank(retail);
        if (_isA0()) pair.swap(0, out, address(second), "");
        else pair.swap(out, 0, address(second), "");
        assertEq(tokenB.balanceOf(address(second)), out);
    }

    function test_swap_holdsTheConstantProduct() public {
        _seedPool();
        (uint112 r0, uint112 r1,) = pair.getReserves();
        (uint256 reserveIn, uint256 reserveOut) = _isA0() ? (r0, r1) : (r1, r0);
        uint256 tooMuch = _amountOut(1_000e18, reserveIn, reserveOut) + 1;
        (uint256 out0, uint256 out1) = _isA0() ? (uint256(0), tooMuch) : (tooMuch, uint256(0));
        _send(retail, 1_000e18, 0);
        vm.prank(retail);
        vm.expectRevert(bytes("UniswapV2: K"));
        pair.swap(out0, out1, retail, "");
    }

    // ---- pool exit: removing liquidity ----

    function test_removeLiquidity_holderWhoseCredentialExpiredExits() public {
        _seedPool();
        uint64 until = uint64(block.timestamp + 30 days);
        mock.setValidUntil(lapsed, REQUEST, until);
        _send(lapsed, SEED / 2, SEED / 2);
        vm.prank(lapsed);
        uint256 liquidity = pair.mint(lapsed);
        assertGt(liquidity, 0);

        vm.warp(until);
        assertEq(uint8(mock.eligibilityStatus(lapsed, REQUEST)), uint8(EligibilityStatus.Expired));

        // cannot add more
        _send(lapsed, 1e18, 1e18);
        vm.prank(lapsed);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, lapsed, REQUEST));
        pair.mint(lapsed);
        vm.prank(wholesale);
        pair.skim(lapsed); // the wholesale wallet returns the stranded deposit

        // can leave: the transfer into the pair and the burn are both open to a lapsed holder
        uint256 beforeA = tokenA.balanceOf(lapsed);
        uint256 beforeB = tokenB.balanceOf(lapsed);
        vm.startPrank(lapsed);
        pair.transfer(address(pair), liquidity);
        (uint256 amount0, uint256 amount1) = pair.burn(lapsed);
        vm.stopPrank();
        assertGt(amount0, 0);
        assertGt(amount1, 0);
        assertEq(tokenA.balanceOf(lapsed) - beforeA + tokenB.balanceOf(lapsed) - beforeB, amount0 + amount1);
        assertEq(pair.balanceOf(lapsed), 0);
        // and the position was worth what was put in, less rounding
        assertApproxEqAbs(tokenA.balanceOf(lapsed), 10 * SEED, 1e6);
        assertApproxEqAbs(tokenB.balanceOf(lapsed), 10 * SEED, 1e6);
    }

    function test_removeLiquidity_revokedHolderExitsToo() public {
        uint256 liquidity = _seedPool();
        mock.setStatus(wholesale, REQUEST, EligibilityStatus.Revoked);
        vm.startPrank(wholesale);
        pair.transfer(address(pair), liquidity);
        pair.burn(wholesale);
        vm.stopPrank();
        assertEq(pair.balanceOf(wholesale), 0);
    }

    function test_removeLiquidity_toAnUnverifiedRecipientIsRefused() public {
        uint256 liquidity = _seedPool();
        vm.startPrank(wholesale);
        pair.transfer(address(pair), liquidity);
        vm.expectRevert(abi.encodeWithSelector(GatedPairFactory.NotVerified.selector, stranger));
        pair.burn(stranger);
        vm.stopPrank();
    }

    function test_skim_recipientMustBeVerified() public {
        _seedPool();
        _send(stranger, 1e18, 0);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(GatedPairFactory.NotVerified.selector, stranger));
        pair.skim(stranger);
        vm.prank(stranger);
        pair.skim(retail);
        assertEq(tokenA.balanceOf(retail), 10 * SEED + 1e18);
    }

    // ---- the protocol fee ----

    function test_feeTo_treasuryIsMintedWithoutTheProviderGate() public {
        vm.prank(owner);
        factory.setFeeTo(treasury);
        assertEq(uint8(mock.eligibilityStatus(treasury, REQUEST)), uint8(EligibilityStatus.NeverIssued));
        _seedPool();
        _swapAForB(retail, 10_000e18, retail);
        _swapAForB(retail, 10_000e18, retail);
        // the fee is minted on the next liquidity event
        _send(wholesale, 1_000e18, 1_000e18);
        vm.prank(wholesale);
        pair.mint(wholesale);
        assertGt(pair.balanceOf(treasury), 0);
        // the treasury's tokens still obey the transfer gate
        vm.prank(treasury);
        vm.expectRevert(abi.encodeWithSelector(Gated.NotEligible.selector, retail, REQUEST));
        pair.transfer(retail, 1);
    }

    // ---- admin ----

    function test_admin_onlyTheOwnerRepointsTheGates() public {
        PermissionMock other = new PermissionMock();
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        factory.setPermission(IPermission(address(other)));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        factory.setRequestId(18);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        factory.setVerifier(mock);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        factory.setFeeTo(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        factory.setFeeToSetter(stranger);
        vm.stopPrank();

        vm.startPrank(owner);
        factory.setPermission(IPermission(address(other)));
        factory.setRequestId(18);
        factory.setFeeToSetter(treasury);
        vm.stopPrank();
        assertEq(address(factory.permission()), address(other));
        assertEq(factory.requestId(), 18);
        assertEq(factory.owner(), treasury);
        assertEq(factory.feeToSetter(), treasury);
        // every pair follows: the wholesale wallet is now unverified on the new permission contract
        assertFalse(factory.isVerifiedRecipient(wholesale));
    }

    // ---- fuzz: a round trip through the pool never pays out more than went in ----

    function testFuzz_mintThenBurnReturnsNoMoreThanDeposited(uint96 amountA, uint96 amountB) public {
        amountA = uint96(bound(amountA, 1e9, 10 * SEED));
        amountB = uint96(bound(amountB, 1e9, 10 * SEED));
        _seedPool();
        _send(retail, amountA, amountB);
        mock.setStatus(retail, REQUEST, EligibilityStatus.Valid);
        vm.prank(retail);
        uint256 liquidity = pair.mint(retail);
        uint256 beforeA = tokenA.balanceOf(retail);
        uint256 beforeB = tokenB.balanceOf(retail);
        vm.startPrank(retail);
        pair.transfer(address(pair), liquidity);
        pair.burn(retail);
        vm.stopPrank();
        assertLe(tokenA.balanceOf(retail) - beforeA, amountA);
        assertLe(tokenB.balanceOf(retail) - beforeB, amountB);
        // excess on the long side stays in the pool for everyone; nothing left the pool unaccounted
        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertEq(tokenA.balanceOf(address(pair)), _isA0() ? r0 : r1);
        assertEq(tokenB.balanceOf(address(pair)), _isA0() ? r1 : r0);
    }
}
