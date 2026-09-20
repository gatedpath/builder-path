// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test, Vm } from "forge-std/Test.sol";
import { ReceptorMock } from "@gatedpath/receptor-mock/ReceptorMock.sol";
import { EligibilityStatus } from "@gatedpath/receptor-mock/IRedbellyVerifier.sol";
import { GatedERC20 } from "../src/GatedERC20.sol";

/// @notice Drives the token through random sequences: subscriptions, issuer mints and
/// distributions, transfers, burns, forced transfers, pauses, issuer changes and credential
/// changes. The invariants are the ones PLAN.md section 6 asks for on a gated ERC-20, plus
/// the issuer allowance bound.
///
/// Two flavours share the handler. With `allowDowngrade` the handler may revoke or expire a
/// credential after the wallet has received tokens, which is what happens in production; then
/// the strongest true statement is "nobody ever received tokens while ineligible" and holders
/// may be frozen with a balance. Without downgrades, "no ineligible holder" holds literally.
contract Handler is Test {
    GatedERC20 public token;
    ReceptorMock public receptor;
    uint64 public requestId;
    address public admin;
    address public issuer;
    bool public allowDowngrade;

    address[] public actors;
    mapping(address => bool) public receivedWhileIneligible;
    uint256 public mintedTotal;
    uint256 public burnedTotal;
    uint256 public issuerMinted;
    uint256 public issuerAllowance;
    uint256 public forcedTransfers;
    uint256 public forcedAtZero;
    uint256 public forcedTransferEventsWithHash;
    uint256 public stateChangesWhilePaused;
    uint256 public denialsRecorded;
    uint256 public skippedAmounts;

    constructor(
        GatedERC20 token_,
        ReceptorMock receptor_,
        uint64 requestId_,
        address admin_,
        address issuer_,
        bool allowDowngrade_,
        uint256 issuerAllowance_
    ) {
        token = token_;
        receptor = receptor_;
        requestId = requestId_;
        admin = admin_;
        issuer = issuer_;
        allowDowngrade = allowDowngrade_;
        issuerAllowance = issuerAllowance_;
        for (uint256 i = 0; i < 6; i++) {
            actors.push(address(uint160(0x1000 + i)));
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _eligible(address a) internal view returns (bool) {
        return receptor.isEligible(a, requestId);
    }

    function _sumBalances() internal view returns (uint256 sum) {
        for (uint256 i = 0; i < actors.length; i++) {
            sum += token.balanceOf(actors[i]);
        }
    }

    function setStatus(uint256 seed, uint8 state) external {
        address a = _actor(seed);
        EligibilityStatus s = EligibilityStatus(state % 5);
        if (!allowDowngrade && s != EligibilityStatus.Valid && token.balanceOf(a) > 0) return;
        receptor.setStatus(a, requestId, s);
    }

    function subscribe(uint256 seed) external {
        address a = _actor(seed);
        bool paused = token.paused();
        uint256 supplyBefore = token.totalSupply();
        vm.prank(a);
        try token.subscribe() {
            if (paused) stateChangesWhilePaused++;
            if (!_eligible(a)) receivedWhileIneligible[a] = true;
            mintedTotal += token.totalSupply() - supplyBefore;
        } catch { }
    }

    function mint(uint256 seed, uint256 amount) external {
        address a = _actor(seed);
        amount = bound(amount, 0, 100e18);
        bool paused = token.paused();
        vm.prank(issuer);
        try token.mint(a, amount) {
            if (paused) stateChangesWhilePaused++;
            if (!_eligible(a) && amount > 0) receivedWhileIneligible[a] = true;
            mintedTotal += amount;
            issuerMinted += amount;
        } catch { }
    }

    function distribute(uint256 seedA, uint256 seedB, uint256 amountA, uint256 amountB) external {
        address[] memory to = new address[](2);
        to[0] = _actor(seedA);
        to[1] = _actor(seedB);
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = bound(amountA, 0, 100e18);
        amounts[1] = bound(amountB, 0, 100e18);
        bool paused = token.paused();
        bool[2] memory eligibleBefore = [_eligible(to[0]), _eligible(to[1])];
        vm.recordLogs();
        vm.prank(issuer);
        try token.distribute(to, amounts) returns (uint256 minted, uint256 skipped) {
            if (paused && minted > 0) stateChangesWhilePaused++;
            mintedTotal += minted;
            issuerMinted += minted;
            skippedAmounts += skipped;
            Vm.Log[] memory logs = vm.getRecordedLogs();
            for (uint256 i = 0; i < logs.length; i++) {
                if (logs[i].topics[0] == keccak256("EligibilityDenied(address,uint64,address)")) denialsRecorded++;
            }
            for (uint256 i = 0; i < 2; i++) {
                if (!eligibleBefore[i] && amounts[i] > 0) {
                    // the amount for this recipient must be in `skipped`, not minted
                    if (skipped < amounts[i]) receivedWhileIneligible[to[i]] = true;
                }
            }
        } catch { }
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        address to = _actor(toSeed);
        amount = bound(amount, 0, token.balanceOf(from));
        bool paused = token.paused();
        vm.prank(from);
        try token.transfer(to, amount) {
            if (paused) stateChangesWhilePaused++;
            if (!_eligible(to) && amount > 0) receivedWhileIneligible[to] = true;
        } catch { }
    }

    function burn(uint256 seed, uint256 amount) external {
        address a = _actor(seed);
        amount = bound(amount, 0, token.balanceOf(a));
        bool paused = token.paused();
        vm.prank(a);
        try token.burn(amount) {
            if (paused) stateChangesWhilePaused++;
            burnedTotal += amount;
        } catch { }
    }

    function forceTransfer(uint256 fromSeed, uint256 toSeed, uint256 amount, bytes32 justificationHash) external {
        address from = _actor(fromSeed);
        address to = _actor(toSeed);
        amount = bound(amount, 0, token.balanceOf(from));
        bool paused = token.paused();
        vm.recordLogs();
        vm.prank(admin);
        try token.forceTransfer(from, to, amount, justificationHash) {
            forcedTransfers++;
            if (paused) stateChangesWhilePaused++;
            if (!_eligible(to) && amount > 0) receivedWhileIneligible[to] = true;
            Vm.Log[] memory logs = vm.getRecordedLogs();
            for (uint256 i = 0; i < logs.length; i++) {
                if (logs[i].topics[0] == GatedERC20.ForcedTransfer.selector && logs[i].topics[3] != bytes32(0)) {
                    forcedTransferEventsWithHash++;
                }
            }
        } catch { }
    }

    /// Audit 2026-09-19, R1: the handler only ever forced moves between the six actors, so a forced
    /// move from or to the zero address (a mint, a burn) was invisible to every invariant.
    function forceTransferAtTheZeroAddress(uint256 seed, uint256 amount, bool fromZero) external {
        address who = _actor(seed);
        amount = bound(amount, 1, 1_000_000e18);
        vm.prank(admin);
        try token.forceTransfer(fromZero ? address(0) : who, fromZero ? who : address(0), amount, keccak256("audit")) {
            forcedAtZero++;
        } catch { }
    }

    function pause() external {
        vm.prank(admin);
        try token.pause() { } catch { }
    }

    function unpause() external {
        vm.prank(admin);
        try token.unpause() { } catch { }
    }

    function reissue(uint256 allowance, uint64 length) external {
        // Replacing the permission resets the issuer's counter; the invariant tracks the
        // current permission only, so reset the mirror too.
        allowance = bound(allowance, 0, 10_000e18);
        length = uint64(bound(length, 1 hours, 30 days));
        vm.prank(admin);
        try token.setIssuer(issuer, 0, uint64(block.timestamp) + length, allowance) {
            issuerAllowance = allowance;
            issuerMinted = 0;
        } catch { }
    }

    function warp(uint32 by) external {
        vm.warp(block.timestamp + bound(by, 0, 2 days));
    }
}

abstract contract GatedERC20InvariantsBase is Test {
    GatedERC20 internal token;
    ReceptorMock internal receptor;
    Handler internal handler;
    uint64 internal constant REQUEST = 3;
    address internal admin = makeAddr("admin");
    address internal issuer = makeAddr("issuer");

    function _allowDowngrade() internal pure virtual returns (bool);

    function setUp() public {
        vm.warp(1_800_000_000);
        receptor = new ReceptorMock();
        token = new GatedERC20(
            "Gated",
            "GTOK",
            GatedERC20.Roles({ admin: admin, pauser: address(0), compliance: address(0), issuerAdmin: address(0) }),
            receptor,
            REQUEST,
            50e18
        );
        vm.startPrank(admin);
        token.setSubscriptionsOpen(true);
        token.setIssuer(issuer, 0, uint64(block.timestamp + 30 days), 5_000e18);
        vm.stopPrank();
        handler = new Handler(token, receptor, REQUEST, admin, issuer, _allowDowngrade(), 5_000e18);
        targetContract(address(handler));
    }

    /// Supply conservation: total supply equals the sum of balances, and equals mints minus burns.
    function invariant_supplyConserved() public view {
        uint256 sum;
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            sum += token.balanceOf(handler.actors(i));
        }
        assertEq(token.totalSupply(), sum, "supply != sum of balances");
        assertEq(token.totalSupply(), handler.mintedTotal() - handler.burnedTotal(), "supply != mints - burns");
    }

    /// No wallet ever received tokens while ineligible, by any path (subscribe, mint, distribute,
    /// transfer, forced transfer).
    function invariant_noIneligibleRecipient() public view {
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            assertFalse(handler.receivedWhileIneligible(handler.actors(i)));
        }
    }

    /// Paused means no balance changed except through unpause.
    function invariant_noTransferWhilePaused() public view {
        assertEq(handler.stateChangesWhilePaused(), 0);
    }

    /// Every forced transfer emitted a non-zero justification hash.
    function invariant_forcedTransfersCarryAHash() public view {
        assertEq(handler.forcedTransfers(), handler.forcedTransferEventsWithHash());
    }

    /// The issuer never minted more than its current permission allows.
    function invariant_issuerWithinAllowance() public view {
        assertLe(handler.issuerMinted(), handler.issuerAllowance());
        assertEq(token.issuerPermission(issuer).minted, handler.issuerMinted());
    }
}

/// @notice Production flavour: credentials can lapse after a wallet holds tokens.
contract GatedERC20Invariants is GatedERC20InvariantsBase {
    function _allowDowngrade() internal pure override returns (bool) {
        return true;
    }

    /// Every skipped distribution recipient left an EligibilityDenied on the log.
    function invariant_skipsAreOnTheLog() public view {
        if (handler.skippedAmounts() > 0) assertGt(handler.denialsRecorded(), 0);
    }
}

/// @notice Frozen-credential flavour: once a wallet holds tokens its credential never lapses,
/// so "no ineligible holder" is literally true after any sequence.
contract GatedERC20NoDowngradeInvariants is GatedERC20InvariantsBase {
    function _allowDowngrade() internal pure override returns (bool) {
        return false;
    }

    function invariant_noIneligibleHolder() public view {
        for (uint256 i = 0; i < handler.actorCount(); i++) {
            address a = handler.actors(i);
            if (token.balanceOf(a) > 0) assertTrue(receptor.isEligible(a, REQUEST), "ineligible wallet holds tokens");
        }
    }
}
