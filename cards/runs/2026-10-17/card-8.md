# Card 8, Invoice financing, the agent track: run of 2026-10-17

## Verdict (updated 25 October 2026)

**Deployed on testnet and verified on Routescan.** On 25 October 2026 the owner deployed the invoice financing
contract to chain 153 from her dev wallet (`0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59`, a keystore in her own
Terminal, the key never in a file or the chat), in the shape of Part 5 of the deploy draft: pre-flight 8 of 9
(the ninth the admin skip, normal on 153), the Slither sidecar fresh, a no-broadcast dry run against 153, then the
ship report written by `redbelly ship` 0.2.3 read-only by address (every check, 89 tests with
`InvoiceFinancingTest` among the five-state suites, `ship-153-2026-10-25.md` beside this record), then
`VERIFIER=<the shared mock> BUSINESS_VERIFIER=<the shared mock> forge script script/Deploy.s.sol --rpc-url
redbelly_testnet --account rbn-testnet --sender <her address> --broadcast`. Two contracts in one broadcast, both in
block 3,056,722 (12:20:13 UTC) at 312,460.94 gwei: `InvoiceFinancing` at
**0xcd7F22Ddc8d22224A98f1c98c601F890cb3F3d90**, transaction
`0x8dbf4ec2576b9cabb616e8ddc75a18e4ffbeb20419442ef9ba691c324eceb455`, 1,100,139 gas, 343.75 test RBNT; and its
`MockStablecoin` (mUSD, 6 decimals) at **0x9cF4E639C35141cF4C36E5c38dc88151FB89E6Db**, transaction
`0x0c2f955caba02bddced6b33f7bd4e073de242cb8473b9e5cd35ed3ae34367d97`, 508,568 gas, 158.91 test RBNT. 502.66 test
RBNT in all (balance 40,113.25 to 39,610.60, read from chain; nonce 10 to 12), against the fork run's estimate of
about 654 for the same two transactions at the morning's base fee: the dry run's 2,091,318 gas was Foundry's estimate
and the receipts came to 1,608,707. Both verified on Routescan the same hour with `forge verify-contract` ("Pass -
Verified" after one "Pending in queue" each), the constructor arguments taken from
`deployment-153-InvoiceFinancing.json`.

Her choice for the verifiers: both gates point at the `ReceptorMock` the scaffold's token deployed on 23 October
(`0x2E652B946DC303d8f53bC92D0787e13B109003e5`), passed through `VERIFIER` and `BUSINESS_VERIFIER`, so request 708
(investors) and request 0 (listers) sit beside the token's 18 and the escrow's 100 on the one mock administered for
the grid. Read back live after the deploy: `requestId()` 708, `listerRequestId()` 0, `verifier()` the shared mock,
`owner()` the deployer; the stablecoin answers `mUSD` and 6 decimals. No invoice has been listed yet: that is the
live-use step, hers to sign, and needs a wallet seeded as a delegate on request 0 and one as an investor on 708 on
the shared mock. Notes from the run: Forge's closing summary swapped the two contract labels and printed a "Total
Paid" of 4.60 RBNT against receipts summing to 502.66 (cosmetic, Foundry's, the same fault as the 23rd; the receipts
and the chain are right); her first attempt ran from the wrong folder, so `redbelly_testnet` resolved to nothing and
Forge stopped before the network (nothing sent); and the ship report written before the deploy already carried the
right address, because the dry run's simulated address and the real one come from the same nonce, which is luck and
not a rule, so the report was re-run after the deploy as Part 5.4 says. Files added beside this record:
`deployment-153-InvoiceFinancing.json`, `broadcast-153-run-latest.json`, `ship-153-2026-10-25.md`.

The verdict of 17 October stands below as written then.

## Verdict, 17 October 2026

Proven on a fork of testnet, and not further. One new contract, `InvoiceFinancing`, with two gates
and two request ids on it: the lister gate reads the business-delegate recipe (request id 0, either
role) through its own verifier, and the investor gate reads the AU wholesale investor recipe (request
id 708) through the scaffold's `Gated` base. It compiles under the scaffold's strict linter (a
warning fails the build), `forge fmt --check` is clean, 89 tests pass in 8 suites (the default
template's 68 and 21 new ones, one of them a fuzz over face values and discounts), each gate is
proven in all five credential states (`list` on the lister gate, `fund` and `release` on the investor
gate), and the whole life of an invoice was rehearsed on a local fork of testnet at block 3,052,397:
listed, funded at a 3 percent discount with the advance landing in the business's wallet, repaid,
released, with 14 refusals and every one of them the error the contract names for that wallet and
that request id. Pre-flight clears 6 of 7 (the one failure is `DEPLOYER is a public address`, which
the shared step says to expect before a wallet is set), and 5 of 7 while the rehearsal transcript
sits in the project, for a reason finding 4 explains. Slither 0.11.6 and Aderyn 0.6.8 were run:
nothing above Low on the new contract, each note read and left as it is (see "Not done").

Timings. Scaffold 0.27 s (`create-redbelly-dapp@0.2.1` was already in the npx cache), `npm install`
17.6 s, `npm run contracts:install` 1.4 s, baseline `npm run test` 2.6 s (68 tests, 7 suites),
baseline committed at 13:46:32 UTC. `npm run dev -- --no-web --port 8548` ready in 5.9 s on its
first start (fork of 153 at block 3,052,396) and 4.3 s on its second (block 3,052,397); the clean
rehearsal 15.0 s (16:02:29 to 16:02:44 UTC); the full test suite 0.67 s; pre-flight 0.56 s; Slither
0.8 s; Aderyn 0.4 s. Wall clock from the baseline commit to the end of the clean rehearsal is 2 h 16
min 12 s, but most of that is not work: the agent was stopped by a rate limit between reading the
scaffold's files and writing the first line of the contract, and resumed about two hours later. The
work after the resume, from the first contract file to the end of the clean rehearsal, took about a
quarter of an hour by the commit timestamps (first code commit 15:58:19 UTC, deploy script commit
15:58:50 UTC, clean rehearsal done 16:02:44 UTC, with a few untimed minutes of writing before the
first commit). One rehearsal was run twice: the first run's transcript decoded no error arguments
(finding 5), so the fork was restarted and the run repeated from a clean chain.

**What the prompt asks for and this run did not do.** The prompt asks for a contract and names two
recipes; everything in it was built and proven on the fork. What stands behind each recipe on a
real network was not: the business-delegate recipe's `BusinessDelegateAdapter` over a real
`BusinessIdentifier` is unwritten (the recipe says so), and no `ZKPVerifier` for request 708 exists
yet, so a `ReceptorMock` answered both gates, by request id, in the tests and on the fork. The
prompt does not ask for a testnet deploy or a Routescan verification, and none was made. Nothing was
signed or sent to a real network; the fork ran as chain 31337 and every sender was an unlocked Anvil
account (indices 2 to 9; never 0 or 1).

Agent: Claude Code (Claude Fable 5.1). One agent; the plan asks for two.
Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1, Slither 0.11.6, Aderyn 0.6.8. Project: a
fresh scaffold made the same afternoon from the published packages,
`npm create redbelly-dapp@latest card-8 -- --yes` (the default `gated-erc20` template), `npm install`,
`npm run contracts:install`, committed as the baseline before the card began (68 tests green).

## The live-shape rehearsal, 25 October 2026

Her question after the deploy: can we make a mock-up to test the parameters that are missing and likely used on
live. So, the same afternoon, a fork of 153 taken at block 3,056,729 (after the deploy), with the contract and the
mUSD that are really on 153 as the contracts under test, and the shared `ReceptorMock` swapped for the two verifier
shapes a live deployment would have. Three new sources in the project, beside this record: `MockBusinessIdentifier.sol`
(the shape Vine prints: the two role constants with their real names and hashes, the issuer as admin, representatives
added by the issuer only, delegates by a representative or the issuer, the public strings; the network-permission side
effects left out because a fork cannot show them), `BusinessDelegateAdapter.sol` (the recipe's unwritten adapter,
written here: request 0 either role, request 1 representatives only, any other request admits nobody, a revert from
the identifier reads as no role), and `MockZKPVerifierV2.sol` (an `@iden3/contracts` 2.x shape: `setZKPRequest`,
`isProofVerified`, a revert for an unset request), read through the kit's own `Iden3VerifierAdapter` on its real code
path. The script is `rehearse-live-shape.sh`; the transcript `live-shape-rehearsal-output.txt`. The owner was
impersonated by Anvil to repoint the gates, the one thing a fork can do and the network cannot; nothing reached 153,
and the live contract still points at the shared mock (read back afterwards: both gates, `invoiceCount` 0, nonce 14).
89 tests still pass, `forge fmt` is clean, Slither re-run with the new sources in the sidecar.

**What it proved.** The owner repoints both gates and a stranger cannot (`OwnableUnauthorizedAccount`). A delegate added
by the representative lists; the representative lists too (the contract's own ranking); an investor with a wholesale
proof does not list and a delegate does not fund; a delegate cannot add delegates and a representative cannot add
representatives, with the real contract's two error strings. A proof recorded for 708 admits; no proof refuses; a
request never set makes the verifier revert and the adapter read false, so a misconfigured request admits nobody. The
four input edges refuse by name (`BadDiscount` at 0 and at 10,000, `DueDateInThePast`, `ZeroFaceValue`). Realistic
values: a 48,250.00 mUSD invoice at 250 bps gives an advance of 47,043.75. A delegate removed mid-flight is refused on
the next list at once, with no window, and the invoice it listed is unaffected; the gate narrowed to request 1 refuses
the delegate and passes the representative. A proof withdrawn freezes the repaid money in the contract until it is
restored, the card's policy. Gas on the live-shape path against the mock path of 17 October: `list` 150,385 against
147,535, `fund` 98,075 against 75,918, `repay` 59,839 against 59,839, `release` 74,727 against 69,670: a real adapter
adds one external call per gate, about 3,000 gas for the role read and about 22,000 for the Iden3 read on `fund`
(the first read of a cold contract); a live estimate should carry it.

**The parameters a live deployment needs**, as the deploy script and the operator must supply them:

| Parameter | What it is on 153 today | What it is on live |
|---|---|---|
| `STABLECOIN` | the `MockStablecoin` (mUSD) | a real ERC-20 the parties hold; the contract is decimals-agnostic, every amount is in the token's units; on 153 the AUD stablecoins accept contract senders (RESEARCH, 17 October), so one of them is the candidate for the live run |
| `VERIFIER` | the shared `ReceptorMock` | an `Iden3VerifierAdapter` over the dApp's own `ZKPVerifier` child, `Surface` matching the `@iden3/contracts` release it was compiled from, request 708 set with `setZKPRequest` before anyone can pass |
| `REQUEST_ID` | 708 | 708 (the recipe's mnemonic; any id the verifier was given) |
| `BUSINESS_VERIFIER` | the shared `ReceptorMock` | a `BusinessDelegateAdapter` over the business's `BusinessIdentifier`, whose address the business gives you; one adapter per business |
| `LISTER_REQUEST_ID` | 0 | 0 (delegate or representative) or 1 (representatives only); the owner can narrow it live with `setBusinessVerifier` |
| `ADMIN_SAFE` | unset, the deployer owns | a Safe 1.4.1, threshold two or more, which then holds the only right to repoint either gate |
| per invoice | | `faceValue` in token units, `discountBps` 1 to 9,999, `dueDate` after now, `documentHash` (keccak256 of the document); the investor approves the advance, the repayer approves the face value |

**The gaps found**, each a decision for her or a kit item:

1. **The advance goes to the wallet that listed.** On the live shape that is a delegate, a service account; 47,043.75
   landed in account 9, nothing in the representative's or a treasury's. The recipe's own note (finding 9 of the fork
   run) is now shown with money. Candidates: a payee set per business by a representative (request 1 on the same
   adapter), or `list` taking a payee the gate also checks. Her call, before this contract is used for real.
2. **The due date is recorded and not enforced.** Repayment five days late was accepted; nothing marks an invoice
   overdue, there is no cancel for an unfunded listing, no late term. Keep it as "for the investor's judgement" (what
   the code says) or add an `overdue` read and a `cancel` for `Listed`. Her call.
3. **Rounding floors the discount.** `advanceFor(1, 1)` is 1; at six-decimal units it is a unit of a cent and never
   matters in practice, but the page should say the discount rounds in the business's favour.
4. **One adapter per business is one contract per business.** The gate can be narrowed but cannot serve a second
   business; a marketplace needs an adapter over a registry of identifiers, which the recipe does not describe yet.
5. **A wrong `Surface` or an unset request reads as "nobody is eligible", silently.** Safe, and invisible until the
   first investor is refused. A pre-flight or ship check that the verifier answers `isEligible` for a known-good
   wallet without reverting, or at least that the request is set, is a candidate for 0.2.4.
6. **The kit's gaps are now written, in this project.** `BusinessDelegateAdapter` belongs in `receptor-mock`'s
   adapters beside the Iden3 and VC ones; `MockBusinessIdentifier` and `MockZKPVerifierV2` belong in its test fakes so
   every card can test the live shapes. Candidates for 0.2.4, with these files as the start.
7. **`npm run dev` seeds the investor gate only**, and knows nothing of an identifier or a ZKP verifier; a second
   seeding path for the live shapes would let the web app and the dev panel show them.
8. **What a fork cannot show.** The real identifier's `addAuthorisedDelegate` also grants network write access and
   `removeAuthorisedDelegate` withdraws it, so on the real network a removed delegate cannot even send; here the gate
   was the only line, and it held.

**What this means for card 8's live use on 153.** Two routes. (A) As planned: the shared mock, her one enabled wallet
playing every role in turn by flipping its own status. (B) Closer to live: deploy the identifier mock, the business
adapter, the ZKP mock and the Iden3 adapter on 153 (about 220 test RBNT), repoint the live contract's gates with her
signature, and run the life of an invoice through the real adapter code on the real network; the two mocks are still
mocks, but the adapters and the repointing are the live path. Recommended: B, because it is the path a real business
would take and it costs one sitting. Her decision.

## Route B on 153, the same afternoon: the live shapes deployed, the gates repointed, the life of an invoice run

Her choice, after the fork rehearsal: route B. Everything below was signed by her from her own Terminal; a session
prepared each command, dry-ran it against 153 first, read the result back from chain, and showed every refusal as a
read-only call against the live state between the signed phases. Transcript: `live-invoice-153-transcript.txt`;
scripts `DeployLiveShape.s.sol` and `LiveInvoice.s.sol`; the four deployment records and the broadcasts beside it.

**Step 1, one broadcast of seven transactions, block 3,056,734 (12:53:42 UTC), 1,675,955 gas, 524.01 test RBNT:**
`MockBusinessIdentifier` at **0x87B7094051d38d00a150E394312c08C7700b6BF1** (her wallet the issuer and the first
representative, since only it can transact on 153), `BusinessDelegateAdapter` at
**0x6a9d3ed5A4082ff9C0287C211AD227657D0AF839** over it, `MockZKPVerifierV2` at
**0x68E07D5a913F9988240582a431acc1AEA4212461** with request 708 set, the kit's `Iden3VerifierAdapter` at
**0x3D1920190f2D60571eC9ccdA945447fAeF7EFc20** over that (surface ZKPVerifierV2), then `setBusinessVerifier(adapter,
0)` and `setVerifier(iden3Adapter)` on the live contract. All four verified on Routescan from their records ("Pass -
Verified" each). Read back: both gates on the adapters, `isLister(her)` true through the identifier, `isEligible(her)`
false with no proof yet. The script refuses mainnet and checks the sender owns the contract.

**Step 2, the life of invoice 1 in three signed phases, 12 transactions, 231.55 test RBNT.** Phase 1 (blocks 3,056,735
to 737): 48,250.00 mUSD minted and approved, invoice 1 listed at 250 bps, due in 45 days. Live refusals read against
153: her wallet on `fund` with no proof, `NotEligible(her, 708)`; a stranger on `list`, `NotEligible(stranger, 0)`; a
stranger on `fund`, `NotEligible(stranger, 708)`. Phase 2 (block 3,056,740): proof recorded for her on the ZKP
verifier, `fund` (29,254 gas on the live path), a second approval, `repay`, proof withdrawn. Live refusal: her
`release` while the proof is withdrawn, `NotEligible(her, 708)`, with 48,250.00 held in the contract. Phase 3 (block
3,056,742): proof restored, `release` (79,527 gas), a second delegate added on the identifier and removed, `isLister`
true between and false after. Final state: invoice 1 Released, her mUSD back at 48,250.00, the contract at zero, two
`RoleUpdated` events on the identifier. One fix before anything was signed: the dry run of phase 2 showed the funding
step consuming phase 1's allowance, so the repayment got its own approval.

**What is proven on the real network that the fork could not prove:** the owner repointing a live contract's gates;
the kit's Iden3 adapter and the new business adapter answering on 153; a refusal, a freeze and a release decided by a
verifier's state on chain; and the gas of the live path (`fund` 29,254 warm, `release` 79,527). **What is still a
mock:** the identifier (no business of ours is verified through Averer) and the ZKP verifier (no request 708 is
issued); the parameters table and the gaps list above stand, and the two decisions in it are still hers. Card 8 is
finished on testnet under the bar of 25 October: deployed, verified, its whole life run on 153 through the live-shape
path, the record written. Its public repository waits on the 0.2.3 publish. 1,258.22 test RBNT in all today; nothing
touched mainnet.

## Version 2, 26 October 2026: payment terms, built and proven on a fork, not yet deployed

Her question after the drafts: invoices come with payment terms, so can a due date be enforced on chain? The honest
answer first: a contract cannot make a debtor pay, and nothing on a chain happens by itself when a date passes
(on this network doubly so, since blocks are made on demand and the clock only moves when a transaction lands).
Enforcement is therefore one of three things: money committed in advance, a pull the business pre-authorised, or a
consequence that attaches to the business's identity. Her choice, items 1, 2 and 5 of the five set out to her
(collateral and late fees are product terms for the mainnet conversation): version 2 adds, in
`InvoiceFinancing.sol` (now 359 lines; the v1 source stays beside this record as `InvoiceFinancing.sol`, the v2 copy
as `InvoiceFinancing-v2.sol`):

- **`isOverdue(id)`**, a free read: funded (or defaulted) and past the due date.
- **`declareDefault(id)`**, the investor only, once the due date plus `gracePeriod` (7 days by default) has passed
  unpaid. The invoice goes to `Defaulted`; `defaultsBy[business]` and `unpaidBy[business]` are kept against the
  wallet that listed, and the event names the lister gate's verifier, so the next investor can read a business's
  history before funding it. This is the enforcement that only exists on an identity-gated chain.
- **`collect(id)`**, anyone, after the due date: pulls the face value from the business's pre-authorised allowance
  into the contract. The direct debit the business agreed to when it listed; if the balance or allowance is not
  there the call reverts, and that failure is the evidence of non-payment.
- **`cancel(id)`**: the lister at any time while `Listed`; anyone once the due date plus `listingWindow` (30 days
  by default) has passed, so a stale listing does not sit forever. A cancelled invoice cannot be funded.
- **`repay` after a default is accepted and cures it**: `Repaid`, the unpaid amount comes off, the default count
  stays (it is history). `release` then works as before.
- **`setTerms(grace, window)`**, the owner only. Two new statuses at the end of the enum (`Defaulted`, `Cancelled`),
  so the existing numbering holds. The constructor is unchanged, so the deploy script and the live-shape script
  need no change.

Tests: 31 in `InvoiceFinancingTest` (21 before, 10 new: every new path, every refusal, the cure, the window), 99 in
the project; `forge fmt --check` clean; the build clean under the strict linter (the timestamp comparisons carry the
same disable comments as `list`, and Slither reports them at Low as before, five now instead of one, each a calendar
check). Rehearsed on a fresh fork of 153 at block 3,056,849 with `scripts/rehearse-terms.sh` (transcript
`terms-rehearsal-output.txt`): the lister cancelling at once and a stranger refused `TooEarly`; a funded invoice
collected by a stranger a day after the due date from the business's allowance (64,319 gas) and released; a funded
invoice with no allowance refused `ERC20InsufficientAllowance` on `collect`, `TooEarly` inside the grace period,
`NotTheInvestor` for a stranger, then declared by the investor (84,750 gas; `defaultsBy` 1, `unpaidBy` 10,000),
cured by a late repayment (`defaultsBy` still 1, `unpaidBy` 0) and released; a stale listing closed by a stranger
after the window. Nothing reached 153: the contract live there is v1.

**What this changes for the card.** The deployed v1 stays the record of 25 October and the public page describes it
honestly, with the two choices stated. Deploying v2 on 153 is a sitting of its own (a fresh deploy through the
live-shape adapters, about 550 test RBNT with the life re-run), hers to call; her first-pass answer was to spend the
test RBNT on cards that have not reached the network yet and bring v2 up with the mainnet conversation. Left open on
purpose: collateral at listing and late fees, which are terms she sets; and the advance's payee, the other choice
from the rehearsal, which is not in v2.

## Where the card comes from

Card 8 is one of the twelve prompt cards of PLAN.md section 14.2, as `site/src/data/cards.ts`
carries it: outcome "A verified business lists an invoice, an eligible investor funds it at a
discount, repayment releases the funds"; the reason for this network, "both sides are checked by the
contract and not by a back office: the seller is a delegate of a verified business, and the funder
passes the wholesale investor gate"; what it teaches, "different recipes for different roles on one
contract; a business acting through a delegate wallet rather than a personal identity". It is the
first card to put two recipes on one contract, and the first to use the business-delegate recipe,
whose check is a live role read rather than a proof. This run is the card's first; it had never been
run on a scaffold before today.

## The prompt, as run

> Build a contract where a verified business lists an invoice, an eligible investor funds it at a
> discount, and repayment releases funds. Use the business-delegate recipe for the listing side, so
> the lister is an authorised representative acting for the business rather than a person holding a
> credential of their own, and the wholesale recipe for investors.

## What was built (files beside this record)

`src/InvoiceFinancing.sol`, 251 lines, on OpenZeppelin's `Ownable` and the kit's `Gated`:

- Two gates. `Gated(investorVerifier, 708)` is the investor gate, exactly as the scaffold's own
  `GatedERC20` binds its one gate; `fund` and `release` carry its `gated` modifier. The lister gate
  is a second pair the contract holds itself, `businessVerifier` and `listerRequestId` (0, the
  recipe's binding for delegate or representative; 1 would be representatives only), read by a
  `listerGated` modifier on `list`. Both gates revert with the base's own `NotEligible(wallet,
  requestId)`, so a refusal reads the same way on either side and the kit's five-state helper proves
  both. The owner may repoint either pair (`setBusinessVerifier`, and the base's `setVerifier` and
  `setRequestId` through `_authorizeVerifierChange`).
- One invoice is a face value, a discount in basis points (1 to 9,999), a due date, the status and the
  keccak256 of the invoice document. Nothing about the debtor is on chain.
- `list(faceValue, discountBps, dueDate, documentHash)` by a delegate; `fund(id)` by an eligible
  investor pays `faceValue - faceValue * discountBps / 10,000` straight to the wallet that listed, in
  the stablecoin, through `SafeERC20`; `repay(id)` by anyone moves the face value into the contract
  (no gate: a credential is a condition on receiving money here, not on paying it); `release(id)` by
  the recorded investor, still eligible, takes it out. Every step checks the status it expects and
  reverts `WrongStatus(id, expected, actual)` otherwise; the wrong wallet on `release` gets
  `NotTheInvestor`. State changes before every token transfer.
- `advanceFor` and `isLister` as reads for a page; `invoice(id)` returns the record.

Also `src/mocks/MockStablecoin.sol` (29 lines, a six-decimal ERC-20 anyone may mint; under `src/`
only so the deploy script can deploy it off mainnet, refusing chain 151 in its constructor the way
`ReceptorMock` does), `test/InvoiceFinancing.t.sol` (401 lines, 21 tests), `script/Deploy.s.sol`
(the template's script re-pointed at the new contract: `VERIFIER`, `BUSINESS_VERIFIER` and
`STABLECOIN` from the environment, each refused on mainnet when unset and each replaced by a mock
off mainnet with the log saying so in capitals; `REQUEST_ID` default 708, `LISTER_REQUEST_ID`
default 0), `scripts/rehearse-invoices.sh` (138 lines), and the outputs: `rehearsal-output.txt`,
`test-output.txt`, `preflight-output.txt` (6 of 7), `preflight-output-with-rehearsal-file.txt`
(5 of 7), `slither-output.txt`, `slither.json`, `aderyn-report.md`, `deployments-local.json` (the
loop's record: account indices, never a key). The scaffold's own sources are untouched: the diff
against the baseline is three added files and one changed (`Deploy.s.sol`), and the template's
`GatedERC20` and its 68 tests still build and pass beside the new ones.

## What the run found

**1. The `Gated` base is one gate, and the card needs two.** `Gated` holds one verifier and one
request id, which is the right shape for every earlier card. For two recipes on one contract the
second pair has to live in the child, and the child has to reach for the base's `NotEligible` error
by hand so that both gates fail the same way and `GatedTest.assertRevertsForAllInvalidStates` can
prove either of them (it asserts the revert is exactly `NotEligible(wallet, requestId)`). That
worked without touching the kit, but it is the first card where "use the Gated base" is not the
whole answer, and the card's page should say so. A kit shape for a second gate (a `GatedPair`, or a
`gatedBy(verifier, requestId)` modifier on the base) is a candidate for version 0.2.2.

**2. The prompt's "authorised representative" and the recipe's request id do not quite match.** The
business-delegate recipe binds request id 0 for "delegate or representative" and 1 for
"representatives only", and names the representative as a director or officeholder. The prompt says
the lister is "an authorised representative acting for the business", which in the recipe's words is
request id 1, while the recipe's own binding section says `Gated(verifier, 0)`. This run bound 0 and
made the id a constructor and owner setting, so a deployer who wants officeholders only passes 1;
the test `test_admin_onlyTheOwnerRepointsEitherGate` moves it. The prompt is not changed here, but the
lead should decide whether it means the recipe's broad role (then "representative" is the wrong word)
or the narrow one (then the card should name request id 1).

**3. The scaffold's linter is strict, as promised, and this time it caught a calendar check.** The
due-date test `dueDate <= block.timestamp` is forge lint's `block-timestamp` warning, and a warning
fails the build. The kit's own `ReceptorMock` meets the same lint on its expiry rule and disables it
with a comment that gives the reason; the contract does the same. Slither reports the same line as
its one note on the new contract (Low, "uses timestamp for comparisons"); a due date is a calendar
fact and the block's clock is the right one to compare with, so the line stays.

**4. Pre-flight's key scanner reads a document hash as a key.** With `rehearsal-output.txt` in the
project, `npm run preflight` fails "no key-shaped value in the project's files, tracked or not (88
read): rehearsal-output.txt (hex64)". The value is the invoice's keccak256 document hash, 64 hex
characters, the shape of a private key. With the transcript set aside the check passes and
pre-flight is 6 of 7. Both outputs are beside this record. Any dApp that prints a `bytes32` into a
saved transcript will meet this; either the scanner learns to skip saved transcripts, or the scaffold's
README says where transcripts go, or builders learn to read the line and move on. Not a fault in the
contract, and the check's caution is the right default.

**5. `cast call`'s revert message prints the bare selector before the data.** Foundry 1.7.1 prints
`execution reverted: custom error 0x879342fb: <args>, data: "0x879342fb..."`. A rehearsal script that
takes the first hex token gets the selector alone, and `cast calldata-decode` then fails with "buffer
overrun". The `data:` field is the one to read. This cost one re-run of the rehearsal from a clean
fork; the first transcript, with every refusal right but no arguments decoded, is in the scaffold's
git history and not beside this record.

**6. `reference` is a reserved word in Solidity 0.8.30.** The invoice's document hash was first named
`reference`; the compiler refused it. Renamed `documentHash`. A minute.

**7. `npm run dev` took the new contract with no change to the loop.** The loop reads the first
`Name: 0x...` line the deploy script prints and the contract's `requestId()`, so `Deploy.s.sol` prints
`InvoiceFinancing:` first and gives the other addresses labels with a space in them, and the loop
seeded Anvil accounts 2 to 6 into the five states on request id 708, the investor gate. It knows
nothing of a second gate: the lister gate's states (account 8 a current delegate, account 9 a removed
one) are two `setStatus` calls in the rehearsal script on the same mock, request id 0. The dev state
panel and the web app would need the same second seeding, and the web app still speaks the template's
`GatedERC20` ABI; it was not touched and not built, because the prompt does not ask for a page.

**8. The prompt does not say who repays, or whether release is a step.** "Repayment releases funds"
can mean the debtor pays and the money moves in the same transaction, or the business repays and the
investor collects. This run chose: anyone may pay the face value in (the debtor may not hold a
Redbelly wallet at all; the business collects off chain and repays here), and the investor collects
in a second call that re-checks the investor gate, so a lapsed credential freezes the money in the
contract until it is restored (shown live in the rehearsal, step 8 and 9). That is the kit token's
policy for a lapsed holder, applied here. The prompt should say which it means, and the card's page
should say that a frozen repayment is a policy choice.

**9. One adapter per business means one contract per business.** The recipe pins one
`BusinessDelegateAdapter` per `BusinessIdentifier`, so as written this contract serves one business's
delegates; a marketplace for many businesses needs an adapter that answers for a registry of
identifiers, which the recipe does not yet describe. Related: the advance is paid to the delegate
wallet that listed, which the recipe calls a service account. A real deployment would want the
business's treasury address pinned by the business, and how that address is checked is a question
for the recipe (a representative sets it? the identifier contract names it?). Recorded, not built.

**10. The two gates are independent, and the rehearsal shows it in both directions.** The valid
investor cannot list (`NotEligible(…, 0)`), the delegate cannot fund (`NotEligible(…, 708)`), and the
test with a second `ReceptorMock` proves the lister gate reads its own verifier and not the investor's.
`isLister` and `isEligible` on the fork answer the same way for the same wallets.

## The rehearsal, as it ran (`rehearsal-output.txt`)

Ten steps on a fork of testnet (chain 31337, blocks 3,052,411 to 3,052,432), every sender an unlocked
Anvil account. The contract, the mock verifier answering both gates and the mock stablecoin read back
from `deployments/local.json`; account 8 made a delegate and account 9 a removed one on request id 0
(49,523 gas each); `isLister` true, false, false for the delegate, the former delegate and the valid
investor, `isEligible` false for the delegate and true for the investor; 9,700 mUSD minted and
approved by each of the five investor wallets so a refusal is the gate and not an empty purse; invoice
1 listed by the delegate at 10,000 mUSD, 300 basis points, due in 30 days (147,535 gas), `advanceFor`
reading 9,700 mUSD; the former delegate and the valid investor refused on `list` with
`NotEligible(wallet, 0)`; the valid investor funding invoice 1 (75,918 gas) and the business's balance
going from 300 to 10,000 mUSD in the same block; invoice 2 listed and the NeverIssued, Expired,
Revoked and WrongJurisdiction wallets, then the delegate, refused on `fund` with `NotEligible(wallet,
708)`, and the investor refused on funding invoice 1 twice with `WrongStatus(1, Listed, Funded)`;
release before repayment refused `WrongStatus(1, Repaid, Funded)`; the business repaying invoice 1
(59,839 gas), the contract holding 10,000 mUSD; the NeverIssued wallet and the delegate refused on
`release`, the investor's credential revoked on 708 and the investor refused on `release` with the
money still in the contract; the credential restored, the release (69,670 gas) and the investor
holding 10,000 mUSD having paid 9,700; a second release and a repayment of the unfunded invoice 2
refused. Fourteen refusals, each decoded to its name, arguments and selector.

## Not done

- **A real verifier behind either gate.** The `BusinessDelegateAdapter` the business-delegate recipe
  describes is unwritten, and no `ZKPVerifier` child for request 708 exists in this project. On a
  real network `BUSINESS_VERIFIER` and `VERIFIER` must be set to real contracts; the deploy script
  refuses mainnet without them.
- **A testnet deploy and a Routescan verification.** Not in this card's prompt. The deploy script is
  ready and reads public addresses only. The owner's testnet wallet decision (card 13's record, 17
  October) would cover it.
- **Slither and Aderyn triage, beyond reading.** Slither: one Low on the new contract, the due-date
  comparison (finding 3), left as it is; its other three notes are the template's `IssuerRegistry`.
  Aderyn: `Centralization Risk` on `Ownable` and the two owner-only setters (the owner is meant to be a
  Safe; the deploy hands it to `ADMIN_SAFE` or, on testnet without one, the deployer), `Empty Block`
  on `_authorizeVerifierChange` (the kit's own idiom, the body is the modifier), `Large Numeric
  Literal` on `BPS = 10_000`, `Modifier Invoked Only Once` on `listerGated`. All read; none changed.
- **The web page.** The template's page speaks `GatedERC20`'s ABI. A page for this card would need the
  three roles' views and the second gate's state in the dev panel.
- **Cancelling an unfunded listing, enforcing the due date, late fees.** An invoice listed and never
  funded simply sits at `Listed`; the due date is recorded and not enforced.
- **A business treasury address and a many-business adapter.** Finding 9.
- **A second agent.** The plan asks for two.
- **The hand-written project page and the terminal recording.**

## How to repeat it

```
mkdir -p ~/code && cd ~/code
npm create redbelly-dapp@latest card-8 -- --yes
cd card-8 && npm install && npm run contracts:install && npm run test     # 68 green
git init && git add -A && git commit -m baseline
# add the files beside this record where their names say:
#   InvoiceFinancing.sol -> contracts/src/, MockStablecoin.sol -> contracts/src/mocks/,
#   InvoiceFinancing.t.sol -> contracts/test/, Deploy.s.sol -> contracts/script/ (replaces the template's),
#   rehearse-invoices.sh -> scripts/
npm run test                                   # 89 green
(cd contracts && forge fmt --check)
npm run dev -- --no-web --port 8548            # in one shell; forks 153, deploys, seeds 708
bash scripts/rehearse-invoices.sh | tee rehearsal-output.txt     # in another
npm run preflight                              # 5 of 7 with the transcript present, 6 of 7 without; DEPLOYER expected to fail
npm run lint:slither; (cd contracts && aderyn . -o ../aderyn-report.md)
```
