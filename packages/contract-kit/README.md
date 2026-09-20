# @gatedpath/contract-kit

```
For agents
- Contract kit v1: `src/GatedERC20.sol` (the token) and `src/IssuerRegistry.sol` (who may mint,
  time-boxed). Both parties of every movement must be eligible; the check is `Gated._requireEligible`
  inside `_update`, the same one `gatedFor` wraps. Never weaken it to make a test pass.
- Roles: DEFAULT_ADMIN (timelock), PAUSER, COMPLIANCE, ISSUER_ADMIN (Safes). The constructor takes a
  `Roles` struct; zero for an operational role means "same as admin". Deployer ends with nothing.
- `forceTransfer` needs a non-zero `bytes32` justification hash and an eligible recipient.
  `distribute` skips ineligible recipients and logs each with `EligibilityDenied`; it does not revert.
- Tests: `npm run setup` once, then `forge test` (51 tests: five-state, fuzz, two invariant suites,
  registry, admin pattern). Reports: `npm run slither`, `npm run aderyn`, `forge snapshot`.
- The scaffolder copies `src/` and `test/` from here into every `gated-erc20` project; keep
  `abi/GatedERC20.json` in step with `npm run abi:export`.
- No private keys, no funded transactions, nothing signed here. Deploy with `--account <keystore>`.
```

The contract kit from `PLAN.md` section 5.5, first release: a gated ERC-20 that is small, on
OpenZeppelin 5.6.1, tested against every credential state, analysed by Slither and Aderyn, and
wired to an admin pattern with a written emergency path. Solidity 0.8.30, EVM Prague, 173 lines of
source, no dependencies outside OpenZeppelin and `@gatedpath/receptor-mock`.

## What is in it

| File | What |
|---|---|
| `src/GatedERC20.sol` | The token: both-party gating in `_update`, `subscribe`, `burn`, issuer `mint` and `distribute`, `forceTransfer` with a justification hash, pause with split roles, `can*` views for a UI |
| `src/IssuerRegistry.sol` | Abstract mixin: per-issuer window and allowance, `setIssuer`, `revokeIssuer`, `_consumeIssuance` |
| `script/Deploy.s.sol` | Deploys a `TimelockController` fed by a Safe and the token with the admin role on the timelock; refuses an EOA or a mock verifier on 151 |
| `test/` | `GatedERC20.t.sol` (21), `GatedERC20.fuzz.t.sol` (4 at 512 runs), `GatedERC20.invariants.t.sol` (two suites, 12), `IssuerRegistry.t.sol` (7), `AdminPattern.t.sol` (7) |
| `docs/` | One page per module: `gated-erc20.md`, `issuer-registry.md`, `compliance.md`, `pause.md`, `admin-pattern.md`; and `erc-3643.md`, when to use T-REX instead and how Receptor maps onto it |
| `reports/` | Slither 0.11.6 and Aderyn 0.6.8 output with every finding triaged in `README.md` and `slither.md` |
| `abi/GatedERC20.json` | The ABI from `forge build`, exported by `npm run abi:export` and checked by the scaffolder's tests |
| `.gas-snapshot` | `forge snapshot` at the commit that added it |

## Run it

```
npm run setup     # OpenZeppelin from npm, forge-std at v1.16.2, lib/receptor-mock -> ../receptor-mock
forge test
forge snapshot --check
npm run abi:check
npm run slither && npm run aderyn
```

Deploy to a fork or testnet with a keystore name, never a key:

```
anvil --fork-url https://governors.testnet.redbelly.network --chain-id 153
ADMIN_SAFE=0x... forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --account <keystore-name> --broadcast
```

On chain 151 the script refuses unless `ADMIN_SAFE` answers `VERSION()` `1.4.1` with a threshold of
at least two, `VERIFIER` is set, and `TIMELOCK_DELAY` is at least one day. The scaffolder's project
adds the rest of the pre-flight (`permission.isAllowed` on the deployer, the canonical singleton
check); run `redbelly-preflight` before any mainnet broadcast.

## The rule, in one paragraph

Every mint, burn and transfer goes through `_update`, which asks the verifier about the wallet
losing tokens and the wallet gaining them, never about a spender. A wallet in any of the four
non-valid states (`NeverIssued`, `Expired`, `Revoked`, `WrongJurisdiction`) is refused with
`NotEligible(wallet, requestId)`. The compliance officer's `forceTransfer` skips the check on the
sender only; the recipient must still be eligible and the call must carry the hash of the document
that authorised it. `distribute` is the one place a denial does not revert: ineligible recipients
are skipped and each skip is an `EligibilityDenied` event, because on Redbelly a reverted
transaction's reason is not recoverable after the fact (no trace RPC) and an issuer paying a list
needs to know who was left out.

## What the tests hold it to

Every gated function against all five credential states through `GatedTest`; the both-party rule on
`transfer`, `transferFrom`, `mint`, `forceTransfer` and `distribute`; four fuzz properties at 512
runs; and two invariant suites at 64 runs of depth 32 over a handler that subscribes, mints,
distributes, transfers, burns, forces, pauses, re-issues and changes credentials at random: supply
equals the sum of balances and equals mints minus burns, nobody ever receives tokens while
ineligible, nothing moves while paused, every forced transfer carries a hash, the issuer never
exceeds its allowance, and (in the suite where credentials never lapse after receipt) no ineligible
wallet ever holds a balance. The `docs/gated-erc20.md` page says why the last one needs that
qualifier.

## Where it came from

The scaffolder's `gated-erc20` template was the starting point (12 September 2026, `PLAN.md`
section 16). It moved here rather than being forked: `create-redbelly-dapp` now copies `src/` and
`test/` from this package into each project it writes, and its integration test builds and runs
them, so there is one copy. What was added on the move: the issuer registry (the template had a
plain `MINTER_ROLE`), the justification hash instead of a string, the pauser and issuer-admin roles,
`burn`, `distribute` with `_recordDenial`, `canTransfer`, the second invariant suite, the timelock
deploy script and the admin pattern tests, and the analyser reports.

## Not in v1

Gated ERC-721 and ERC-1155 (the scaffolder still refuses those templates with the list of what they
need), partial freezes, wallet recovery, `permit`, upgradeability. `docs/erc-3643.md` covers the
first three by pointing at the standard that has them.
