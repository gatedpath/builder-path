# Analyser reports

Both run on 12 September 2026 against the sources in `src/` at the commit that added them.
Re-run with `npm run slither` and `npm run aderyn` after any change to `src/`; CI in a scaffolded
project runs both on every push (the scaffolder's `ci.yml`).

## Slither 0.11.6

`slither.md` is the triage; `slither.json` the machine output. Four low results, none changed the
code. Details and reasoning in `slither.md`.

## Aderyn 0.6.8

`aderyn.md` is the tool's own output. Zero high, five low. Triage:

| Finding | Where | Triage |
|---|---|---|
| L-1 Centralization risk (9 instances) | every `onlyRole` function | Intended. A permissioned token has privileged roles by definition. The point of `docs/admin-pattern.md` is where those roles sit: the admin behind a timelock fed by a Safe, the operational roles on Safes, the deployer holding nothing. `test/AdminPattern.t.sol` proves that wiring. |
| L-2 Costly operations inside loop | `distribute` | Intended. The second loop mints, and a mint is a storage write per recipient; that is what a distribution is. The loop is bounded by calldata from an issuer the issuer admin trusts. |
| L-3 Empty block | `_authorizeVerifierChange` | Intended. The body is the `onlyRole(DEFAULT_ADMIN_ROLE)` modifier; the hook exists so `Gated` refuses to compile when a child forgets an owner check. Same triage as receptor-mock's report. |
| L-4 Loop contains require/revert | `distribute` | Read carefully, this is the opposite of what the code does. The first loop skips ineligible recipients without reverting and records each with `_recordDenial`; the second loop only mints to recipients the first loop accepted, so `_update`'s gate cannot revert there. The one revert left inside the loop is OpenZeppelin's own zero-address check in `_mint`, and the zero address is `NeverIssued` on every verifier, so it is skipped in the first loop. Aderyn cannot see through the call. |
| L-5 Unchecked return (4 instances) | `_grantRole` in the constructor | Intended. OpenZeppelin's `_grantRole` returns false when the role was already held, which cannot happen for four distinct roles granted once each at construction. Checking it would add code that can never run. |
