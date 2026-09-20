# @gatedpath/receptor-mock

```
For agents
- Gate a function with `Gated`: inherit it, apply `gated` (caller) or `gatedFor(addr)` (second party),
  and implement `_authorizeVerifierChange()` with your owner check. Missing hook = compile error.
- Never weaken a gate to make a test pass. Put the wallet into `Valid` on `ReceptorMock` instead.
- Every gated function gets `assertRevertsForAllInvalidStates(target, callData, wallet, requestId)`
  from `test/GatedTest.sol`; two-party functions get `assertGatedPair`. Five states, no exceptions.
- Production points `Gated` at an adapter (`Iden3VerifierAdapter` or `VCVerifierAdapter`) over the
  dApp's own deployed verifier. `ReceptorMock` refuses to deploy on chain 151.
- Pins: solc 0.8.30, EVM prague. `npm run setup` then `forge test`. Fork: `npm run test:fork`.
- No private keys, no wallet creation, no funded transactions anywhere in this package.
```

The local development kit's identity half (`PLAN.md` sections 5.3 and 5.5, Phase 1 deliverable (c)):
a mock verifier that puts any wallet into any of five credential states, the `Gated` base contract
every template gates with, adapters that present a real verifier through the same interface, and a
Foundry test base that proves a gate against all five states so nobody forgets one. Solidity
0.8.30, EVM Prague, 222 lines of source, no runtime dependencies in `src/`.

## Why an interface

There is no network-wide verifier on Redbelly to pin (RESEARCH.md question 8). Each dApp deploys
its own: either an Iden3 `ZKPVerifier`-family child for Proof by Query, or a `VCVerifierBaseContract`
child for standard credentials. Those two families expose different read functions, and the Iden3
one has changed shape three times. `Gated` therefore binds to one small interface of our own,
`IRedbellyVerifier`, and an adapter or the mock sits behind it:

```solidity
function isEligible(address wallet, uint64 requestId) external view returns (bool);
function eligibilityStatus(address wallet, uint64 requestId) external view returns (EligibilityStatus);
```

Swapping the mock for a real verifier is one `setVerifier` call by the owner, and the gated
contract does not recompile. Real verifiers only know accepted or not, so `eligibilityStatus` is a
mock and testing aid: adapters return `Valid` or `NeverIssued` only, and production logic must not
branch on the other values.

## The five states

`EligibilityStatus { NeverIssued, Valid, Expired, Revoked, WrongJurisdiction }`, with `NeverIssued`
at zero so an unset mapping slot reads as no credential. What each stands for in Receptor terms, and
how a real verifier would surface it (always as a plain false):

| State | Receptor meaning | Where a real verifier would catch it |
|---|---|---|
| `NeverIssued` | The wallet holds no credential of the requested type, or never submitted a proof | No proof recorded for `(wallet, requestId)` |
| `Valid` | An accepted proof for the request is on record | `isProofVerified` (or equivalent) true |
| `Expired` | The credential's validity window has closed | Proof generation fails against the expiry claim; on the VC path `validUntil` is in the past |
| `Revoked` | The issuer revoked the credential; Iden3 revocation status in the reverse hash service | Proof generation fails the revocation check unless `skipClaimRevocationCheck` was set, which the docs say never to do in production |
| `WrongJurisdiction` | The claim does not satisfy the query, or the issuer is not in `allowedIssuers` | The on-chain query (for example `country $eq "AUS"`) rejects the proof |

The mock models time too: `setValidUntil(wallet, requestId, expiresAt)` makes a wallet `Valid`
until `block.timestamp` reaches `expiresAt`, then `Expired`, so `vm.warp` tests work without
touching the mock again.

## What is in `src/`

`IRedbellyVerifier.sol` is the interface and the enum.

`Gated.sol` is the abstract base: one verifier, one request id, a `gated` modifier for the caller
and `gatedFor(address)` for a second party, a `NotEligible(wallet, requestId)` custom error,
`VerifierChanged` and `RequestIdChanged` events, `isEligible(address)` as a public view, and
`setVerifier` / `setRequestId` behind the abstract `_authorizeVerifierChange()` hook that the child
wires to `Ownable`, `AccessControl` or a Safe. An event cannot survive a revert, so the reverting
path emits nothing; `_checkEligible` (non-reverting) and `_recordDenial` (emits `EligibilityDenied`)
exist for kits that skip instead of revert. That matters here more than on Ethereum: the governors
RPC serves no trace methods, so a reverted transaction's error data is gone once it is mined.

`ReceptorMock.sol` implements the interface for tests and Anvil forks. `setStatus` per
`(wallet, requestId)`, `setStatusAll` for a wallet across every request id (an exact record wins
over the wildcard), `setValidUntil` and `setValidUntilAll` for expiry, `clearStatus` and
`clearStatusAll`, events on every change, and `freeze()`, after which every setter reverts so a
test cannot loosen the mock mid-run. The constructor reverts on chain 151.

`adapters/Iden3VerifierAdapter.sol` wraps a deployed Iden3 verifier. Pick the `Surface` matching
the release it was compiled from: `ZKPVerifierV1` reads the public `proofs(address,uint64)` mapping
of `@iden3/contracts` 1.x (the shape in Redbelly's docs example), `ZKPVerifierV2` calls
`isProofVerified(address,uint64)` from 2.x, `VerifierV3` calls `isRequestProofVerified(address,uint256)`
from 3.x. A revert from the target (2.x and 3.x revert for an unknown request id) reads as not
eligible, so a misconfigured surface fails closed. The Iden3 packages pin `pragma solidity 0.8.27`
exactly and cannot be imported into a 0.8.30 build, which is why the adapter restates the one
function it needs from each release.

`adapters/VCVerifierAdapter.sol` wraps a `VCVerifierBaseContract` child that follows Redbelly's
archived example and exposes `verificationStatus(address)`. The VC path has no request id (one
contract per credential type), so `requestId` is ignored; deploy one adapter per verifier.

## Swapping the mock for a real verifier

```solidity
// development and tests
ReceptorMock mock = new ReceptorMock();
MyToken token = new MyToken(mock, REQUEST_ID);

// testnet, once the dApp's own verifier is deployed and the request is set on it
Iden3VerifierAdapter adapter = new Iden3VerifierAdapter(verifierAddress, Iden3VerifierAdapter.Surface.ZKPVerifierV2);
token.setVerifier(adapter);   // owner only; emits VerifierChanged
```

Check `token.isEligible(wallet)` from the frontend before offering the action; the same read the
gate makes.

## Testing your own gated contract

```solidity
import {GatedTest} from "@gatedpath/receptor-mock-test/GatedTest.sol";

contract MyTokenTest is GatedTest {
    function setUp() public { _deployMock(); token = new MyToken(mock, REQUEST_ID); }

    function test_mintFiveStates() public {
        assertRevertsForAllInvalidStates(address(token), abi.encodeCall(token.mint, (100)), alice, REQUEST_ID);
    }

    function test_transferBothParties() public {
        assertGatedPair(address(token), abi.encodeCall(token.transfer, (bob, 1)), alice, bob, REQUEST_ID);
    }
}
```

The helpers set each non-valid state on `mock`, call the target as the wallet, assert the revert is
exactly `NotEligible(wallet, requestId)`, then set `Valid` and assert success. Call data must be
safe to repeat. If the target is bound to a different request id than the one you pass, the
failure message says so. `test/examples/GatedCounter.sol` is the worked example, with
`increment()` (caller), `nudge(to)` (both parties) and `tryIncrement()` (non-reverting, logs the
denial).

## Installing

From a fresh clone of this repository:

```
cd packages/receptor-mock
npm run setup          # npm ci (OpenZeppelin 5.6.1, Hardhat 2.29.1) + forge-std v1.16.2 into lib/
forge test             # 34 tests, 1 skipped (the fork suite)
npm run test:fork      # adds the two fork tests against governors.testnet.redbelly.network
```

Dependencies are pinned two ways on purpose. OpenZeppelin comes from npm with a lockfile because
Hardhat needs it there anyway. forge-std is cloned by `forge install --no-git` at a pinned tag
because a git submodule would write `.gitmodules` at the root of this repository, which belongs to
a preserved work record, and soldeer's client could not reach its registry through the session
proxy. `lib/` and `node_modules/` are ignored by git; `scripts/setup.sh` recreates both.

As a dependency of another Foundry project:

```
forge install <this repository>            # or copy packages/receptor-mock into lib/receptor-mock
```

with these lines in the consumer's `remappings.txt`:

```
@gatedpath/receptor-mock/=lib/receptor-mock/src/
@gatedpath/receptor-mock-test/=lib/receptor-mock/test/
```

`src/` imports nothing outside itself, so it compiles in any 0.8.30 project. The test base needs
forge-std; the example needs OpenZeppelin. `hardhat/` shows the same five contracts compiling under
Hardhat 2.29.1 with the same pins; see its README.

## Static analysis and gas

`npm run slither` and `npm run aderyn` write to `reports/`. Slither 0.11.6: three informational
results, all intended or false positives, each triaged in `reports/slither.md`. Aderyn 0.6.8: no
findings. `.gas-snapshot` is committed; `forge snapshot --check` diffs against it.

## What is verified and what is not

Verified on 2026-09-12 and logged in `RESEARCH.md`: the Iden3 read functions in `@iden3/contracts`
1.4.8, 2.5.0, 3.4.0 (npm `latest`) and master at commit 610249b (15 June 2026); the Redbelly docs
pages for Receptor, Proof by Query, the contract example and eligibility criteria; the archived
`receptor-verifier-contract-example` and its deployment on chain 153, which answers the
`verifyCredential(string,string,string)`, `verificationStatus(address)` and `credentialType()`
selectors and returns true for the sample credential's wallet.

Not verified, marked **verify**: the ABI of `VCVerifierBaseContract` itself. It ships only in a
GitHub Packages npm package that refuses unauthenticated reads. The VC adapter is coded against the
child getter the example exposes, not against the base. Also unknown: which `@iden3/contracts`
release Redbelly's own verifier backend deploys from (RESEARCH.md question 29), so the adapter
supports all three and the builder picks.

## Last verified

2026-09-12, from a cloud session with Redbelly's hosts allowed. `forge test`: 34 passed, 0 failed,
1 skipped. `forge test --fork-url https://governors.testnet.redbelly.network`: 36 passed (the fork
suite read `permission.isAllowed` through the bootstrap registry and ran the five-state helper
against a counter deployed on the fork). Hardhat: 5 files compiled, evm target prague. Foundry
1.5.1-stable.
