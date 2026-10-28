# Card 9, Grant milestone escrow, the agent track: run of 2026-10-17

## Verdict (updated 23 October 2026)

**Deployed on testnet and verified on Routescan.** On 23 October 2026 the owner deployed the escrow to
chain 153 from her dev wallet (`0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59`, a keystore in her own
Terminal, the key never in a file or the chat), following Part 5 of the deploy draft: pre-flight 9 of 9,
the ship report (every check, 89 tests with `GrantEscrowTest` counted among the five-state suites,
`ship-153-2026-10-23.md` beside this record), then
`VERIFIER=0x2E652B946DC303d8f53bC92D0787e13B109003e5 forge script script/DeployGrantEscrow.s.sol --rpc-url
redbelly_testnet --account rbn-testnet --sender <her address> --broadcast`. `GrantEscrow` at
**0x57B3848Dabd2488495Af156e7b198f19eF32D395**, transaction
`0x162dcbfe7ae40c250ca6f307cabaee341b2faa13cf07807bc6f9971cc2e91519`, block 3,055,920 (15:33:27 UTC),
1,476,223 gas at 304,859.46 gwei, 450.04 test RBNT (balance 40,683.77 to 40,233.73, read from chain).
Source verified the same hour with `forge verify-contract` against Routescan's testnet URL, the constructor
arguments taken from `deployment-153-GrantEscrow.json` ("Pass - Verified" after one "Pending in queue").

Her choice for the verifier: the escrow reuses the `ReceptorMock` the scaffold's token deployed earlier
the same day (`cards/runs/2026-10-23/scaffold-token.md`), passed through `VERIFIER`, rather than a mock
of its own. The mock keys eligibility by wallet and request id, so the escrow's request 100 sits beside
the token's request 18 on one contract, and one mock is administered for every project on the grid. It
saved about 214 test RBNT against the fork run's figure. The reviewer was left to default to the admin.
Read back live after the deploy: `requestId()` 100, `verifier()` the shared mock, the deployer holds
`REVIEWER_ROLE`. No grant has been funded yet: that needs a stablecoin on 153 (a real one, or the test
`MockStable` deployed by hand), and is the live-use step, hers to sign. Two notes from the run: the
vendored 0.2.1 ship report reads `VERIFIER` from `.env` only, so it still warned "No VERIFIER" although
the deploy script read it from the environment (0.2.3: read both); and the first ship run failed on
`deployer-verified` because the password prompt timed out at 60 seconds, which is the prompt doing its
job, with a second run passing. Files added beside this record: `deployment-153-GrantEscrow.json`,
`broadcast-153-run-latest.json`, `ship-153-2026-10-23.md`.

The verdict of 17 October stands below as written then.

## Verdict, 17 October 2026

Proven on a fork of testnet, and not further. One new contract, `GrantEscrow`, compiles under the
scaffold's strict linter with no warning at all (the first build was clean; `deny = "warnings"` never
fired), `forge fmt --check` is clean after one reflow, 89 tests pass in 8 suites (the default
template's 68 and 21 new ones, one of them a fuzz over tranche counts and amounts), pre-flight
clears 6 of 7 (the one failure is `DEPLOYER is a public address`, which the shared step says to
expect before a wallet is set), and the escrow's whole life was rehearsed on a local fork of
testnet against the five seeded accounts: a deposit of 30,000 mUSD in three tranches, the grantee's
acceptance through the gate, two releases with their notes read back from storage and from the log,
three refusals (release before acceptance, release by the funder, acceptance by a Revoked wallet),
a cancellation that returned 2,000 mUSD to the funder, and a third tranche held when the grantee's
credential was revoked. Slither and Aderyn were run; nothing in the escrow needed a change (see
"Not done" for the triage).

Timings. The scaffold: `npm create redbelly-dapp@latest card-9 -- --yes` finished inside the second
the shell timer could measure (the 0.2.1 tarball was already in the npm cache), `npm install` 20 s,
`npm run contracts:install` 2 s, `npm run test` 3 s for the baseline's 68 tests, and 1 s for the
89 after. The fork loop was ready in 21.5 s on its first start (6.3 s of that forking testnet at
block 3,052,396) and 3.4 s on its second, from the cached fork. The rehearsal ran in 7 s, pre-flight
in 1 s. From the first green commit of the contract and its tests to the end of the rehearsal:
2 min 29 s (16:55:34 to 16:58:03 local time). From the baseline commit to that first green commit
the clock says 2 h 9 min, most of it a pause: the agent was rate-limited after reading the scaffold
and resumed when the limit lifted; the reading, writing and testing of the contract itself were a
fraction of that, and this record does not pretend to know the exact fraction.

What the prompt asks for and this run did not do: nothing. The prompt asks for the build and names
no network, no verification and no interface. What the builder path's own standard asks for beyond
the prompt and this run did not do: the deploy to testnet and the verification on Routescan (both
need a wallet-signed transaction, and the agent signs nothing on a real network), and a web page.
The card therefore says "proven on a fork" beside its date. Nothing was signed or sent to a real
network; the fork ran as chain 31337 and every sender was an unlocked Anvil test account (indices
3, 5, 7, 8 and 9; never 0 or 1).

Agent: Claude Code (Claude Fable 5.1). One agent; the plan asks for two.
Machine: the owner's Mac, Node v24, Foundry 1.7.1, Slither 0.11.6, Aderyn 0.6.8. Project: a fresh
scaffold made the same afternoon from the published packages, `npm create redbelly-dapp@latest
card-9 -- --yes` (the default `gated-erc20` template), `npm install`, `npm run contracts:install`,
committed as the baseline before the card began (68 tests green). The scaffold's own files are
untouched: `git diff --stat` against the baseline shows additions only, six files, and `npm run dev`
still deploys the template's `GatedERC20` exactly as shipped.

## Where the card comes from

Card 9 is the plan's grant escrow, the first card whose recipe is `any`: the funder decides what a
grantee has to prove, and the escrow will not release money to a wallet that cannot prove it. The
card's page says it teaches roles, tranches and a written record on chain, and picking the recipe
yourself. This run picked one and says why below.

## The prompt, as run

> Build an escrow where a funder deposits stablecoin, a grantee proves eligibility, and a reviewer
> role releases tranches against milestones with an on-chain note per release.

## The recipe, and why

`recipes/accredited-issuer/`, request id 100: a credential of one named type from one named Redbelly
accredited issuer, the worked condition being an AML/CTF check that passed. A grant programme paying
stablecoin to a wallet wants exactly that from its grantee: not an age, not an investor
classification, but a check by an issuer the programme has chosen to trust. The recipe's
WrongJurisdiction state is the grant case in one line: a real credential from the wrong issuer is
refused exactly like no credential. The other three were considered and set aside. `over-18` says
nothing a grant funder cares about. `au-wholesale-investor` is about who may invest, and a grantee
is paid, not investing. `business-delegate` fits a grantee that is a company, but its mechanism is a
`hasRole` read on a `BusinessIdentifier` contract with no request id, so it does not bind to the
scaffold's `Gated` base the way the five-state helper expects; a company grantee is a variation for
another run. The id is the deploy script's default and `npm run dev -- --request-id 100` seeds the
five Anvil wallets for it, so the escrow and the local loop agree without a `.env`.

## What was built (files beside this record)

`src/GrantEscrow.sol`, 247 lines, on `AccessControl` and the scaffold's `Gated`:

- Roles the way the kit's token does them: a `Roles` struct in the constructor, `DEFAULT_ADMIN_ROLE`
  for the timelock (verifier and request id changes, role grants; `_authorizeVerifierChange` is
  `onlyRole(DEFAULT_ADMIN_ROLE)`), `REVIEWER_ROLE` for a Safe (releases and cancellations), a zero
  reviewer falling back to the admin, a zero admin refused. One test stands the whole admin pattern
  up: a `TimelockController` as admin, a Safe address as reviewer, the Safe releasing at once and a
  request id change waiting out the two-day delay.
- `fund(grantee, token, amount, tranches)`: anyone deposits, through `SafeERC20.safeTransferFrom`
  after approving the escrow. The tranche list is fixed at funding, must sum to the amount, has no
  zero tranche and at most `MAX_MILESTONES` (24) entries, so the only loop has a ceiling the caller
  cannot raise. Funding is not gated: the funder is naming a wallet, not receiving anything.
- `accept(grantId)`, `gated`: the grantee's own call, the proof that the wallet the funder named can
  pass the recipe. Only the named grantee, once, and not after a cancellation.
- `release(grantId, note)`, `onlyRole(REVIEWER_ROLE)`, and the gate run again on the grantee at the
  moment the money leaves: a credential that lapsed between milestones holds the next tranche until
  it is valid again. Tranches go out in order; an empty note is refused; the note is stored in full
  beside its tranche and emitted in `Released`, so the explorer and a plain `eth_call` both give the
  reviewer's words back. No trace method is needed, which matters on a chain whose RPC serves none.
- `cancel(grantId, note)`, `onlyRole(REVIEWER_ROLE)`: the one way the remainder leaves. Everything
  not yet released goes back to the funder with the reviewer's note; released money is never clawed
  back; a grant with nothing left cannot be cancelled. Before or after acceptance.
- Reads for a UI: `grant`, `milestone`, `milestoneCount`, `remainder`, `canRelease` (a mirror of the
  release conditions, not a substitute for the gate).
- Named errors for every refusal, so the web kit's `FailureWords` and a block explorer can say what
  happened.

Also `script/DeployGrantEscrow.s.sol` (the scaffold's pre-flight, then the one contract; reads
`VERIFIER`, `REQUEST_ID` defaulting to 100, `REVIEWER` and `ADMIN_SAFE`, all public addresses;
deploys a `ReceptorMock` off mainnet when no verifier is set, and says so in capitals),
`test/GrantEscrow.t.sol` (21 tests), `test/mocks/MockStable.sol` (a six-decimal ERC-20 standing in
for the stablecoin; tests and rehearsal only), and `scripts/rehearse-escrow.sh`. The outputs beside
this record: `test-output.txt` (the 89), `rehearsal-output.txt`, `dev-loop-output.txt` (the fork
loop's table of the five seeded wallets), `preflight-output.txt`, `slither-findings.txt` and
`aderyn-report.md`.

The tests, in the shape the scaffold asks for. The grantee's gate at `accept` through
`assertRevertsForAllInvalidStates` (NeverIssued, Expired, Revoked, WrongJurisdiction refused with
`NotEligible(grantee, 100)`, Valid accepted); the same four states refused at `release` and the
Valid one paid; an expiry set with `setValidUntil` and read at the moment of the second release
after `vm.warp`. The deposit and its record. Two releases with their notes, in order, then the third
and the refusal of a fourth. An empty note refused. A release by the funder, the grantee, a stranger
and the admin refused with `AccessControlUnauthorizedAccount`. The remainder: a cancellation after
one release returning the rest to the funder, a cancellation before acceptance returning all of it,
a credential revoked after a release holding the money until either the credential comes back or
the reviewer cancels. Two grants on one contract not mixing. The fuzz: one to six tranches of random
size, all released, the grantee's gain equal to the deposit and the escrow empty.

## What the run found

**1. "A grantee proves eligibility" can mean two moments, and the escrow should mean both.** The
prompt reads as one act. This run gated two: the grantee's own `accept`, and the gate run again on
the grantee at every `release`. The second is the one that protects the funder's money, because a
credential can be revoked or expire between milestone one and milestone two, and a release that
checked only acceptance would pay a wallet the issuer has since refused. The card's page should say
this is what "proves eligibility" means here; the prompt can stay as it is, but a stranger reading it
could build the acceptance check alone and believe the card done.

**2. The prompt says nothing about the remainder, and an escrow is mostly about the remainder.**
This run chose: the reviewer, and only the reviewer, can end a grant, and the unreleased balance
goes back to the funder with a note. The funder has no exit of their own, so a funder cannot pull a
grant out from under a grantee who has done the work; and a grantee whose credential lapses is not
paid, but the money is not taken from them either until the reviewer says so. The cost of that choice
is that an absent reviewer holds the money still; the admin (the timelock) can grant a new reviewer,
which is the admin pattern doing its job. A rewording of the prompt could add "and what happens to the
remainder" so every run has to answer it; or the card's page can carry this run's answer as one
reasonable one.

**3. "Any recipe" is a decision the prompt hands to the builder, and the record has to carry it.**
The choice and its reasons are the section above. A stranger running this card gets no recipe from
the prompt and has to read `recipes/` first; the card's "what it teaches" says as much, so this is
by design, but the project page should say which recipe the reference run picked so a second agent
can agree or argue rather than guess.

**4. Pre-flight's secret scanner reads the rehearsal output.** The first `npm run preflight` cleared
5 of 7: the new failure was `rehearsal-output.txt (hex64)`, because transaction hashes are 64 hex
characters, the shape of a private key, and the scanner reads every file in the tree, tracked or not.
The output was moved out of the scaffold (it lives beside this record), the rehearsal script's
header now says why, and pre-flight is at 6 of 7 with only the expected failure. Card 13's record
kept its output in the project; whichever way that run avoided this, the shared "how to repeat it"
step should say to save the output outside the tree.

**5. `cast logs --from-block 0` is refused on a fork.** Anvil answers "requested too large block
range" for a range that starts before the fork point. The rehearsal records the block number it
started at and reads the log from there. One line, worth knowing before a first run.

**6. The linter did not bite, and `forge fmt` bit once.** The strict linter (a warning fails the
build) accepted the contract on its first build. `forge fmt --check` wanted the six-parameter
`Funded` event one parameter per line. Card 13 found the opposite (a `view` warning, format clean).

**7. The local loop still expects one `Gated` contract, and the second script beside it is the
right shape.** `npm run dev -- --request-id 100` deployed the template's token, seeded the five
wallets for request 100 and wrote the `ReceptorMock` address to `deployments/local.json`; the
rehearsal then deployed the escrow through its own script with `VERIFIER` pointed at that mock, so
the seeded states applied to the escrow without a second mock. The same finding as card 13's
number 5, confirmed from the other side: a second contract sits beside the template's and shares
its verifier.

**8. Real stablecoins are plain, and the escrow assumes it.** `fund` records `amount`, not the
balance it received. A fee-on-transfer or rebasing token would make `remainder` wrong. USDC-style
coins do not do this, and a grant programme chooses its coin, but the threat model should name the
assumption. Not changed in this run.

**9. Static analysis has nothing on the escrow that needs a change, and two lines worth reading.**
Slither's two escrow results are `uninitialized-state` on the `_milestones` mapping (a mapping to a
dynamic array cannot be initialised; Slither says this about every such mapping) and
`uninitialized-local` on `sum` in `fund` (Solidity zeroes it; an explicit `= 0` would quiet the
tool). Aderyn's five are centralisation (the two roles, which are the design), the bounded loop in
`fund` (a `push` and a `revert` inside it, 24 iterations at most), the empty `_authorizeVerifierChange`
body (the kit's own pattern) and the unchecked `_grantRole` returns in the constructor (the kit's own
pattern). The files beside this record carry both reports.

**10. The fork is deterministic between starts.** The second `npm run dev` reused the cached fork at
the same block and produced the same mock, token and escrow addresses as the first, so a record of
addresses from one rehearsal holds for the next on the same machine. Useful for a terminal recording.

**11. Gas, for the page's "few transactions, each one carrying real value."** On the fork: `fund`
with three tranches 280,925 gas; `accept` 58,353; the first `release` 216,801 (the first write of a
40-byte note and the grantee's zero-to-nonzero balance), the second 165,609; `cancel` 74,912. At
Redbelly's dollar pricing (US$0.01 per 21,000 gas) the dearest of those is about thirteen cents.
Fees on a fork mean nothing in RBNT; these are gas counts only.

## The rehearsal, as it ran (`rehearsal-output.txt`)

The transcript beside this record was regenerated by the lead on 17 October from the same script (`rehearse-escrow.sh`) on a fresh fork at block 3,052,397, after the agent's original was overwritten by another run's file; the steps and the refusals are the ones described below, with the fork block one higher.

Twelve steps on a fork of testnet (chain 31337, fork of 153 at block 3,052,396), every signer an
unlocked Anvil account: the mock stablecoin deployed from account 7; the escrow deployed through its
script with the seeded `ReceptorMock` as verifier, request id 100, account 9 as reviewer, the
pre-flight's identity check skipped as the script says it is off 151 and 153; 100,000 mUSD minted
to account 8 and the escrow approved; 30,000 mUSD deposited for account 3 (Valid) in tranches of
10,000, 15,000 and 5,000, `canRelease` false; a release before acceptance refused `NotAccepted(1)`;
account 3 accepting through the gate, `canRelease` true; a release by the funder refused
`AccessControlUnauthorizedAccount`; tranche 1 released with "milestone 1: repository public, CI
green" and tranche 2 with "milestone 2: testnet deploy verified on Routescan", the grantee at
25,000 and the remainder at 5,000, both notes read back from storage and both `Released` events
on the log with the words in their data; a second grant of 2,000 for account 5 (Revoked) whose
`accept` was refused `NotEligible(0x9965…, 100)`; that grant cancelled with a note and the funder's
balance up by 2,000; account 3's credential set to Revoked and the third release refused
`NotEligible(0x90F7…, 100)`, the escrow still holding grant 1's 5,000.

## Not done

- ~~**Testnet deploy and Routescan verification.**~~ Done 23 October 2026; see the verdict at the top. Was: not in the prompt, but the path's standard. Both
  wait for the owner's wallet; the agent signs nothing on a real network. The deploy script is ready
  and takes no arguments; `REVIEWER` and `ADMIN_SAFE` are the two addresses to set first.
- **A real verifier.** The gate ran on `ReceptorMock`. The accredited-issuer recipe is a draft until a
  run against a live verifier on 153 with the Eligibility SDK, which needs a GitHub Packages token and
  a verifier API key an agent cannot obtain (`recipes/README.md`).
- **A web page.** The prompt names none and the web app was not touched, so `typecheck` and `build`
  were not run for this card.
- **A second agent.** The plan asks for two.
- **The hand-written project page and the terminal recording.**
- **The two small code changes the analysers suggest** (`uint256 sum = 0;` and a threat-model line on
  plain stablecoins) and a decision on a funder exit (finding 2). Left for the lead.

## How to repeat it

```
mkdir -p ~/code && cd ~/code
npm create redbelly-dapp@latest card-9 -- --yes
cd card-9 && npm install && npm run contracts:install
git init && git add -A && git commit -m baseline
# add the five files beside this record where their names say:
#   contracts/src/GrantEscrow.sol  contracts/test/GrantEscrow.t.sol  contracts/test/mocks/MockStable.sol
#   contracts/script/DeployGrantEscrow.s.sol  scripts/rehearse-escrow.sh
npm run test                                   # 89 tests, 8 suites
(cd contracts && forge fmt --check src script test)
npm run dev -- --no-web --port 8549 --request-id 100   # leave it running
bash scripts/rehearse-escrow.sh > ../card-9-rehearsal-output.txt   # outside the tree: see finding 4
npm run preflight                              # 6 of 7; DEPLOYER is the expected failure
```
