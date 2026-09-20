# Security

## Reporting

Email the address in `security.txt` (put one there before mainnet) or open a private
advisory on the repository. Say what you found, how to reproduce it, and which chain and
addresses it concerns. Expect an acknowledgement within two working days. Don't open a
public issue for anything that could move funds or bypass eligibility.

## What this project does about security

The programme in PLAN.md section 6 of the Redbelly Development Tool, applied here:

- Every gated function has tests in all five credential states (valid, expired, revoked,
  wrong jurisdiction, never issued) on `GatedTest`. A gate with fewer is untested and CI
  won't hide it: the test files are part of the build.
- Fuzz and invariant suites run in CI on every push. Slither and Aderyn run too; a finding is
  fixed or written up in THREAT-MODEL.md with the reason it stays.
- Admin roles belong to a Safe 1.4.1 with a threshold of two or more. The deploy script
  refuses chain 151 otherwise, and `npm run preflight` shows the refusal before anything is
  signed.
- No private key is read from a file, an environment variable or a prompt. Deploys sign with
  `forge script --account <keystore-name>` or a hardware wallet.
- The verifier address is a constructor argument and changes only through
  `_authorizeVerifierChange`, which the admin role controls. Monitor `VerifierChanged`.
- Compiler and EVM are pinned (solc 0.8.30, Prague) in `contracts/foundry.toml` and
  `hardhat/hardhat.config.ts`. Warnings are errors.

## Before mainnet

Pre-flight passes, the ship report exists (see the README), and someone other than the
author has read every contract. For anything holding real value, an external audit; Hashlock
already knows this network.
