# Card 6, Carbon credit registry, the agent track: run of 2026-10-17

## Verdict

Proven on a fork of testnet, and not further. One new contract, `CarbonCreditRegistry` (198 lines,
ERC-1155 batches on the scaffold's `Gated` base), compiles under the scaffold's strict linter (a
warning fails the build, and one did, see finding 3), `forge fmt --check` is clean, 88 tests pass in
8 suites (the default template's 68 and 20 new ones, one of them a fuzz over two retirement amounts),
pre-flight clears 6 of 7 (the one failure is `DEPLOYER is a public address`, which the shared step
says to expect before a wallet is set; a second failure appeared and went away, finding 5), and the
registry's whole day was rehearsed on a local fork of testnet in twelve steps with every refusal the
right one: 11 refusals, 3 transactions mined, 2 events decoded. The web app was not touched, so its
typecheck and build were not run.

Timings. Scaffold: `npm create redbelly-dapp@latest card-6 -- --yes` 0 s on the clock (the 0.2.1
package was already in this Mac's npx cache), `npm install` 28 s,
`npm run contracts:install` 2 s, `npm run test` 3 s (68 green), baseline committed 14:46 local. The
session was then cut off by a rate limit and resumed later; the reading of the scaffold, the recipes
and the two credential schemas sits inside that gap and cannot be separated from it on the clock.
From the first file of the registry (16:54) to the end of the rehearsal (16:59) 5 minutes; pre-flight
and the last commit at 17:00. The loop's fork came up in 20.0 s the first time and 4.3 s the second.

**What the prompt asks for and this run did not do:** residency as a predicate inside the over-18
query, as a query a verifier on this network would evaluate. The predicate is written where the
prompt says to write it (`holder-request-18.json`, beside this record) and the contract binds the one
request id the prompt wants, but the schemas and the recipe both say that query cannot run as one
on-chain request today; finding 1 has the reasons. The prompt names no network and no proof, so no
testnet deploy and no Routescan verification were asked for and none was made. No subgraph was built;
the prompt asks for an event a subgraph can index, and the rehearsal shows that event decoded from the
log. Nothing was signed or sent to a real network; the fork ran as chain 31337 and every sender was an
unlocked Anvil test account (indices 3, 7, 8 and 9 and, as refused recipients, 2, 4, 5 and 6; never 0
or 1).

Agent: Claude Code (Claude Fable 5.1). One agent; the plan asks for two.
Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1 (forge, anvil, cast). Project: a fresh
scaffold made the same day from the published packages, `npm create redbelly-dapp@latest card-6 --
--yes` (the default `gated-erc20` template), `npm install`, `npm run contracts:install`, committed as
the baseline before the card began (68 tests green). Slither and Aderyn were not run; see "Not done".

## Where the card comes from

PLAN.md section 14.2, card 6, the carbon credit registry: a registry worth what its issuers are
worth, where the right to mint is a credential the contract checks rather than a key someone was
handed, and where every retirement is a transaction that can never be undone. It is the card that
teaches two gates on one contract and the difference between a recipe and a predicate inside one;
PLAN 14.1 fixes that residency is a predicate inside a query and not a recipe of its own, which is why
`recipes/` has no residency folder and the card's prompt says so in its last sentence.

## The prompt, as run

> Build a registry where an accredited issuer mints credits with a project ID and vintage, holders
> can retire credits permanently, and retirement emits an event a subgraph can index. Gate minting
> to issuer credentials and holding to over-18 residents of AU or NZ. Residency is a predicate
> inside the over-18 recipe's query, not a recipe of its own, so add it to that query rather than
> reaching for a second gate.

## What was built (files beside this record)

`src/CarbonCreditRegistry.sol`, 198 lines, `ERC1155`, `AccessControl` and the scaffold's `Gated`:

- Credits are ERC-1155 batches. `mint(to, projectId, vintage, amount)` opens a new token id per
  call and stores the issuer, the project id, the vintage, the amount issued and the amount retired
  in a `Batch`; it emits `Issued`. An empty project id, a zero vintage or a zero amount is refused
  with a named error.
- Two gates, one verifier. The `Gated` base binds the holder gate, request 18 (the over-18 query
  with the residency predicate in `requests/holder-request-18.json`); `_update` runs it on the real
  sender and the real recipient of every mint, transfer and burn, never on an approved operator, the
  way the scaffold's token does. The minting gate is a second request id on the same verifier,
  `issuerRequestId()`, 100 (`recipes/accredited-issuer`), checked in `_requireIssuer` and refused
  with the same `Gated.NotEligible(wallet, requestId)` error, so one error shape carries the id that
  said no. `mint` also carries `gatedFor(to)` so the rule is visible in the ABI.
- `retire(batchId, amount, beneficiary, reason)` burns from the caller and adds to the batch's
  `retired` counter, which no function decrements (the rehearsal's last step lists every
  state-changing function in the ABI). It emits `Retired` with the batch id, holder and beneficiary
  indexed and the project id, vintage, amount and reason in the data, so a subgraph builds a
  retirement row from the log alone. `outstanding(batchId)` is issued minus retired.
- Policy, stated in the contract so a reviewer can disagree: a holder whose credential lapses is
  frozen, not free to retire, because the holder gate runs on the burn as on every transfer. The
  prompt does not decide this; the scaffold's token takes the same position for `burn`.
- `setIssuerRequestId` for the admin, because the accredited issuer recipe says to move to a new
  request id when a trusted issuer is dropped, so proofs accepted under the old list stop counting.
  The test `test_setIssuerRequestId_adminOnly` shows that happening.

Also `requests/holder-request-18.json` (the holder query as the prompt asks for it, with a `verify`
entry in the recipes' own style saying why it cannot run as written), `script/DeployRegistry.s.sol`
(the scaffold's pre-flight, then the one contract; `REQUEST_ID` and `ISSUER_REQUEST_ID` from the
environment, 18 and 100 by default), `test/CarbonCreditRegistry.t.sol` (20 tests),
`scripts/rehearse-registry.sh` and the deployment record the script wrote on the fork. The scaffold's
own files are untouched: `git diff --stat` against the baseline shows 8 files added and 922 lines
inserted, nothing deleted, and `npm run dev` still deploys the template's `GatedERC20` as shipped.

## What the run found

**1. The residency predicate cannot be added to the over-18 query as one on-chain request today.**
Two facts, both read on 17 October 2026 from `receptor-schema` at commit 3b37c11, the commit the
recipes cite. `PassportCredential`, the type the over-18 query is written on, has no residency
field: its subject fields are `name`, `passportNumber`, `nationality`, `birthDate`, `expiryDate` and
`publicAddress`, and nationality is not residence. Country of residence is the `country` field of
`ProofOfAddressCredential`, a different credential type, and it is free text with no stated code
list, so a resident of Australia might carry "Australia" or "AU". The over-18 recipe itself records
that on-chain verification supports a single query, one credential type and one field per request,
and the accredited issuer recipe says the same ("oneConditionPerRequest"). So "add residency to the
over-18 query" has three honest shapes and the prompt rules out the one the chain supports: a second
request (say 22) on `ProofOfAddressCredential` with `country $in [...]` and an AND in the contract,
which is a second gate; an off-chain multi-query through the Eligibility SDK, which the contract
cannot see and therefore cannot enforce; or a verifier release that evaluates two predicates in one
request, which nothing in Redbelly's docs describes. This run did what the prompt says, wrote the
predicate into the query document and bound one id, and marks the query `verify`. The prompt is the
lead's to reword; the honest rewording probably keeps the lesson (a predicate is not a recipe) and
drops the claim that it fits inside the over-18 request, or says in the open that the residency
half waits for the verifier.

**2. "Two gates on one contract" fits the `Gated` base with one small addition.** The base binds
one request id. The second gate is eleven lines: a stored `issuerRequestId`, an admin setter with an
event, and `_requireIssuer`, which asks the same verifier for the other id and reuses
`Gated.NotEligible`. The five-state helper tests it unchanged
(`assertRevertsForAllInvalidStates(registry, mint(...), issuer, 100)`), because the helper takes
the request id as an argument. Worth saying on the card's page: the second gate does not need a
second verifier, it needs a second `setZKPRequest`.

**3. The scaffold's linter is strict, as promised.** A local variable named `batch` next to the
getter `batch()` is warning 8760 (shadowing), and under `deny = "warnings"` it failed the build. One
rename fixed it. Card 13 met the same wall with a `view` warning.

**4. A Foundry trap in the tests, not the contract.** Two admin tests failed on the first run with
the wrong caller in `AccessControlUnauthorizedAccount`: `vm.prank(alice)` was consumed by the
`registry.DEFAULT_ADMIN_ROLE()` read inside the `expectRevert` argument, an external call, so the
real call came from the test contract. Reading the role into a local before the prank fixed it. The
contract did not change.

**5. Pre-flight's secret scanner flags a saved rehearsal transcript.** With `rehearsal-output.txt`
in the project, the check "no key-shaped value in the project's files" failed on it: a transaction
hash is 64 hex characters, the shape of a private key. With the transcript moved out, 6 of 7. The
scanner is right to be blunt, and `preflight.mjs` already says a hash and a key share the shape; a
builder who keeps transcripts in the project should expect this line, or the scanner could skip
`.txt` and `.md` files that hold the word "tx" beside the hex. One for the preflight package.

**6. `cast logs` on a fork needs `--from-block`.** Without it the query starts at block 0 and the
forked RPC answers "requested too large block range". The rehearsal reads the block number from the
receipt and bounds the query to it. Foundry 1.7.1.

**7. The local loop expects `Deploy.s.sol`, as card 13 found.** `npm run dev` deploys the template
token and seeds the five wallets on request 18 against its `ReceptorMock`. The registry deploys by
hand with that mock as `VERIFIER`, so the five seeded states apply to its holder gate unchanged, and
the issuer credential (request 100) is set on the same mock from the deployer. One mock, two ids,
which is also how a real verifier would hold two requests.

**8. The prompt names no network and no proof.** PLAN 14.1 says every prompt names a recipe, a
network and a proof. Card 6's names two recipes and no network, no test sentence, no verification.
Cards 5 and 13 say "Testnet. Five-state tests ... verified on Routescan." This run tested both
gates and retirement in the five states because the scaffold's rules file demands it, not because
the prompt did. Another candidate for the rewording.

## The rehearsal, as it ran (`rehearsal-output.txt`)

Twelve steps on a fork of testnet (chain 31337, forked 153 at block 3,052,396): the registry
deployed after the scaffold's pre-flight with the loop's mock as its verifier, request 18 and 100
read back; Anvil 8 given the issuer credential and `isIssuer` saying true for it and false for
Anvil 9; 100 credits of VCS-1234 vintage 2024 minted to the Valid holder (185,633 gas) and the
`Issued` event decoded from the log with batch 1, the issuer and the recipient in the topics; a mint
from Anvil 9 refused with `NotEligible(0xa0Ee..., 100)`; a mint into each of the four ineligible
recipients refused with `NotEligible(wallet, 18)`, batch count still 1; 10 credits transferred to a
second eligible holder (69,960 gas); transfers to a NeverIssued and a Revoked wallet refused, the
sender's 90 untouched; 40 credits retired for "FY26 offset" (75,292 gas) and the `Retired` event
decoded with "VCS-1234", 2024, 40 and the reason in its data, outstanding 60; a retirement of 51
against a balance of 50 refused with `ERC1155InsufficientBalance`, the counter still 40; Anvil 9's
credential expired and its retire and transfer refused, its 10 credits frozen and not lost; the
issuer's credential revoked and the next mint refused on request 100; and at the end the list of
every state-changing function in the ABI, none of which touches `retired` downwards.

## Not done

- **A query a verifier would run for the holder gate.** Finding 1. The predicate is written and
  marked `verify`; it waits on the lead's rewording and, like every recipe, on the Eligibility SDK
  token and a verifier API key that no session can obtain.
- **Testnet deploy and Routescan verification.** Not asked for by this prompt (finding 8). The
  deploy script is ready and reads only public addresses.
- **A subgraph.** The prompt asks for an event an indexer can use, not the indexer. The ops kit's
  subgraph template is the place to point `Retired` at when Goldsky access exists.
- **Slither and Aderyn.** Not run in this session. Both are installed on this Mac since 11 October
  (Slither 0.11.6, Aderyn 0.6.8) and the lead can run `npm run lint:slither` and
  `npm run lint:aderyn` on the project at `~/code/card-6`.
- **A second agent.** The plan asks for two.
- **The web app.** Untouched; no page shows a batch or a retirement. Typecheck and build were
  therefore not run.
- **The hand-written project page and the terminal recording.** The card's page is generated from
  the card data and links here.

## How to repeat it

```
npm create redbelly-dapp@latest card-6 -- --yes
cd card-6 && npm install && npm run contracts:install
git init && git add -A && git commit -m baseline
# add the files beside this record where their names say:
#   contracts/src/CarbonCreditRegistry.sol, contracts/script/DeployRegistry.s.sol,
#   contracts/test/CarbonCreditRegistry.t.sol, contracts/requests/holder-request-18.json,
#   scripts/rehearse-registry.sh
npm run test
npm run dev -- --no-web --port 8546        # in one shell; wait for "ready"
bash scripts/rehearse-registry.sh          # in another; nothing here can sign on a real network
npm run preflight
```
