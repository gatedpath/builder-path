# Card 12, Startup cap table, the agent track: run of 2026-10-17

## Verdict

Proven on a fork of testnet, and not further. Two new contracts, `CapTable` (the register: share
classes, holdings, the board's approval of every transfer, one gate per class) and `VestingVault`
(a nominee that holds unvested shares and releases them through the register), each class bound to
its own request id on one verifier: Ordinary to the over-18 recipe (18), Series A Preference to the
AU wholesale investor recipe (708), and a third class in one test to the accredited-issuer recipe
(100). They compile under the scaffold's strict linter (one warning on the first build, a parameter
shadowing a function, renamed), `forge fmt --check` is clean, 100 tests pass in 9 suites (the
default template's 68 and 32 new ones, one a fuzz over the schedule's shape), each class gate is
proven in all five credential states where the holder acts and in the four invalid states where a
recipient or beneficiary is checked, vesting is proven before the cliff (nothing), at the cliff (a
quarter), part way (linear) and at the end (all), a transfer is refused by three wallets that are
not the board and allowed by the board, and a grant to a wallet of the wrong class is refused in
both directions and through the vault. The whole life of a register was rehearsed on a local fork
of testnet at block 3,052,523: two classes read back, 6,000,000 Ordinary and 1,000,000 Series A
issued, a 48,000-share grant on a four-year schedule with a one-year cliff, a release refused
before the cliff and paid at it after `evm_increaseTime`, a release held while the credential was
revoked and paid when restored, the schedule revoked with 24,000 cancelled and the issued count
falling, 250,000 Series A moved with the board's minute reference after two wrong wallets were
refused, a transfer to a Revoked wallet refused at approval and rejected with a reason, and
fifteen refusals in all, each decoded to its name and arguments. Pre-flight clears 6 of 7 (the
one failure is `DEPLOYER is a public address`, the expected one before a wallet is set). The ship
report did not run: `npm run ship` needs `--chain` and `--account <keystore-name>` and exits 2
without them, saying so; an agent has no keystore, so the prompt's "produce the ship report" is
recorded as not done, with pre-flight standing in. The one-page explanation for a lawyer is
`contracts/CAP-TABLE-EXPLAINED.md`, beside the contracts, 864 words, no code. Slither 0.11.6 and
Aderyn 0.6.8 were run; nothing in either contract needed a change (see "Not done").

Timings. Scaffold 0.54 s (`create-redbelly-dapp@0.2.1` was in the npx cache), `npm install`
30.4 s, `npm run contracts:install` 2.6 s, baseline `npm run test` 3.0 s (68 tests, 7 suites),
baseline committed at 16:18:37 UTC. The two contracts were written and built clean by about
16:25 UTC; the agent then hit its session limit and resumed at 21:55:30 UTC, so the clock from
baseline to the first green commit (21:58:29 UTC) says 5 h 40 min and about ten minutes of it is
work. From the resume to the end of the clean rehearsal (22:02:52 UTC plus 14.0 s): 7 min 36 s,
with the deploy script, the lawyer's page and the rehearsal script written in that window. The
fork loop was ready in 25.5 s on its first start (fork of 153 at block 3,052,522) and 18.5 s on
its second (block 3,052,523); the rehearsal 14.0 s; the full test suite 1.6 s wall (0.49 s inside
forge); pre-flight 1.8 s; Slither 0.9 s; Aderyn 0.4 s. The rehearsal was run twice: the first
transcript decoded every refusal to the right name but printed its arguments shifted by four bytes
(finding 6), so the fork was restarted and the run repeated from a clean chain.

**What the prompt asks for and this run did not do.** The ship report (a keystore is needed; see
above). Everything else in the prompt was built and proven on the fork. What the builder path's
own standard asks for beyond the prompt and this run did not do: the deploy to testnet and the
verification on Routescan (both need a wallet-signed transaction, and the agent signs nothing on a
real network), and a web page. Nothing was signed or sent to a real network; the fork ran as chain
31337 and every sender was an unlocked Anvil account (indices 2, 3, 5, 6, 7, 8 and 9; never 0 or 1).

Agent: Claude Code (Claude Fable 5.1). One agent; the plan asks for two.
Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1, Slither 0.11.6, Aderyn 0.6.8. Project: a
fresh scaffold made the same afternoon from the published packages, `npm create
redbelly-dapp@latest card-12 -- --yes` (the default `gated-erc20` template), `npm install`,
`npm run contracts:install`, committed as the baseline before the card began (68 tests green). The
scaffold's own files are untouched except `script/Deploy.s.sol`, replaced so the local loop
deploys the register: `git diff --stat` against the baseline is six files added and that one
changed, and the template's `GatedERC20` and its 68 tests still build and pass beside the new ones.

## Where the card comes from

Card 12 is one of the twelve prompt cards of PLAN.md section 14.2, as `site/src/data/cards.ts`
carries it: outcome "share classes, vesting schedules, board approval for transfers, per-class
gating, a ship report and a one-page explanation a lawyer could read"; the reason for this
network, "each share class carries its own gate and a transfer needs board approval on chain, so
the cap table cannot drift away from who is allowed to hold what"; who transacts, "few
transactions, each one mattering: grants, vesting releases and approved transfers"; what it
teaches, "gating per class, an approval flow, and explaining the result to someone who will not
read the code". Scope `several-contracts`, recipe `any`. This run is the card's first.

## The prompt, as run

> Build a cap table with share classes, vesting schedules, a transfer approval flow for the board
> role, and eligibility gating per class. Produce the ship report and a one-page explanation a
> lawyer could read.

## The recipes, and why

One per class, which is the card's point. `recipes/au-wholesale-investor/`, request id 708, for
the Series A Preference class: a certified sophisticated or wholesale investor is exactly who a
company may issue shares to without a disclosure document, so the investor class's gate is the
legal test the round rests on, and the recipe's privacy note (every wallet on that register is
publicly a certified wholesale investor) goes straight into the lawyer's page. `recipes/over-18/`,
request id 18, for the Ordinary class held by founders and employees: capacity to contract, proven
from a government identity credential without the company seeing the document; it is the thinnest
gate a company would accept for an employee share scheme, and finding 13 says why a real company
may want more. `recipes/accredited-issuer/`, request id 100, appears in one test as a third class
(Series B) to show the binding is arbitrary and a wallet valid for 708 is refused on 100.
`business-delegate` was set aside: a corporate shareholder acting through a delegate is a real
case, but the recipe's adapter is unwritten and its mechanism is a role read with no request id,
so it does not fit a per-class request id without more work (card 8's finding 1 and 9).

## What was built (files beside this record)

`src/CapTable.sol`, 356 lines, on OpenZeppelin's `AccessControl`:

- Roles: `DEFAULT_ADMIN_ROLE` (a timelock) creates classes, rebinds a class's request id, moves
  the authorised cap, repoints the verifier and grants roles; `BOARD_ROLE` (a Safe) issues shares
  and approves or rejects transfers; `NOMINEE_ROLE` is for a contract the company appoints to hold
  shares for a beneficiary (the vault), which may receive shares without a credential of its own
  and release them to the named beneficiary without a second board approval. A zero board falls
  back to the admin; a zero admin is refused. One test stands the admin pattern up: a
  `TimelockController` creating a class after its two-day delay, the Safe issuing at once.
- Classes: name, request id, authorised, issued; at most `MAX_CLASSES` (32); ids from 1.
- Per-class gate: `_requireEligible(class.requestId, wallet)` reads the one verifier and reverts
  with the kit's own `Gated.NotEligible(wallet, requestId)`, so a refusal reads the same way as on
  any `Gated` contract and `GatedTest.assertRevertsForAllInvalidStates` proves each class.
- `issue(classId, to, amount)`, board, recipient gated for the class, within the cap.
  `issueToNominee`, `releaseFromNominee`, `cancelFromNominee`, nominee only: the beneficiary is
  gated at the grant and the recipient at every release; a cancellation lowers the issued count.
- Transfers: `requestTransfer` by the holder (gated for the class; nothing moves),
  `approveTransfer(id, resolution)` by the board (recipient gated at that moment, the holder's
  balance checked, the minute reference stored and emitted), `rejectTransfer(id, resolution)`,
  `cancelTransfer(id)` by the holder. A transfer never crosses classes. The holder is not
  re-checked at approval (finding 3).
- Reads for a page: `shareClass`, `balanceOf(classId, holder)`, `transferRequest`,
  `isEligibleFor(classId, wallet)`, `canApprove(id)`, and `requestId()` answering for class 1 so
  the scaffold's local loop works (finding 1). Named errors for every refusal; an event for every
  entry, so the register can be rebuilt from the log.

`src/VestingVault.sol`, 175 lines, no base: `grant(classId, beneficiary, total, start, cliff,
duration)` by anyone holding `BOARD_ROLE` on the register (read live, so there is no second list
of directors), which issues the shares to the vault through the nominee path; `release(id)` by the
beneficiary moves what has vested and not been released, gated at the register; `revoke(id,
reason)` by the board keeps what had vested releasable and cancels the rest on the register.
Nothing vests before the cliff; from the cliff the line is linear from `start`; everything at
`start + duration`; a revoked schedule answers its frozen total (finding 4). Reads: `schedule`,
`vestedAt(id, timestamp)`, `releasable(id)`.

Also `script/Deploy.s.sol` (the template's script re-pointed: the pre-flight, a `ReceptorMock`
off mainnet when `VERIFIER` is unset, the register with the deployer as admin for the setup
transactions, the vault, two classes from `REQUEST_ID` default 18 and `INVESTOR_REQUEST_ID`
default 708, the vault appointed nominee, then the admin role handed to `ADMIN_SAFE` and
renounced by the deployer when one is set; `BOARD` defaults to the admin; prints `CapTable:` first
for the loop), `test/CapTable.t.sol` (19 tests), `test/VestingVault.t.sol` (13 tests, one a fuzz),
`scripts/rehearse-cap-table.sh`, `CAP-TABLE-EXPLAINED.md` (the lawyer's page), and the outputs:
`test-output.txt` (the 100), `rehearsal-output.txt`, `dev-loop-output.txt`, `preflight-output.txt`
(6 of 7), `ship-output.txt` (the refusal without a keystore), `slither-output.txt`,
`aderyn-report.md`, `deployments-local.json` (addresses and account indices, never a key).

The tests, in the shape the scaffold asks for. The holder's gate at `requestTransfer` through
`assertRevertsForAllInvalidStates` for the Ordinary class (18) and again for Series A (708); the
recipient's gate at `issue` in the four invalid states for both classes and then Valid; an expiry
set with `setValidUntil` and read at the moment of the next issue after `vm.warp`; the
beneficiary's gate at `grant` in five states and at `release` in the four invalid states with the
shares waiting in the vault and the release counting nothing; an expiry between two releases. The
wrong class: the founder (Valid on 18) refused Series A and the investor (Valid on 708) refused
Ordinary, at `issue` and through the vault; a third class on request 100 refusing a 708 wallet;
rebinding a class's request id leaving holdings in place and gating the next action. Transfers:
three non-board wallets refused with `AccessControlUnauthorizedAccount`, an empty minute refused,
the board's approval moving the shares with the resolution stored, a second approval refused
`WrongStatus`; the recipient in four invalid states at approval; a lapsed holder still moved out;
reject, cancel, self-transfer, over-balance, a second request failing when the shares are gone.
Vesting: the grant's record, the shape checks, nothing before the cliff, a quarter at the cliff,
linear at two and a half years, all at the end, only the beneficiary, revocation at two years and
before the cliff. The fuzz: any total to ten million, any duration to twenty years, any cliff
within it, two times in order; the line never falls, never exceeds the total, is zero before the
cliff, reaches the total at the end and the release at the end empties the vault.

## What the run found

**1. The kit's `Gated` base is one gate, and a register with one gate per class cannot inherit
it.** Card 8 put a second pair beside the base; this card needs N pairs, so the register holds the
verifier itself and reverts with `Gated.NotEligible` by name (a qualified error reference from a
contract that does not inherit it compiles under 0.8.30; a stranger would not know that until
they tried). The cost: the scaffold's local loop reads `requestId()` from the deployed contract to
seed its five wallets, so the register carries a `requestId()` that answers for class 1 and says
in its comment that a page should read `shareClass` instead. A verifier-only base with a
`gatedBy(requestId)` modifier, or a `MultiGated`, is the kit shape this card and card 8 both
reach for. Candidate for 0.2.2.

**2. "Vesting schedules" does not say who holds the unvested shares, and the choice changes the
legal shape.** This run put them in a nominee contract (the vault) in its own name, the way an
employee share trust does, so the beneficiary holds nothing until release and the register's
balance is the legal truth. The other reading, shares issued in the holder's name and locked
until they vest, fits founders' shares under reverse vesting and needs no nominee role. The
prompt can stay; the card's page should say which the reference run chose and that the other is
a reasonable build. The lawyer's page explains the one built.

**3. The prompt's "eligibility gating per class" is four moments, and the record has to name
them.** The holder when they ask to transfer; the recipient when the board approves (not when the
holder asked, so a credential that lapsed between the request and the meeting is refused at the
meeting); the beneficiary when the board grants; the beneficiary at every release. And one place
the gate is not run on purpose: the holder at approval, because a transfer out of a wallet whose
credential has lapsed is how that wallet leaves the register and the board decides it. A test
pins each. A rewording of the prompt could say "checked when the shares land" so every run has
to answer where that is.

**4. The first test run caught a real bug in revocation.** `revoke` lowers a schedule's `total`
to what had vested, and the vesting line was then drawn again over the smaller total, so a
schedule revoked at two years of four answered half of what it should (12,000 for 24,000). The
fix is one line, a revoked schedule answers its total outright, and the comment that claimed the
old line "gives the right answer for it too" was wrong and is replaced. The test that caught it
is `test_revoke_keepsWhatVested_cancelsTheRest`; the fuzz would not have, because it never
revokes. Worth saying on the card's page: the tests are where the design gets checked, not the
comments.

**5. The linter bit once and `forge fmt` twice.** The first build failed on `requestId` as a
parameter name shadowing the `requestId()` function (warning 8760, and a warning fails the
build); renamed `requestId_`. `forge fmt --check` wanted a four-parameter event reflowed and a
six-field struct literal on one line. Card 9 found the opposite pattern (clean lint, one reflow).

**6. Decoding a custom error's arguments from `cast send` takes one more step than card 8
found.** Card 8's finding 5 says to read the `data:` field, not the bare selector. Reading it and
handing it to `cast abi-decode --input "<error signature>"` prints the arguments shifted by four
bytes (the first run's transcript shows addresses beginning `0x00000000`). What works: strip the
selector and decode the rest as if it were return values, `cast abi-decode "f()(address,uint64)"
0x<data without selector>`. The rehearsal script carries a table of the errors the two contracts
and the kit name and does this; the clean transcript shows every refusal with its arguments.

**7. The local loop seeds one gate and knows nothing of classes.** `npm run dev` seeded accounts
2 to 6 for request 18 (class 1); the rehearsal seeded 708 for three wallets and 18 for the
employee with four `setStatus` calls on the same mock. The dev state panel and the web app would
need per-class seeding and a page that reads `shareClass`; neither was touched. Same finding as
cards 8 and 9 from a third side.

**8. "Produce the ship report" cannot be done by an agent, and the tool says so well.** `npm run
ship` without flags prints "--chain 151 or 153 is required" and its usage; with `--chain 153` it
prints "--account <keystore-name> is required: the report carries the deployer's address and its
isAllowed reading" and exits 2. That is the right refusal. The card's prompt should either say
"run pre-flight and leave the ship report for the wallet holder", or the card's page should say
the report is the owner's step. Pre-flight (6 of 7) is beside this record in its place.

**9. Pre-flight's secret scanner and the broadcast folder.** The scanner read 88 files with the
rehearsal transcript saved outside the tree, and passed, although `contracts/broadcast/` (a
gitignored folder the loop's `forge script --broadcast` writes) held transaction hashes at the
time. So the scanner skips ignored folders and reads everything else, tracked or not, which is
why a transcript saved in the project root fails it (cards 8 and 9) and one under an ignored path
would not. The shared "how to repeat it" step can say either.

**10. Static analysis has nothing that needs a change.** Slither on the two contracts:
`incorrect-equality` on `amount == 0` in `release` (a zero check), `reentrancy-events` on the
vault's three calls into the register followed by an event (the register is the vault's immutable
and the state is written before the call), `timestamp` on the vesting arithmetic (vesting is
time). Aderyn: `Centralization Risk` on the admin and board roles (the design; the roles are
meant for a timelock and a Safe), `Unchecked Return` on the constructor's `_grantRole` (the kit's
own pattern). All read; none changed.

**11. The deploy script hands the admin role over after setup, which the template does not.**
The template constructs with `admin = p.admin`. A register needs classes and a nominee before it
is useful, and a timelock as admin would make those two-day operations, so the script makes the
deployer admin, does the setup, grants `ADMIN_SAFE` the role and renounces its own, all in one
broadcast. The deployer holds nothing afterwards. The pattern is worth a line in the kit's
admin-pattern doc.

**12. Gas, for the page's "few transactions, each one mattering".** On the fork: `issue` 86,526;
a vault `grant` 194,204 (a schedule written and shares issued); the first `release` 106,346 and
the second 72,146; `revoke` 60,877; `requestTransfer` 175,786 the first time (a new record with a
string slot) and 158,686 after; `approveTransfer` with a 44-byte minute reference 147,533;
`rejectTransfer` 100,549; `cancelTransfer` 30,309. At Redbelly's dollar pricing (US$0.01 per
21,000 gas) the dearest of those is about nine cents. Fees on a fork mean nothing in RBNT; these
are gas counts only.

**13. Over-18 is a thin gate for an Ordinary shareholder, and the card should say the recipe is
the lawyer's call.** It proves capacity and nothing about identity beyond what the network's own
verification already did. A company that must know its members for its register under the
Corporations Act is relying on the accredited issuer's verification behind the wallet, not on the
recipe. The accredited-issuer recipe (an AML/CTF check passed, from a named issuer) is the other
candidate and the test shows the swap is one admin transaction. Recorded as the builder's choice;
the lawyer's page says the credentials are drafts until run against a live verifier.

**14. The fork is deterministic between starts, again.** The second `npm run dev` produced the
same mock, register and vault addresses as the first, one block later. Card 9's finding 10 holds.

## The rehearsal, as it ran (`rehearsal-output.txt`)

Sixteen steps on a fork of testnet (chain 31337, fork of 153 at block 3,052,523, blocks 3,052,536
to 3,052,556), every signer an unlocked Anvil account: the two classes read back with their
request ids and the vault's nominee role confirmed; the board (account 7) issuing 6,000,000
Ordinary to the founder (account 3, Valid on 18); the NeverIssued, Revoked and WrongJurisdiction
wallets refused Ordinary with `NotEligible(wallet, 18)`; the founder refused Series A with
`NotEligible(founder, 708)` and `isEligibleFor` reading true for class 1 and false for class 2;
the investor gate seeded (account 9 and account 2 Valid on 708, account 6 Revoked on 708, account
8 Valid on 18 as the employee); 1,000,000 Series A issued to the investor and the investor refused
Ordinary; the Series A cap hit with `ExceedsAuthorised(2, 2000001, 2000000)`; a grant of 48,000
Ordinary to the employee over four years with a one-year cliff landing in the vault, a grant to
the investor refused `NotEligible(investor, 18)`, the founder refused `NotBoard`; a release before
the cliff refused `NothingVested(1)`; one year passed with `evm_increaseTime`, `releasable` 12,000
and the release paid; another year, the employee's credential revoked, `releasable` 12,000 and the
release refused `NotEligible(employee, 18)`, the credential restored and 24,000 in the employee's
name; the schedule revoked with the board's minute, the register's issued count falling from
6,048,000 to 6,024,000 and the vault empty; the investor asking to move 250,000 Series A to
account 2, the founder and the investor refused `AccessControlUnauthorizedAccount`, the board
approving with "board minute 2026-10-17/5", 750,000 and 250,000 on the register and the request
read back as Approved with its resolution, a second approval refused `WrongStatus(1, Pending,
Approved)`; a request to the Revoked wallet taken, `canApprove` false, the approval refused
`NotEligible(wallet, 708)` and the request rejected with a reason; the founder asking and
withdrawing a transfer with nothing moving; the one `TransferApproved` event read from the log
with the minute reference in its data. Fifteen refusals, each decoded to its name and arguments.

## Not done

- **The ship report.** `npm run ship` needs a Foundry keystore name; the agent has none and asks
  for none. The command, its refusal and its usage are in `ship-output.txt`. The owner's testnet
  wallet runs `npm run ship -- --chain 153 --account <keystore-name>`.
- **Testnet deploy and Routescan verification.** Not in this card's prompt. The deploy script is
  ready and reads public addresses only; `ADMIN_SAFE` and `BOARD` are the two to set.
- **A real verifier behind either class.** `ReceptorMock` answered both gates by request id. No
  `ZKPVerifier` for 18 or 708 exists in this project; the recipes are drafts (`recipes/README.md`).
- **A web page.** The template's page speaks `GatedERC20`'s ABI; a register page would read
  classes, holdings, schedules and pending requests. `typecheck` and `build` were not run.
- **A compulsory transfer power** (a bad leaver, a court order), a last-admin guard like the
  kit token's, pausing, and a company-held treasury class. The lawyer's page says the first is
  missing.
- **Static analysis changes.** None needed (finding 10).
- **A second agent.** The plan asks for two.
- **The hand-written project page and the terminal recording.**

## How to repeat it

```
mkdir -p ~/code && cd ~/code
npm create redbelly-dapp@latest card-12 -- --yes
cd card-12 && npm install && npm run contracts:install && npm run test     # 68 green
git init && git add -A && git commit -m baseline
# add the files beside this record where their names say:
#   CapTable.sol, VestingVault.sol -> contracts/src/;  CapTable.t.sol, VestingVault.t.sol -> contracts/test/
#   Deploy.s.sol -> contracts/script/ (replaces the template's);  CAP-TABLE-EXPLAINED.md -> contracts/
#   rehearse-cap-table.sh -> scripts/
npm run test                                   # 100 green, 9 suites
(cd contracts && forge fmt --check src script test)
npm run dev -- --no-web --port 8552            # in one shell; forks 153, deploys the register and vault, seeds 18
bash scripts/rehearse-cap-table.sh > ../card-12-rehearsal-output.txt   # outside the tree: finding 9
npm run preflight                              # 6 of 7; DEPLOYER is the expected failure
npm run ship -- --chain 153                    # exits 2 without --account; record what it says
npm run lint:slither; (cd contracts && aderyn . -o ../aderyn-report.md)
```
