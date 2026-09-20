# Slither report, 2026-09-12

Slither 0.11.6 over `src/` (tests, forge-std and OpenZeppelin filtered out), solc 0.8.30,
102 detectors, 9 contracts. Machine output in `slither.json`. Re-run with `npm run slither`.

Three results, all informational. Nothing was changed in response; the reasoning for each:

| Detector | Where | Triage |
|---|---|---|
| `unimplemented-functions` (informational, high confidence) | `Gated._authorizeVerifierChange()` | Intended. `Gated` is abstract and the hook is deliberately left without a body so a child that forgets to wire it to an owner fails to compile. `test/examples/GatedCounter.sol` shows the `onlyOwner` wiring. |
| `dead-code` (informational, medium confidence) | `Gated._requireEligible(address)` | False positive. The function is the body of both the `gated` and `gatedFor` modifiers; Slither does not count modifier use in an abstract contract whose children sit outside the filtered paths. |
| `dead-code` (informational, medium confidence) | `Gated._recordDenial(address)` | Intended. It is the non-reverting denial hook for kits that skip instead of revert (a gated ERC-20 will use it). `GatedCounter.tryIncrement` exercises it in the tests. |

One detector is suppressed inline: `timestamp` on the single `block.timestamp >= expiresAt`
comparison in `ReceptorMock.eligibilityStatus`. The comparison is the point of the mock's expiry
model and the contract is a test tool, never a production gate.
