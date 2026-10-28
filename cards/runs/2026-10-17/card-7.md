# Card 7, Event tickets with an age gate, the agent track: run of 2026-10-17

## Verdict (updated 25 October 2026)

**Deployed on testnet and verified on Routescan.** On 25 October 2026 the owner deployed the ticket to chain 153
from her dev wallet (`0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59`, a keystore in her own Terminal, the key never in a
file or the chat), in the shape of Part 5 of the deploy draft: pre-flight 9 of 9, the Slither sidecar fresh, a
no-broadcast dry run against 153, the ship report written by `redbelly ship` 0.2.3 read-only by address (every
check, 95 tests with `GatedTicketTest` among the five-state suites, `ship-153-2026-10-25.md` beside this record),
then `VERIFIER=<the shared mock> forge script script/Deploy.s.sol --rpc-url redbelly_testnet --account rbn-testnet
--sender <her address> --broadcast`. Two transactions in one broadcast, both in block 3,056,726 (12:27:05 UTC) at
312,460.94 gwei: `GatedTicket` ("Card 7 Ticket", TIX) at **0x7296ABEffB78f95B061D9F635714379C43a6E1E1**, transaction
`0x6a74ba5399458e4ed528a606d06fb7e1c23882d6fb65d5a02c88b11ff82ee686`, 2,436,939 gas, 761.45 test RBNT; and
`setSalesOpen(true)` from the deployer as organiser, transaction
`0xfe0bcfd5ed5318ea22f73d494474a9e96ca762161a3949350a9d4028ca4d13a8`, 30,075 gas, 9.40 test RBNT. 770.85 test RBNT
in all (balance 39,610.60 to 38,839.75, read from chain; nonce 12 to 14), against Foundry's dry-run ceiling of
3,212,004 gas. Verified on Routescan the same hour with the command the post-deploy ship report wrote ("Pass -
Verified" after one "Pending in queue").

Her choice for the verifier: the shared `ReceptorMock` of 23 October (`0x2E652B946DC303d8f53bC92D0787e13B109003e5`)
through `VERIFIER`, request id 18, the over-18 recipe, the same request the scaffold's token uses, so a wallet seeded
on 18 for the token is eligible for a ticket too. Read back live after the deploy: `salesOpen()` true, `requestId()`
18, `verifier()` the shared mock, `faceValue()` 1 RBNT, `maxSupply()` 100, organiser and door both the deployer. No
ticket has been bought yet: the live use (a buy, a resale under the cap, the door, a refund) is hers to sign and
needs a wallet seeded on request 18 on the shared mock. Forge's closing "Total Paid" line (14.53 RBNT) disagrees
with its own two receipts again; the receipts and the balance are right. Files added beside this record:
`deployment-153-GatedTicket.json`, `broadcast-153-run-latest.json`, `ship-153-2026-10-25.md`.

**Live use on 153, 26 October 2026, and card 7 finished on testnet.** Eleven transactions in four signed phases
(`LiveTicket.s.sol`, `PHASE=1` to `4`), blocks 3,056,856 to 3,056,865, 238.47 test RBNT in gas, the refusals between
the phases read against the live network (`live-ticket-153-transcript.txt` has every hash and every refusal). Her wallet
seeded Valid on 18 on the shared mock, ticket 0 bought at 1 RBNT (72,725 gas) and listed at the cap; refused live: a
stranger on `buy` and on `purchase` at the gate, her own ticket (`OwnTicket`), the cap plus one wei
(`AboveResaleCap`), a half-price purchase (`WrongPrice`). Delisted and checked in by the door; refused live: list and
transfer of the used ticket (`TicketUsed`), a second check-in (`AlreadyCheckedIn`), a buy of the delisted ticket
(`NotListed`), the door by a wallet without the role. Ticket 0 refunded at face value, ticket 1 bought (157,781 gas, a
cold mint), her credential set Revoked; refused live: a new purchase (`NotEligible`), and the plain transfer of ticket 1
to an eligible second holder (`TransferOnlyThroughResale`), the rule the ticket was built around, for its own reason.
Ticket 1 refunded to the revoked holder (a burn checks nothing), the credential restored; two tickets in, two out, the
contract at zero, the sale still open. Not shown live, by the nature of one enabled wallet: a resale to a second buyer,
which needs the buyer to send; proven on the fork below. With the deploy of the 25th, 1,009.32 test RBNT in all. Card 7
is finished on testnet under the bar of 25 October: deployed, verified, its life run on 153, the record written. Its
public repository waits on the 0.2.3 publish.

The verdict of 17 October stands below as written then.

## Verdict, 17 October 2026

Proven on a fork of testnet, and not further. One new contract, `GatedTicket`, on the scaffold's
`Gated` base and verifier exactly as the scaffold's own token is wired, compiles under the scaffold's
strict linter (a warning fails the build), `forge fmt --check` is clean, 95 tests pass in 8 suites
(the default template's 68 and 27 new ones, one of them a fuzz over the resale price, 512 runs),
pre-flight clears 6 of 7 (the one failure is `DEPLOYER is a public address`, which is what the
shared step says to expect before a wallet is set), the web app type-checks and builds with
`/tickets` in the production route list, Slither has nothing to say about the ticket and Aderyn's
notes on it are read and triaged below, and the ticket's whole day was rehearsed on a local fork of
testnet in 11 steps with every refusal the named error: the five seeded wallets buying, a resale
over and under the cap, a plain transfer, the door, a transfer after check-in, two refunds.

Timings. Scaffold 1 s, `npm install` 40 s, `npm run contracts:install` 2 s, the first
`npm run test` 3 s (68 green). The local loop was ready in 17.6 s by its own clock (Anvil forked
153 at block 3,052,398 in 3.9 s; the permission-gate step took 8.5 s of RPC reads) and the
rehearsal took 13 s. The clock from the baseline commit (14:46:28 local) to the rehearsal commit
(17:05:31) reads 2 h 19 min, but that span holds a pause: the agent was cut off by a rate limit
after the baseline and resumed later, so the honest active figure is the stretch from the ticket
commit to the end of the rehearsal, 5 min 10 s (17:00:21 to 17:05:31), plus the reading and writing
before the first commit, which the commits do not time.

**What the prompt asks for and this run did not do:** nothing in the card's own words is missing.
The prompt asks for no testnet deploy and no Routescan verification, and none was made; nothing was
signed or sent to a real network, the fork ran as chain 31337, and every sender was an unlocked
Anvil test account (indices 2 to 8; never 0 or 1). What a reader would still want and did not get:
the three frontend states were type-checked and built but not opened in a browser with a wallet
and walked by hand, so "the frontend states" are proven to compile and to branch on the kit's
`EligibilityGate`, not to render. See "Not done".

Agent: Claude Code (Claude Fable 5.1). One agent; the plan asks for two.
Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1, Slither 0.11.6 and Aderyn 0.6.8 present.
Project: a fresh scaffold made the same afternoon from the published packages,
`npm create redbelly-dapp@latest card-7 -- --yes` (the default `gated-erc20` template),
`npm install`, `npm run contracts:install`, committed as the baseline before the card began.

## Where the card comes from

Card 7 of PLAN.md section 14.2, the twelve prompt cards: scope "one contract", recipe `over-18`
(`recipes/over-18/`, request id 18, the Iden3 query `birthDate $lt <cutoff>` on an identity
credential). The card's idea-pool lines say why this network: the buyer proves they are over
eighteen without the organiser ever seeing a birth date, and the ticket enforces its own resale cap
on every transfer. Its "what you will learn" line names the four things the run had to show: gating
an NFT mint, a transfer that checks a price as well as an eligibility, state that changes
transferability, and where the identity layer stops.

## The prompt, as run

> Build an ERC-721 ticket where purchase requires the over-18 recipe, resale is capped at a set
> percentage of face value with the cap enforced inside the transfer itself, tickets are
> non-transferable after check-in, and the organiser can refund. Include the frontend states for
> unverified, ineligible and eligible wallets. Capping how many tickets one person may hold is a
> different problem and is out of scope: the access check proves a wallet is verified, it does not
> prove two wallets are different people. Say so in a comment rather than writing a limit that does
> not hold.

## What was built (files beside this record)

`src/GatedTicket.sol`, 296 lines, `ERC721Enumerable`, `AccessControl`, OpenZeppelin's
`ReentrancyGuardTransient` and the kit's `Gated`:

- `purchase()`, payable, `gated`: exact face value, sale open, supply left, mints the next id to the
  caller. The comment the prompt asks for sits where a per-wallet limit would go: the access check
  proves this wallet holds a valid credential and nothing on this chain proves two wallets are two
  people, so a limit here would read as a promise the identity layer cannot keep.
- `list(tokenId, price)` and `delist(tokenId)` by the holder; a price of zero is a gift. `list`
  refuses a price over the cap so the seller learns at once, but that is a courtesy.
- `buy(tokenId)`, payable, `gated`, `nonReentrant`: exact asking price, not the seller's own
  ticket, moves the ticket and pays the seller in the same call.
- `_update(to, tokenId, auth)`, the hook every mint, transfer and burn passes through, is where the
  rules live. The recipient of every mint and transfer must be eligible (`_requireEligible(to)`).
  A move from one holder to another must happen while `buy` is running (a transient flag) and at a
  price (a transient value) at or under `resaleCap()`, and the ticket must not be checked in. A
  plain `transferFrom` or `safeTransferFrom`, approved or not, reverts `TransferOnlyThroughResale`:
  a cap on a price the contract cannot see is not a cap, so transfers it cannot price are refused.
  A burn checks nothing, so a refund reaches a holder whose credential has lapsed.
- `checkIn(tokenId)` by `DOOR_ROLE`: once, clears any offer, and from then on `list`, `buy` and
  every transfer revert `TicketUsed`.
- `refund(tokenId)` by the organiser (`DEFAULT_ADMIN_ROLE`): burns the ticket and pays its holder
  face value from the contract's balance, on a checked-in ticket too. Proceeds stay in the contract
  until `withdraw`; `receive()` takes top-ups. `setSalesOpen`, `withdraw`; the verifier and request
  id are the organiser's to change through `Gated`'s hook, as in the scaffold's token.
- `resaleCap()`, `canPurchase(wallet)` and `isTransferable(tokenId)` for a UI. Named errors for
  every refusal, because the governors RPC serves no trace methods.

Also `script/Deploy.s.sol` (changed: the scaffold's pre-flight, then the ticket in place of the
token, face value 1 RBNT, 100 tickets, cap 11,000 bps, sale opened when the deployer holds the
admin role; `GatedERC20` stays in `src/` with its tests), `test/GatedTicket.t.sol` (27 tests),
`test/mocks/TicketHarness.sol` (a child that sets the parent's transient flags and calls the
parent's own `_update`, so the test of "the cap lives inside the transfer" exercises the real hook;
never deployed), `scripts/rehearse-ticket.sh`, and on the web side `web/src/app/tickets/page.tsx`
(`tickets-page.tsx` here, new), `web/src/contract.ts` (changed: the ticket's ABI, `purchase`,
`canPurchase`, the payable price read from `faceValue`), `web/src/components/GatedAction.tsx` and
`web/src/app/eligibility/page.tsx` (changed: the write now sends the price the contract publishes),
`web/src/app/page.tsx` (one link), `scripts/abi-sync.mjs` (one name). `npm run dev` deploys the
ticket as the project's contract and reads request id 18 back from it; the kit packages under
`vendor/` and `contracts/lib/` are untouched.

## What the run found

1. **The five-state helper cannot carry value.** `assertRevertsForAllInvalidStates` and
   `assertGatedPair` send a plain `call` with no `msg.value`, and `purchase` and `buy` are payable
   at an exact price, so the Valid leg would fail with `WrongPrice` and the helper would blame the
   gate. The tests walk the five states by hand with the same `invalidStates()` list and the same
   assertion. The kit's 0.2.2 could take an optional `value`. Nothing in the prompt needs rewording
   for this; it is a kit note.

2. **"The cap enforced inside the transfer itself" has a consequence the prompt does not name.**
   The contract can only cap a price it can see. Enforced honestly, that means every holder-to-holder
   move goes through `buy`, where the money passes through the contract, and a plain ERC-721
   transfer is refused: this ticket does not trade on a general marketplace and approvals are
   useless on it. The prompt is right as written; the card's page should say, in words, that a cap
   on resale means refusing the transfers you cannot price, or the first stranger who runs the card
   will write a cap that `transferFrom` walks around.

3. **Who the gate checks on resale.** The prompt says purchase requires the recipe and is silent on
   resale recipients. The run gates every recipient, mint and transfer alike, because a resale that
   skipped the check would put an age-gated ticket in an unverified wallet. The seller is not
   re-checked: a lapsed credential keeps a holder out of the event, not out of selling. Worth one
   clause in the prompt or the page so two agents build the same thing.

4. **The refund amount is a decision the prompt leaves open.** Face value, not what the holder paid
   at resale: the organiser took face value, the resale premium went to the seller. The test
   `test_refund_afterCheckIn_andPaysFaceNotResalePrice` pins it. Say which in the prompt, or accept
   that runs will differ here.

5. **Five tests failed on the first run, and the contract was right.** Each had `vm.prank(x)`
   followed by `ticket.DEFAULT_ADMIN_ROLE()` inside the `expectRevert` argument; the view call spent
   the prank and the refused call came from the test contract. The role constants are read once at
   the top of the test now. Same shape as card 13's finding 3: check the assertion before the code.

6. **The first harness proved nothing.** It mirrored the parent's rule in its own `_update` instead
   of reaching the parent's. Making the two transient flags `internal` let the harness set them and
   call the real hook; `test_capIsEnforcedInsideTheTransfer` and `test_checkIn_beatsAResaleInFlight`
   now exercise the code the record claims they do.

7. **The rehearsal output shows selectors, not decoded arguments.** `cast call` on Foundry 1.7.1
   prints a custom error as the selector and the argument words apart, and the script's one regex
   captured the selector only, so `cast abi-decode --input` had nothing to decode. The proof of each
   refusal is the selector matching `cast sig "<Error(...)>"`, which is what the script asserts; the
   arguments are in the fork's response and a wider capture would print them next time.

8. **The local loop stops on SIGHUP.** `dev.mjs` treats SIGHUP like Ctrl-C (exit 0), so an agent's
   background runner that hangs up its shell takes Anvil down with it, cleanly and silently. The fork
   and the rehearsal ran in one foreground shell instead. Worth a line in the scaffold's README for
   agents; the behaviour itself is right.

9. **Static analysis.** Slither: 3 results, all `timestamp` notes on the scaffold's own
   `IssuerRegistry`, none on the ticket. Aderyn: 8 Low categories across the three sources; on the
   ticket, read and left as they are: centralization risk (the two roles, by design, meant for a Safe
   and a scanner wallet), empty block (`_authorizeVerifierChange`'s body, the exact shape `Gated`'s
   documentation prescribes), large numeric literal (`BPS = 10_000`), `nonReentrant` not the first
   modifier on `buy`, `refund` and `withdraw` (`gated` and `onlyRole` run first; both are reads, so
   the order changes nothing, and a reviewer may prefer it swapped), unchecked return of `_grantRole`
   in the constructor (fresh roles cannot fail to grant) and of `_update` in `buy` (the previous
   owner, already held in `seller`), and unsafe `_mint` (a contract buyer gets no
   `onERC721Received` callback, on purpose: the gate is for wallets, and `_safeMint` would add a
   callback into an unknown contract inside the purchase).

10. **The loop's time is the fork's RPC latency.** 4.1 s on the first start, 17.6 s on the second,
    the difference entirely in the steps that read testnet state through Anvil. Nothing to fix; a
    reader timing their own run should expect either.

## The rehearsal, as it ran (`rehearsal-output.txt`)

Eleven steps on a fork of testnet (Anvil chain 31337, forked 153 at block 3,052,398; the ticket at
`0x07AF11e4…`, the mock at `0x37cA242a…`, both local addresses that repeat because the deployer's
nonce does). The four non-valid seeded wallets (NeverIssued, Expired, Revoked, WrongJurisdiction)
each refused `NotEligible` with `canPurchase` false; the Valid wallet buying ticket 0 for 1 RBNT
(135,081 gas) and the contract holding the RBNT; a 0.5 RBNT offer refused `WrongPrice`; listing at
the cap plus one wei refused `AboveResaleCap`; listing at the cap (1.1 RBNT), a second verified
wallet (Anvil account 8, set Valid on the mock) refused at the cap minus one wei and then paying
exactly the cap, the seller's balance up by 1.1 (89,487 gas); the NeverIssued wallet refused on a
0.5 RBNT resale too; the first holder buying the ticket back under the cap; a plain `transferFrom`
between two verified wallets refused `TransferOnlyThroughResale`; the door checking ticket 0 in
(a holder refused `AccessControlUnauthorizedAccount`), `isTransferable` false; after check-in,
`list` and `transferFrom` refused `TicketUsed`, `buy` `NotListed`, a second check-in
`AlreadyCheckedIn`; the organiser refunding the checked-in ticket at face value, the holder up by 1
RBNT, the contract at zero, `ownerOf` reverting `ERC721NonexistentToken`; and a second ticket bought,
its holder's credential then set Revoked on the mock (the holder refused `NotEligible` on a new
purchase) and the refund still landing.

## What the web page does

`/tickets` reads the ticket's `verifier()` and `requestId()` and hands them with the connected wallet
to the frontend kit's `useEligibility`; `EligibilityGate` then picks the state: not connected,
checking, not verified on the network (`permission.isAllowed` false, with the Access dApp and faucet
links), verified but ineligible for request 18 (the sentence names the requirement, "an over-18
credential"), eligible (the purchase button at the price read from `faceValue`, and a box to buy a
listed ticket by id at its asking price), or expiring soon when the mock can say. Under the gate,
the wallet's own tickets through `tokenOfOwnerByIndex`, each with its check-in state and standing
offer, a Delist button, and a resale box that shows the cap and refuses a higher price in the browser
before anything is signed (the contract refuses it again). Every write is simulated first so a
revert shows its words through `FailureWords`. One paragraph says that check-in and refunds are the
organiser's calls and not on the page, and why there is no per-wallet limit. The scaffold's home
page and `/eligibility` keep working against the ticket: both now send the payable price.

## Not done

- **A browser walk of the three states.** The page type-checks, builds and branches on the kit's
  gate; nobody connected a wallet to it in this run. `npm run dev` on 8547 with the web app, the dev
  state panel flipping account 3 through the five states, is the next twenty minutes.
- **Testnet deploy and Routescan verification.** The prompt does not ask for them; the deploy
  script is ready and takes no arguments beyond the environment. Waits on the owner's wallet.
- **A second agent.** The plan asks for two.
- **The written track and the project page.** The card's page is generated from the card data and
  links here.
- **One request id.** The over-18 recipe says one Iden3 request per credential type (18 to 21 for
  passport, licence, essential id, national id); `Gated` binds one, so the ticket accepts passports
  (18) only. The small OR the recipe describes is a follow-up.
- **The static cutoff.** The recipe's cutoff date is fixed when the request is set; the ticket
  does nothing about re-setting it. Recorded in the recipe, not solved here.
- **A real verifier.** The fork and the tests use `ReceptorMock`. No query in this project has yet
  run against a Redbelly verifier.
- **Aderyn's modifier-order note.** Left as it is and triaged in finding 9; a one-line swap if a
  reviewer wants it.

## How to repeat it

```
npm create redbelly-dapp@latest card-7 -- --yes
cd card-7 && npm install && npm run contracts:install
# add the files beside this record where their names say:
#   GatedTicket.sol -> contracts/src/, GatedTicket.t.sol -> contracts/test/, TicketHarness.sol -> contracts/test/mocks/,
#   Deploy.s.sol -> contracts/script/ (replaces the template's), rehearse-ticket.sh and abi-sync.mjs -> scripts/,
#   tickets-page.tsx -> web/src/app/tickets/page.tsx, eligibility-page.tsx -> web/src/app/eligibility/page.tsx,
#   home-page.tsx -> web/src/app/page.tsx, contract.ts -> web/src/, GatedAction.tsx -> web/src/components/
npm run test                                   # 95 tests, 8 suites
cd contracts && forge fmt --check && cd ..
npm run build && npm run abi:sync              # writes web/src/abi/GatedTicket.json
npm run dev -- --no-web --port 8547            # in a shell that stays open
bash scripts/rehearse-ticket.sh | tee rehearsal-output.txt
npm run preflight                              # 6 of 7 until DEPLOYER is set
npm run lint:slither && npm run lint:aderyn
cd web && npm run typecheck && npm run build   # /tickets in the route list
```
