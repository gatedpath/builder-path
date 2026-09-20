// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Gated} from "../src/Gated.sol";
import {EligibilityStatus} from "../src/IRedbellyVerifier.sol";
import {ReceptorMock} from "../src/ReceptorMock.sol";

/// @title GatedTest
/// @notice Abstract Foundry test base that proves a gate against all five credential states, so
/// a developer cannot forget one.
/// @dev Inherit it, call `_deployMock()` in `setUp`, build the contract under test on `mock`, then
/// hand `assertRevertsForAllInvalidStates` or `assertGatedPair` the target address and the ABI
/// encoded call. The call data must be safe to repeat: the helpers run it once per state.
/// The helpers set states on `mock` for the request id you pass, so pass the request id the
/// target is bound to. They work against mock-backed targets only; an adapter over a real
/// verifier cannot be put into `Expired`, `Revoked` or `WrongJurisdiction`.
abstract contract GatedTest is Test {
    /// @notice The mock every gated contract under test should point at.
    ReceptorMock internal mock;

    /// @notice Deploys a fresh mock into `mock` and returns it.
    function _deployMock() internal returns (ReceptorMock) {
        mock = new ReceptorMock();
        vm.label(address(mock), "ReceptorMock");
        return mock;
    }

    /// @notice The four states that must be denied, in enum order.
    function invalidStates() internal pure returns (EligibilityStatus[4] memory states) {
        states[0] = EligibilityStatus.NeverIssued;
        states[1] = EligibilityStatus.Expired;
        states[2] = EligibilityStatus.Revoked;
        states[3] = EligibilityStatus.WrongJurisdiction;
    }

    /// @notice Puts `wallet` into each of the four non-valid states, calls `target` as `wallet`
    /// each time and asserts the revert is exactly `NotEligible(wallet, requestId)`; then sets
    /// `Valid` and asserts the same call succeeds.
    /// @param target The gated contract.
    /// @param callData The ABI encoded call to a function guarded by `gated`.
    /// @param wallet The caller the gate checks.
    /// @param requestId The request id the target is bound to.
    function assertRevertsForAllInvalidStates(address target, bytes memory callData, address wallet, uint64 requestId)
        internal
    {
        _requireReady(target);
        EligibilityStatus[4] memory states = invalidStates();
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(wallet, requestId, states[i]);
            _expectNotEligible(target, callData, wallet, wallet, requestId, states[i]);
        }
        mock.setStatus(wallet, requestId, EligibilityStatus.Valid);
        _expectSuccess(target, callData, wallet, "Valid");
    }

    /// @notice Two-party check. With both wallets `Valid` the call succeeds; with `sender` in any
    /// non-valid state (and `counterparty` valid) it reverts `NotEligible(sender, requestId)`; with
    /// `counterparty` in any non-valid state (and `sender` valid) it reverts
    /// `NotEligible(counterparty, requestId)`. Ends with both valid and a final success.
    /// @param target The gated contract.
    /// @param callData The ABI encoded call to a function guarded by `gated` and `gatedFor(counterparty)`.
    /// @param sender The caller.
    /// @param counterparty The second party named in the call data.
    /// @param requestId The request id the target is bound to.
    function assertGatedPair(
        address target,
        bytes memory callData,
        address sender,
        address counterparty,
        uint64 requestId
    ) internal {
        _requireReady(target);
        require(sender != counterparty, "GatedTest: sender and counterparty must differ");
        EligibilityStatus[4] memory states = invalidStates();

        mock.setStatus(sender, requestId, EligibilityStatus.Valid);
        mock.setStatus(counterparty, requestId, EligibilityStatus.Valid);
        _expectSuccess(target, callData, sender, "both Valid");

        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(sender, requestId, states[i]);
            mock.setStatus(counterparty, requestId, EligibilityStatus.Valid);
            _expectNotEligible(target, callData, sender, sender, requestId, states[i]);
        }
        for (uint256 i = 0; i < states.length; ++i) {
            mock.setStatus(sender, requestId, EligibilityStatus.Valid);
            mock.setStatus(counterparty, requestId, states[i]);
            _expectNotEligible(target, callData, sender, counterparty, requestId, states[i]);
        }

        mock.setStatus(sender, requestId, EligibilityStatus.Valid);
        mock.setStatus(counterparty, requestId, EligibilityStatus.Valid);
        _expectSuccess(target, callData, sender, "both Valid again");
    }

    /// @notice Human name of a state, for assertion messages.
    function stateName(EligibilityStatus state) internal pure returns (string memory) {
        if (state == EligibilityStatus.NeverIssued) return "NeverIssued";
        if (state == EligibilityStatus.Valid) return "Valid";
        if (state == EligibilityStatus.Expired) return "Expired";
        if (state == EligibilityStatus.Revoked) return "Revoked";
        return "WrongJurisdiction";
    }

    function _requireReady(address target) private view {
        require(address(mock) != address(0), "GatedTest: call _deployMock() in setUp first");
        require(!mock.frozen(), "GatedTest: mock is frozen; the helpers need to set states");
        require(target.code.length != 0, "GatedTest: target has no code");
    }

    function _expectNotEligible(
        address target,
        bytes memory callData,
        address caller,
        address deniedWallet,
        uint64 requestId,
        EligibilityStatus state
    ) private {
        vm.prank(caller);
        // slither-disable-next-line low-level-calls
        (bool ok, bytes memory ret) = target.call(callData);
        assertFalse(
            ok, string.concat("GatedTest: call succeeded while ", vm.toString(deniedWallet), " was ", stateName(state))
        );
        assertEq(
            ret,
            abi.encodeWithSelector(Gated.NotEligible.selector, deniedWallet, requestId),
            string.concat(
                "GatedTest: revert under ",
                stateName(state),
                " was not NotEligible(",
                vm.toString(deniedWallet),
                ", requestId)"
            )
        );
    }

    function _expectSuccess(address target, bytes memory callData, address caller, string memory label) private {
        vm.prank(caller);
        // slither-disable-next-line low-level-calls
        (bool ok, bytes memory ret) = target.call(callData);
        // casting to 'bytes4' is safe: only the selector, the first four bytes, is wanted here
        // forge-lint: disable-next-line(unsafe-typecast)
        if (!ok && ret.length >= 4 && bytes4(ret) == Gated.NotEligible.selector) {
            fail(
                string.concat(
                    "GatedTest: gate still denied with ",
                    label,
                    "; the target is probably bound to a different requestId than the one passed"
                )
            );
        }
        assertTrue(ok, string.concat("GatedTest: call failed with ", label, " for a reason other than the gate"));
    }
}
