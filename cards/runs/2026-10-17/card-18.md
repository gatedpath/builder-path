# Card 18, Pay the register, the agent track: run of 2026-10-17

## Verdict

Proven on a fork of mainnet against a real register, and not further. The stablecoin read came
first and read-only: none of the three AUD coins on mainnet refuses a contract sender, so the tool
is a contract and the "pay from the wallet one transfer at a time" fallback was not needed (the
finding is one section down, and in `stablecoin-read.md` beside this record). Then one new contract,
`RegisterDistributor`, 235 lines, compiled under the scaffold's strict linter with no warning on its
first build, `forge fmt --check` clean without a reflow, 84 tests pass in 8 suites (the template's 68
and 16 new ones, one a fuzz over tables of up to 40 holders and any total), pre-flight clears 6 of 7
(the one failure is `DEPLOYER is a public address`, which every record this week says to expect), and
a whole distribution was rehearsed on a local fork of mainnet: the real CLASS A register
0x0Eea5afF22b8B5e89CAdd84ed1a18b828404e392, its real holder table of 78 wallets rebuilt from 526
Transfer events read in 1,697 windows of 100 blocks and checked by `balanceOf` at block 3,228,698
(the sum equals the register's `totalSupply` to the unit), paid 100,000 units of a mock stablecoin
from Anvil account 8 in two `pay` transactions, one holder failing on a deny list and paid on a retry,
every one of the 78 amounts checked against `total * balance / totalBalance`, 38 units of dust left
in the payer's wallet, zero events on the register, and a 78-row receipt exported from the log.
Nothing was signed on a real network; the fork ran as chain 31337 and every sender was an unlocked
Anvil account (indices 2, 3, 7 and 8 across the probe and the rehearsal; never 0 or 1).

Timings. `npm create redbelly-dapp@latest card-18 -- --yes` 0.26 s (the 0.2.1 tarball was cached),
`npm install` 20.1 s, `npm run contracts:install` 1.4 s, `npm run test` 2.6 s for the baseline's 68
and 1.2 s for the 84 after. The fork loop (`--chain 151 --no-web --port 8558`) was ready in 14.4 s,
2.3 s of that forking mainnet at block 3,228,698. The holder table took 5 min 22 s from the public
RPC (finding 2). The rehearsal ran in 16.5 s, pre-flight in 1.6 s. Wall time in two sittings: the
stablecoin read, the scaffold and the baseline commit from 17:18 to about 17:40 BST, when the
agent's session limit cut in during the fork probe; the rest from 22:36 (the probe redone, since the
scratch files had gone) to the first green commit at 22:43, the rehearsal at 22:52 and this record
at 22:54. From the resumed start to the end of the rehearsal: 16 minutes.

What the prompt asks for and this run did not do: the testnet path (a mock stablecoin and a register
from project 15's suite; this run took the prompt's other door, the fork of mainnet), the ship report
(`npm run ship` is a deploy-day step and nothing was deployed to a real network), and the interface
("show it with the block it was read at", "say so in the interface"): no web page was built, and the
block is carried by the holder table's JSON and the `Opened` event instead. About the real
stablecoins, what could only be probed and not read: AUDD's implementation is unverified, so its
transfer rule was established by bytecode selectors and by behaviour on the fork, not by source
(finding 1). What the path's own standard asks for beyond the prompt: the deploy to testnet and the
Routescan verification, both of which need a wallet the agent does not sign with.

Agent: Claude Code (Claude Fable 5.1). One agent; the plan asks for two.
Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1 (cast, forge, anvil), Slither, Aderyn.
Project: a fresh scaffold made the same afternoon from the published packages, `npm create
redbelly-dapp@latest card-18 -- --yes` (the default `gated-erc20` template), `npm install`, `npm run
contracts:install`, committed as the baseline before the card began (68 tests green). The scaffold's
own files are untouched: `git diff --stat` against the baseline shows additions only, nine files
(eight written by hand and the deploy script's record `deployments/31337-RegisterDistributor.json`),
and `npm run dev` still deploys the template's `GatedERC20` exactly as shipped.

## Where the card comes from

Card 18 is PLAN 23.4d's third piece and the Tokeniser note's section 8, item 3: the first dApp that
writes to a register's holders without a register transfer. The register reader (ops kit,
`register.mjs`, confirmed against this same CLASS A register on 12 October) and the register explorer
(card 17) are the reads it stands on; this card is the write. Its page says it teaches rebuilding a
holder table from events, choosing a snapshot block, paying pro rata without dust, writing to a
stablecoin while never touching a register, and reading another issuer's token before building on
it. The missed-tutorials draft of 17 October put it on the grid as an unrun card with the stablecoin
read as its first step; this is its first run.

## The prompt, as run

> Build a distribution tool for an ERC-3643 register that exists on the network. Rebuild the holder
> table from the chain (Transfer events windowed at 100 blocks per eth_getLogs, then balanceOf at one
> block) and show it with the block it was read at. A contract that takes a stablecoin, a register
> address, a total and a snapshot block, and pays every holder pro rata to its balance at that block,
> in one or more transactions, with an event per payment and a receipt log the administrator can
> export; the payer is the administrator's own verified wallet and the contract writes stablecoin
> transfers only, never register transfers, so it crosses no register gate. Before anything else,
> read whether the AUD stablecoins on mainnet gate their senders or recipients and whether a contract
> may send them, and say what you found; if a stablecoin refuses contract senders, pay from the wallet
> one transfer at a time and say so in the interface. Testnet with a mock stablecoin and a register
> you deploy from project 15's suite, or a fork of mainnet against a real register with nothing signed
> on the real network. Tests for a holder whose balance moved after the snapshot block, a holder with
> zero balance, rounding dust, and a payment that fails part way. Pre-flight clean, a ship report.

## What the stablecoin read found

Read-only, before any code: `cast call` against governors.mainnet at block 3,228,539, the verified
sources from Routescan, and a transfer probe on a local Anvil fork of mainnet at block 3,228,694.
The full account, with every address, is `stablecoin-read.md`; the evidence is
`mainnet-source-read.txt` and `stablecoin-probe-output.txt`; the probe's throwaway contract and
script are in `probe/`.

- **AUDM** (Macropod, 18 decimals, 0x081599E4…) is Fireblocks' `ERC20FGasless` behind a UUPS proxy,
  verified. Its `transfer` and `transferFrom` check `from` and `to`, never the caller, against an
  access registry; the one set on mainnet (0xe97323c3…) is Fireblocks' `DenyList`, verified:
  `hasAccess` is `!contains(account)`, and an address on no list answers `true`. So AUDM refuses
  senders and recipients its administrator has denied, and nobody else; a contract spending an
  approved allowance is not examined at all. Pausable, not paused.
- **AUDD** (6 decimals, 0x54a210e8…) is an `AdminUpgradeabilityProxy` (verified) to an implementation
  that is **not verified** on Routescan. Its 33 dispatcher selectors, extracted from the bytecode and
  named with `cast 4byte`, are the ERC-20 set, `paused`, `owner`, `swap`, and a request-and-vote
  control layer (supply, threshold, signatory and "transaction control" requests). No blacklist,
  freeze, allowlist, access-registry, permit or authorization selector is present, and every such
  call reverts. Because "transaction control request" could hide a per-transfer rule, the behaviour
  was probed rather than assumed.
- **rAUD** ("Australian Dollar", 6 decimals, 0xf950b1be…) is OpenZeppelin 5.6.0 `ERC20` + `Ownable`
  with owner `mint` and `burn`, verified, and no gate of any kind. The second rAUD contract
  (0x33476…) is unverified and was not probed.
- **A contract may send all three.** On the real chain, Routescan's transfer lists already show a
  contract sending each coin: the Aave aAUDD contract (0x73654a26…, 1,779 bytes of code) sends AUDD,
  and the aAUDM contract (0x5aedfe9e…) sends AUDM. On the fork, a throwaway `Forwarder` contract
  received each coin from an impersonated real holder, sent it on with `transfer`, pulled it with
  `transferFrom` as the spender (the path the distributor uses), and a fresh wallet on no list sent
  one unit; twelve transactions, all status 1.

In one sentence: AUDM gates by deny list on sender and recipient, AUDD and rAUD gate nobody that
source or bytecode or behaviour can show, and all three let a contract send them, so the tool is a
contract and the wallet fallback stays a tested case rather than the design.

## What was built (files beside this record)

`src/RegisterDistributor.sol`, 235 lines, on OpenZeppelin's `ReentrancyGuardTransient` (the rules
file's "use transient storage for reentrancy locks"), no roles, no admin, no funds held:

- `open(stablecoin, register, snapshotBlock, total, holders[], balances[])`: records a distribution
  and transfers nothing. The holder table comes from off chain because no contract can read a past
  balance; the register's address and the snapshot block are stored and emitted so the receipt can be
  checked against the chain, and nothing else is done with them. Refuses mismatched lengths, an empty
  table, more than `MAX_HOLDERS` (2,000), a zero total, a zero holder, a duplicate holder (a mapping
  set in the same loop; a duplicate would be paid twice), a stablecoin or register without code, a
  snapshot in the future and a table whose balances sum to zero. The caller is the payer.
- `pay(id, maxCount)`, payer only: pays the next `maxCount` holders in table order, each
  `floor(total * balance / totalBalance)`, by `transferFrom(payer, holder, amount)`; zero balances are
  `Skipped`; a transfer that reverts or returns false is `Failed` with the coin's reason in the event
  and the batch carries on. `Paid`, `Skipped` or `PaymentFailed` per holder; `Completed(paid,
  paidCount, failedCount, dust)` when the cursor reaches the end, where dust is what the floors left
  in the payer's wallet.
- `retry(id, holder)`, payer only, for a `Failed` holder, for instance after a deny-list entry is
  lifted. `close(id)` ends the distribution once every holder has been reached.
- Reads for a UI and the receipt: `distribution(id)`, `holderAt(id, i)`, `statusOf(id, holder)`.
  Named errors for every refusal.

`script/DeployDistributor.s.sol` (the scaffold's pre-flight, then the one contract, no arguments);
`test/RegisterDistributor.t.sol` (16 tests); `test/mocks/MockStable.sol` (six decimals; can deny an
address, refuse contract spenders, or return false for an address, the three refusals a real coin
might make) and `test/mocks/MockRegister.sol` (an ERC-20 that answers `identityRegistry()` with a
contract and refuses any transfer whose parties are not both registered, the way a T-REX token does).

`scripts/holders.mjs` (Node, no dependencies): binary-searches `eth_getCode` for the register's first
block, reads every Transfer in windows of 100 blocks (two in flight, with a backoff on the RPC's
"exceeded filter rate limit"), then `balanceOf` for every address that ever received, at the
snapshot block; writes JSON with the snapshot block, the chain head at the read, the first block,
the window count, the transfers seen, the holders with a balance and the addresses at zero.
`scripts/receipt.mjs`: reads the distribution's events in 100-block windows and writes one CSV row
per holder (status, amount, snapshot balance, block, transaction, reason) and a JSON summary.
`scripts/rehearse-distribution.sh`: the ten steps below.

The tests, and the four the card names. A holder whose register balance moved after the snapshot
(alice sells 400 of her 500 units to bob on the mock register ten blocks later; both are paid on the
snapshot). A zero-balance holder (in the table, `Skipped`, no transfer, amount 0 in `holderAt`).
Rounding dust (three equal holders and a total of 100: 33 each, `Completed` reports dust 1, and the
unit is still in the payer's wallet). A payment that fails part way (bob denied: alice before him and
carol after him are paid in the same transaction, bob is `Failed` with `Denied(bob)` in the event, a
retry while still denied fails again and the count holds, a retry after lifting pays him, a third
retry is refused `NotFailed`). Also: a coin that returns false; a coin that refuses contract spenders
(every payment fails, the money stays, and the wallet's own `transfer` works, the fallback the prompt
names); the distributor never touches the register (no event from the register's address in the
whole batch, supply and balances unchanged, the distributor not verified on the identity registry);
one and several transactions reach the same result; one event per payment; every refusal in `open`;
payer-only `pay`, `retry` and `close`; closing only when finished; two distributions on one contract
not mixing; and the fuzz: for any total up to 1e15 and any table of 1 to 40 holders, paid plus dust
equals the total, the dust is under one unit per holder, and the wallet still holds the dust.

The outputs beside this record: `holders-classA-3228698.json` (the real table, 78 rows),
`holders-run-output.txt`, `rehearsal-output.txt`, `receipt.csv` and `receipt.json`,
`dev-loop-output.txt`, `test-output.txt` (the 84), `preflight-output-1.txt` (5 of 7, before finding
3) and `preflight-output.txt` (6 of 7), `slither-output.txt` and `aderyn-report.md`.

## What the run found

**1. The "read before you build" step cannot finish from source for AUDD, and the prompt's second
door (probe on a fork) is what makes it answerable.** AUDD's implementation is unverified and
upgradeable, with a control layer whose names suggest per-transaction rules. Selectors and a probe
settle today's behaviour (no gate; contracts send) but not tomorrow's. The card's page should say
that for an unverified coin the read is a probe, that a probe is a statement about one block, and
that a distribution in AUDD is a distribution in a coin whose rules its owner can change. AUDM is the
opposite case: fully readable, and its deny list is the one real way a payment can fail part way.

**2. Rebuilding a holder table at 100 blocks per `eth_getLogs` is a five-minute read for a
four-month-old register, and the public RPC rate-limits it.** The CLASS A register was created at
block 3,059,036 and the snapshot was 3,228,698: 1,697 windows for 526 transfers, almost all of them
in the first 300 windows. Eight windows in flight died at once with "exceeded filter rate limit"; two
in flight with a backoff ran the whole table in 5 min 22 s with no retry. The table matched the
register's `totalSupply` exactly (75,531,283.012 units across 78 holders, none at zero), which is
the check a page should always print. For a register that is quiet, a cached table that resumes
from its last block would turn this into seconds; the prompt's windowing rule is right for the RPC,
and the card's page should say what it costs.

**3. Pre-flight's secret scanner flagged two of this run's own files: the Transfer event topic
(a 64-hex literal) and Anvil's test mnemonic.** The topic is now computed with `cast keccak` at run
time and the rehearsal names Anvil accounts 7 and 8 by address instead of deriving them. Card 9 met
the hex64 rule in its rehearsal output; this run met it in source. A note in the shared "how to
repeat it" step would save the next run the detour: no 64-hex literal and no phrase of twelve common
words anywhere in the tree.

**4. The register is paused.** `paused()` on the CLASS A register answered `true` on the fork at
block 3,228,723. A paused T-REX token refuses every transfer, so its holders could not move a unit
today; the distribution still went through, because it writes to the stablecoin and never to the
register. That is the card's thesis in one observation, and a page should show the register's pause
state beside the table so the administrator knows that the holders are who they were and will stay
so until the issuer unpauses.

**5. The receipt keeps the latest row per holder and so loses the failed attempt.** In the rehearsal
the denied holder's `PaymentFailed` row (with its reason) was superseded by the `Paid` row after the
retry; the CSV shows 78 Paid and nothing of the detour, while the chain's log has both. An
administrator's receipt should probably carry every attempt, or an "attempts" column. Not changed in
this run; the raw events are in the log either way.

**6. Gas, for the card's "many transfers each sitting".** On the fork: `open` with 78 holders
5,557,765 gas (two storage words per holder plus the duplicate check); `pay(1, 40)` 2,632,159 and
2,446,380 (about 64,000 per paid holder: a stablecoin transfer, a status write, an event); `retry`
110,719; `close` 51,394. At Redbelly's dollar pricing (US$0.01 per 21,000 gas) the whole
distribution to 78 holders is about US$5.20, of which `open` is half. A table of 2,000 holders
(`MAX_HOLDERS`) would need about 140 M gas for `open` alone, inside the 60 B block gas limit the
rules file reports but worth splitting in a future version (open in pages, or a Merkle root and a
claim). Fees on a fork mean nothing in RBNT; these are gas counts only.

**7. The fork's gas price in wei is enormous, and an impersonated account funded with "1 ETH" cannot
send.** The forked base fee was 201,540,056,450,249 wei (gas is priced in USD here and RBNT is
cheap), so `anvil_setBalance` of 1e18 bought a gas allowance of 2,170 and every probe transaction
died on estimation with "gas required exceeds allowance". Funding with 1e27 and passing
`--gas-limit` fixed it. The rules file says fee numbers on a fork mean nothing; it should add that
balances for impersonated accounts must be set in the thousands of RBNT.

**8. `forge create` and `forge script` both work against the loop's fork with `--unlocked`, and the
deploy script's pre-flight passes on chain 31337 by design** ("chain is not 151 or 153: identity
check skipped"), so a second contract sits beside the template's exactly as cards 9 and 13 found.
The distributor's deploy record landed in `contracts/deployments/31337-RegisterDistributor.json`
without a transaction hash, so it is safe to commit; `broadcast/` is gitignored and the scanner did
not read it.

**9. The analysers' findings are the design, with two nits taken.** Slither's one High is
`arbitrary-send-erc20` on `transferFrom(d.payer, …)`: the `from` is the wallet that called `open`,
and only that wallet can call `pay`, so it is the caller's own money, which Slither cannot see.
Its reentrancy findings do not know the transient guard. Aderyn asked for `nonReentrant` before
`onlyPayer`; both tools asked for explicit initialisers on three locals; both were done, and the
tests stayed green. `calls-loop` is the point of the contract and is bounded by `maxCount`.

**10. Two of the busiest AUDD and AUDM wallets carry 23 bytes of code**, the shape of an EIP-7702
delegation. Prague is live and someone is using it. Not this card's business; noted for the census.

## The rehearsal, as it ran (`rehearsal-output.txt`)

Ten steps on a fork of mainnet (chain 31337, fork of 151 at block 3,228,698 by `npm run dev --
--chain 151 --no-web --port 8558`, which warned that the fork only reads mainnet and that every
transaction lands on Anvil), every signer an unlocked Anvil account. The register confirmed as a
register (its identity registry at 0x1618B203… has code; name "CLASS A"; supply 75,531,283.012;
paused). `RegisterDistributor` deployed through its script from account 7, the pre-flight passing
with its identity check skipped off 151 and 153. `MockStable` deployed from account 7; 100,000 mAUD
minted to account 8, the administrator, and the distributor approved for it. The administrator
opened distribution 1: the 78-row table read from mainnet at block 3,228,698, total 100,000 mAUD,
nothing moved. The second-largest holder (0x0112b33d…, 5,876,498.505 units) put on the mock coin's
deny list. Two `pay(1, 40)` transactions: cursor 78, due 99,999,999,962 units, paid 92,219,781,925,
77 paid, 1 failed. The failed holder's status read back as `Failed`; the deny-list entry lifted; the
retry paid 7,780.218037 mAUD; `close`. Every one of the 78 mAUD balances checked against `total *
balance / totalBalance` with zero mismatches; the sum received 99,999,999,962 and 38 units of dust
still in the administrator's wallet. Zero events from the register's address since the rehearsal
began, the largest holder's register balance unchanged from the snapshot, and the distributor not
verified on the register's identity registry. The receipt exported: 78 rows, all Paid, with the
`Opened`, `Completed` (paid 92,219,781,925, 77, 1 failed, dust 38, as at the moment the cursor
reached the end) and `Closed` events in the summary.

## Not done

- **Testnet.** The prompt's first door, a mock stablecoin and a register from project 15's suite on
  153, needs a deployed suite and a wallet to sign the deploys; the agent signs nothing on a real
  network. The fork door was taken instead.
- **The ship report and the Routescan verification.** Nothing was deployed to a real network. The
  deploy script is ready and takes no arguments; `npm run ship` is the owner's step.
- **A web page.** The prompt's "show it with the block it was read at" and "say so in the interface"
  are met by the holder table's JSON and the events, not by a page. The web app was not touched, so
  `typecheck` and `build` were not run for this card.
- **The real stablecoins.** Only the mock was paid on the fork. Paying real AUDD or AUDM, even on a
  fork, would mean impersonating a real holder as the payer; the sender probe did exactly that for
  one unit per coin and no more, and the distribution itself used the mock so that no real wallet's
  balance was pretended to be the administrator's.
- **A second agent.** The plan asks for two.
- **The hand-written project page and the terminal recording.**
- **Three improvements the findings suggest** (finding 2's resumable table, finding 5's receipt of
  every attempt, finding 6's paged `open` for large tables). Left for the lead.

## How to repeat it

```
mkdir -p ~/code && cd ~/code
npm create redbelly-dapp@latest card-18 -- --yes
cd card-18 && npm install && npm run contracts:install
git init && git add -A && git commit -m baseline
# add the eight files beside this record where their names say:
#   contracts/src/RegisterDistributor.sol  contracts/test/RegisterDistributor.t.sol
#   contracts/test/mocks/MockStable.sol  contracts/test/mocks/MockRegister.sol
#   contracts/script/DeployDistributor.s.sol
#   scripts/holders.mjs  scripts/receipt.mjs  scripts/rehearse-distribution.sh
npm run test                                   # 84 tests, 8 suites
(cd contracts && forge fmt --check src script test)
npm run dev -- --chain 151 --no-web --port 8558   # leave it running; it says the fork only reads mainnet
# the real holder table, read from mainnet itself (read-only; about five minutes):
node scripts/holders.mjs --register 0x0Eea5afF22b8B5e89CAdd84ed1a18b828404e392 \
  --snapshot <the fork block the loop printed> --out ../card-18-holders.json
bash scripts/rehearse-distribution.sh ../card-18-holders.json ../card-18-rehearsal   # outside the tree: finding 3
npm run preflight                              # 6 of 7; DEPLOYER is the expected failure
```
The stablecoin read is `probe/probe.sh` against a plain `anvil --fork-url
https://governors.mainnet.redbelly.network --chain-id 31337 --port 8558`, with `probe/Forwarder.sol`
built by `forge build` in a folder of its own; `mainnet-source-read.txt` lists the `cast call` and
Routescan reads. The register reader this record leans on (`packages/ops-kit/src/register.mjs`) is
unpublished and was read, not run, here; the rehearsal's step 1 makes the same `identityRegistry()`
and `paused()` reads with `cast`.
