# Threat model

A stub with the headings from PLAN.md section 6 of the Redbelly Development Tool. Fill each
section before the first mainnet deploy; the ship report links here.

## Plan

What the asset is, who the parties are, which jurisdictions apply, and the eligibility rule
in one plain sentence. What the credential must prove and what it must never reveal.
Revocation policy: this template keeps a revoked holder's balance in place and lets the
compliance role move it with a justification hash. Confirm or change that here.

## Design

Privileged roles (admin, pauser, compliance officer, issuer admin, time-boxed issuers) and every external dependency
(verifier contract, the network's permission gate, RPC providers). Redbelly-specific threats
to address:

- Verifier contract is a dependency you did not write: pinned, monitored, with an upgrade plan.
- Wallet compromise equals identity impersonation: admin behind a Safe, hardware wallets for
  high-value actions.
- Credential expiry and revocation races: a transfer approved at block N against a credential
  revoked at N+1. Decision and test.
- RPC trust: one official endpoint; critical reads cross-checked against a second provider.
- No reorgs and no confirmation margin: off-chain consumers treat inclusion as final and are
  idempotent.
- Fixed-USD gas removes fee-market games but not gas-limit exhaustion inside one transaction.
- Cross-environment replay between 153 and 151: EIP-712 signatures include the chain id.

## Build

Compiler warnings as errors, checks-effects-interactions, custom errors, events on every
state change a monitor cares about, no `tx.origin`, no `selfdestruct`, no inline assembly
without a comment and a test.

## Test

Unit, fuzz and invariant suites; five credential states on every gated function. Coverage
report location and the number.

## Review

Slither and Aderyn findings, each fixed or kept with a written reason. Second-person review
record. Audit scope and report when there is one.

## Deploy

Pre-flight output, deployment record (`contracts/deployments/`), Routescan verification
links, Safe address and threshold, timelock if any.

## Operate

Monitored events (paused, forced transfer, role change, verifier change), on-call contact,
`security.txt`, disclosure address, rehearsed pause procedure, quarterly review date.
