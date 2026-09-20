# Slither report, 12 September 2026

Slither 0.11.6 over `src/` (tests, scripts, forge-std, receptor-mock and OpenZeppelin filtered
out), solc 0.8.30, 102 detectors, 17 contracts. Machine output in `slither.json`. Re-run with
`npm run slither`.

Four results, all low impact, medium confidence. Nothing was changed in response; the
reasoning for each:

| Detector | Where | Triage |
|---|---|---|
| `calls-loop` | `Gated._checkEligible` reached from `GatedERC20.distribute` | Intended. `distribute` asks the verifier once per recipient, twice (once to decide, once before minting), and the verifier is a `view` the token owner chose. The loop is bounded by the caller's calldata, the caller is an issuer with a permission the issuer admin granted, and a recipient list long enough to exhaust the 60 billion block gas limit on Redbelly (RESEARCH.md question 3) is not a realistic input. A hostile verifier could make every call expensive, but a hostile verifier breaks every gate, not only this loop. |
| `timestamp` | `IssuerRegistry.isActiveIssuer` | Intended. The window is measured in hours to years and compared with `block.timestamp`. The seconds a block producer can move a timestamp by do not change whether a permission is open, and Redbelly's DBFT has no single proposer to move it (RESEARCH.md question 5). |
| `timestamp` | `IssuerRegistry.canIssue` | Same comparison through `isActiveIssuer`; a read-only mirror for a UI. |
| `timestamp` | `IssuerRegistry.setIssuer` | Same. `validFrom == 0` means "now", and a window that ends before it opens or before now is refused. |

Two detectors are suppressed inline with `slither-disable-next-line timestamp` where the
comparison is the point of the function (`setIssuer`, `isActiveIssuer`); Slither still reports
the enclosing functions, which is fine.

Not reported and worth stating: no reentrancy result (the only external call from a state-changing
path is the verifier's `view`), no `arbitrary-send`, no `unchecked-transfer`, no shadowing, no
`tx.origin`, no assembly, no `selfdestruct`, nothing at medium or above.
