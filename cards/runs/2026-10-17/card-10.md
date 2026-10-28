# Card 10, Gated liquidity pool, the agent track: run of 2026-10-17

## Verdict

Proven on a fork of testnet, and not further, and not on the code the prompt names. The prompt says
"the forked Uniswap interface in the Redbelly GitHub org"; that repository exists
(`github.com/redbellynetwork/interface`) and is a mirror of Uniswap's front-end monorepo at commit
`8d9ac54a` with no commit of Redbelly's own and no Solidity in it (finding 1). So this run built the
gate on stock Uniswap v2 core instead, `Uniswap/v2-core` v1.0.1 (tag commit `d2bfbb36`), vendored
into `contracts/lib/v2-core` with `forge install`, its three contracts ported from Solidity 0.5.16 to
0.8.30 and its interfaces imported unchanged so a v2 router or front end still speaks to the result.
That departs from the prompt's words, and the record says so here and in the trade-offs file.

What was built: a `GatedPairFactory` on the scaffold's `Gated` base bound to the AU wholesale
investor recipe (request id 708) and to the network's permission contract, and a `GatedPair` whose
liquidity tokens can only land in a wallet that passes the recipe gate (adding liquidity, receiving a
position) while swap output, withdrawn reserves and skimmed excess can only leave to a wallet the
network verified or to another pair of the factory. Removing liquidity is not gated on the credential:
a holder whose certificate expired leaves as any holder does. The strict linter accepted every file on
first build (`deny = "warnings"` never fired), `forge lint` and `forge fmt --check` are clean, 88 tests
pass in 8 suites (the template's 68 and 20 new ones, one a fuzz over deposit sizes), pre-flight clears
6 of 7 (the one failure is `DEPLOYER is a public address`, the expected one before a wallet is set),
and the pool's whole life was rehearsed on a fork of testnet: 52 transactions and 14 refusals, every
refusal decoded to the error the contract names. Slither 0.11.6 and Aderyn 0.6.8 were run; every note
on the new contracts is on a line the stock Uniswap code has too, and none was changed (finding 9).

Timings. Scaffold 0.64 s (`create-redbelly-dapp@0.2.1` was in the npx cache), `npm install` 7.6 s,
`npm run contracts:install` 1.4 s, baseline `npm run test` 2.6 s (68 tests, 7 suites), baseline
committed at 16:18:41 UTC; `forge install Uniswap/v2-core@v1.0.1 --no-git` 0.86 s. The fork loop
(`npm run dev -- --no-web --port 8550 --request-id 708`) was ready in 21.4 s on its first start (4.7 s
forking testnet at block 3,052,526) and between 4.8 s and 23.5 s on three restarts. The clean
rehearsal took 38.0 s (22:17:38 to 22:18:15 UTC). The full suite 0.7 s, pre-flight 1.6 s, Slither
1.4 s, Aderyn 0.45 s. Wall clock from the baseline commit to the last commit is 6 h 0 min, almost all
of it a pause: the agent read the scaffold and the fork, vendored v2-core, and was then stopped by the
session limit from about 16:30 UTC until 22:06 UTC. The work after the resume, from the first line of
the pair to the last commit, took 13 minutes by the commit timestamps (22:06:38 to 22:18:54 UTC), and
the rehearsal was run four times in that window: once stopped by a shell parsing error, once by 64-bit
shell arithmetic, once by a real finding about gas estimation (finding 5), and once clean.

What the prompt asks for and this run did not do: the fork it names (finding 1), and a change to any
web interface, since the named repository is only an interface and the prompt's three verbs (add a
check, leave swaps open, document) were all done on contracts. What the builder path's standard asks
for beyond the prompt and this run did not do: the testnet deploy and the Routescan verification
(both need a wallet-signed transaction, and the agent signs nothing on a real network), a router, and
a web page. Nothing was signed or sent to a real network; the fork ran as chain 31337 and every sender
was an unlocked Anvil account (indices 2 to 8; never 0 or 1).

Agent: Claude Code (Claude Fable 5.1). One agent; the plan asks for two.
Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1, Slither 0.11.6, Aderyn 0.6.8. Project: a
fresh scaffold made the same afternoon from the published packages, `npm create redbelly-dapp@latest
card-10 -- --yes` (the default `gated-erc20` template), `npm install`, `npm run contracts:install`,
committed as the baseline before the card began (68 tests green). The scaffold's own sources are
untouched: the diff against the baseline is nine added files, one changed (`Deploy.s.sol`, re-pointed
at the factory) and one line added to `remappings.txt`; the template's `GatedERC20` and its 68 tests
still build and pass beside the new ones, and `npm run dev` took the new deploy script with no change
to the loop (finding 7).

## Where the card comes from

Card 10 is one of the twelve prompt cards of PLAN.md section 14.2, as `site/src/data/cards.ts` carries
it: outcome "The forked Uniswap interface with pool entry gated to wholesale wallets and swaps open to
any verified wallet"; the reason for this network, "two kinds of participant share one pool, and the
pool enforces the difference"; what it teaches, "where identity gating goes in a swap; LP eligibility;
writing down a trade-off". Scope `several-contracts`, recipe `au-wholesale`. This run is the card's
first; it had never been run on a scaffold before today.

## The prompt, as run

> Using the forked Uniswap interface in the Redbelly GitHub org, add an eligibility check to pool
> entry so only wholesale-credentialed wallets can add liquidity, leave swaps open to any verified
> wallet, and document the trade-offs.

## What was built (files beside this record)

Under `contracts/src/pool/`:

- `GatedPairFactory.sol`, 143 lines, on OpenZeppelin `Ownable` and the kit's `Gated`, implementing
  the vendored `IUniswapV2Factory`. It is the one gated contract: `Gated(verifier, 708)` and an
  `IPermission permission` (the contract the bootstrap registry names `permission`). Two reads for the
  pairs: `requireEligibleProvider(wallet)` (the base's `_requireEligible`, so the revert is exactly
  `NotEligible(wallet, 708)`) and `requireVerifiedRecipient(wallet)` (true for `permission.isAllowed`
  or a pair of this factory; otherwise `NotVerified(wallet)`). `createPair` is stock and open, with
  `new GatedPair{salt}()` in place of the assembly `create2`, and records `isPair`. `feeToSetter` is
  the owner under Uniswap's name; `setFeeToSetter` is `transferOwnership`. The owner repoints the
  verifier, the request id (through `_authorizeVerifierChange`), the permission contract and `feeTo`.
- `GatedPairERC20.sol`, 115 lines, the liquidity token: `UniswapV2ERC20` ported, with one rule added.
  `_mint(to)` and `_transfer(from, to)` call `_requireProvider(to)` unless `to` is the zero address
  (the MINIMUM_LIQUIDITY lock) or the pair itself (the first half of a burn). The sender is never
  checked. `_mintUnchecked` exists for the protocol fee alone. `PERMIT_TYPEHASH` is computed, not the
  stock literal (finding 4).
- `GatedPair.sol`, 264 lines, `UniswapV2Pair` ported: `mint`, `burn`, `swap`, `skim`, `sync`, the
  price accumulators and the fee are the stock lines. `burn`, `swap` and `skim` begin with
  `_requireRecipient(to)`. The port's changes: checked arithmetic with `unchecked` only around the
  32-bit timestamp and the accumulators, OpenZeppelin's `SafeERC20`, `Math.sqrt` and `Math.min`, a
  transient-storage reentrancy lock behind two private functions (the kit's linter wants modifier
  bodies wrapped), `type(uint112).max`, and lint and Slither disable lines, each with its reason, on
  the three casts and the timestamp read the stock design needs.
- `IPermission.sol`, the network gate's one function.
- `TRADE-OFFS.md`, 96 lines, the prompt's third verb: seven entries, each with what was chosen, what it
  costs, and what the other choice would have cost. Its substance is findings 2, 3, 6 and 8 below.

Also `src/mocks/MockERC20.sol` (an 18-decimal ERC-20 anyone may mint, refusing chain 151 in its
constructor; the two pool tokens in tests and on the fork), `test/GatedPair.t.sol` (397 lines, 20
tests), `script/Deploy.s.sol` (the template's script re-pointed: factory first, then off mainnet two
mock tokens and their pair; `VERIFIER`, `PERMISSION`, `TOKEN_A`, `TOKEN_B` from the environment,
each refused on mainnet when unset and each replaced off mainnet with the log saying so in capitals;
`PERMISSION` unset is read from the bootstrap registry, which a fork has; `REQUEST_ID` default 708),
`scripts/rehearse-pool.sh` (160 lines), the one-line `remappings.txt` addition, and the outputs:
`rehearsal-output.txt`, `rehearsal-output-run3-out-of-gas.txt` (finding 5), `test-output.txt`,
`preflight-output.txt` (6 of 7), `slither-output.txt`, `aderyn-report.md`, `dev-loop-output.txt`,
`deployments-local.json` (the loop's record: account indices, never a key), `npm-install-output.txt`.

The tests, in the shape the scaffold asks for. Adding liquidity through
`assertRevertsForAllInvalidStates` on `mint(wallet)`, twice: into a seeded pool and as the first
deposit (NeverIssued, Expired, Revoked, WrongJurisdiction refused with `NotEligible(wallet, 708)`,
Valid minted). The gate on the wallet that receives the position: a sender with no credential mints
into a wholesale wallet, a wholesale sender cannot mint into a retail one. Liquidity-token transfers
and `transferFrom` refused into each of the four states and accepted into Valid. Swaps: a verified
wallet with no credential swaps and receives the quoted output; every one of the four non-valid
states swaps; an unverified recipient refused `NotVerified` from a verified sender and from itself; a
flash-swap borrower contract refused; another pair of the factory accepted as `to`; one unit more
than the constant product allows refused `UniswapV2: K`. Removing liquidity: a holder made Valid
until a date adds, the clock passes it, the mock reads Expired, adding more is refused, the transfer
into the pair and the burn succeed and the balances come back; a Revoked holder exits; a burn to an
unverified recipient refused; `skim` to an unverified recipient refused. The protocol fee minted to a
treasury with no credential, whose tokens still obey the transfer gate. Admin: the owner alone repoints
all four settings, and a repointed permission contract applies to every pair. The fuzz: random
deposits of each token, mint, burn, never more back than went in, and the pair's balances equal to
its reserves after.

## What the run found

**1. The repository the prompt names is an untouched mirror, and it has no contracts.** The public
repositories of `github.com/redbellynetwork` are ten: `interface` (a fork of `Uniswap/interface`),
four Safe and SLIP forks, `openzeppelin-upgrades`, and four of Redbelly's own (`receptor-schema`,
`receptor-verifier-contract-example`, `did-schema`, `prism-bot`). `interface` was created on 26 March
2026 from upstream commit `8d9ac54a60e655986a477f61b16d77bead44ab38` ("ci(release): publish latest
release", Uniswap's release bot, 25 March 2026); the GitHub compare API puts it 0 commits ahead of
and 95 behind `Uniswap/interface:main`, it has one branch, and a shallow clone (214 MB, `apps/web`,
`apps/mobile`, `apps/extension`, 21 packages) holds zero `.sol` files and no occurrence of the word
"redbelly" outside `node_modules`. No v2 or v3 core or periphery fork exists in the org. So "the
forked Uniswap interface" cannot be where a pool-entry check goes; the check has to go in a pair
contract, and the prompt should be reworded to say which Uniswap it means. This run used stock
`Uniswap/v2-core` v1.0.1, vendored, and ported it; the card's page should say so, or the prompt
should name v2 core directly and drop the org.

**2. "Pool entry" is the moment liquidity tokens land in a wallet, not the transaction that sends
them.** Uniswap's pair is designed to be called by a router, and a router has no credential; a gate
on `msg.sender` would gate the router and nothing else. This run gates `to` in `mint` and in every
liquidity-token transfer, so a position can only ever sit in a wholesale wallet, whoever funded it.
The card's page says it teaches "where identity gating goes in a swap"; this is the answer, and the
cost (a wallet without the credential can fund a position that lands in a credentialed one) is
`TRADE-OFFS.md` entry 1.

**3. "Any verified wallet" needs a second gate, and the pair has to read it about the recipient.**
On 151 and 153 the chain refuses a transaction from an unverified sender, so the sender of a swap is
verified by construction; but `to` can be any address. The pair asks the factory, which asks
`permission.isAllowed(to)`, the contract the bootstrap registry names, and also accepts a pair of
its own factory so multi-hop routing works. Three consequences, all in the trade-offs file: one
external read per swap; a contract that is not a pair cannot receive swap output, which switches
flash swaps off in practice; and on an Anvil fork the sender gate is not enforced, so the rehearsal
shows an unverified Anvil account sending a swap that the pair then refuses for its recipient (step
6), which on the real networks would never reach a block.

**4. Pre-flight's key scanner reads Uniswap's `PERMIT_TYPEHASH` as a key.** Stock `UniswapV2ERC20`
writes the EIP-712 type hash out as a 64-hex literal. The first `npm run preflight` after the
contracts landed failed `no key-shaped value in the project's files: contracts/src/pool/GatedPairERC20.sol
(hex64)`. The constant is now `keccak256("Permit(...)")`, which the compiler folds to the same value
(checked with `cast keccak`), and pre-flight is at 6 of 7. Any port of a contract that carries a
bytes32 literal will meet this; the scanner's caution is right, and the fix is one line.

**5. `eth_estimateGas` under-estimates the first swap of a new second on a pair, and on a chain with
on-demand blocks that is every swap.** The third rehearsal's step 7 ran out of gas: `cast send` took
Anvil's estimate, 74,053, and the swap needed 85,001. The estimate runs against the last block's
timestamp, where `_update`'s `timeElapsed` is zero and the two price accumulators are not written;
the real transaction lands in a block a second later and writes both, about 44,000 gas more when
they are written for the first time and 10,000 or so after. `cast run` on the failed hash shows
`EvmError: OutOfGas` and nothing else. Uniswap's own router hides this on Ethereum because blocks
are twelve seconds apart and the estimate usually lands in the same block as the previous swap's
update did not; on Redbelly, where a block is produced for every transaction and the next one is at
least a second later, the estimate is wrong whenever the previous pool event was in an earlier
second. The rehearsal script now passes a fixed gas limit and says why; a web app for this card must
add a margin to the estimate for `mint`, `burn` and `swap`, and the card's page should warn about it.
The failed transcript is beside this record as `rehearsal-output-run3-out-of-gas.txt`.

**6. The prompt says nothing about leaving, and a pool is half about leaving.** This run chose: exit is
always open. A holder whose credential expired or was revoked moves liquidity tokens into the pair and
burns, as any holder does, and receives the reserves if the wallet is verified. The kit's token freezes
a lapsed holder instead. The reasons (the prompt gates entry; an accountant's certificate lapses; a
frozen position needs a compliance power Uniswap's pair does not have) and the cost (the pool cannot
hold a position for a regulator) are `TRADE-OFFS.md` entry 2. The card's page should carry one answer
so a second agent can agree or argue.

**7. The local loop took a factory as its contract without a change.** `Deploy.s.sol` prints
`GatedPairFactory: 0x...` first and labels everything else with a space in the name, the loop read
`requestId()` from the factory, seeded the five wallets for 708 on the mock, and the rehearsal found
the pair through `allPairs(0)` and the tokens through `token0()` and `token1()`. The loop knows nothing
of the permission gate the pair reads, but it had already replaced the fork's permission contract with
a mock that allows the deployer and the five wallets (its own step 5), so the network gate was in
place for the pair with no extra seeding, and Anvil account 8, which the loop does not allow, served as
the unverified wallet. The same shape as cards 8 and 9: a second contract sits beside the template's
pattern and shares its verifier.

**8. The protocol fee recipient cannot be behind the provider gate.** `_mintFee` mints to `feeTo` on
every liquidity event. If that mint were gated and the treasury could not pass, every `mint` and `burn`
in every pair would revert. The treasury is minted without the gate; its tokens still obey the
transfer gate. `TRADE-OFFS.md` entry 5, and a test.

**9. Static analysis has nothing on the new contracts that the stock code does not have too.**
Slither's results on the pool (20 in all, most on the template and OpenZeppelin): `weak-PRNG` on
`block.timestamp % 2**32` (the accumulator clock; Uniswap's line), `incorrect-equality` on
`supply == 0` (the first-deposit branch; Uniswap's line), `reentrancy` in `createPair` (initialize
before the mapping writes; Uniswap's order) and in `swap` (the callee before `_update`; Uniswap's
design, under the lock), `missing-zero-check` in `initialize` (factory-only). Aderyn: `H-1` state
change after external call on the balance reads in `mint`, `burn` and `createPair` (stock, under the
lock), `H-2` the `uint32` cast (bounded by the modulo above it), `H-3` weak randomness (the same
clock), centralisation on the owner (meant to be a Safe), `ecrecover` malleability in `permit` (the
nonce prevents replay; stock), the empty `_authorizeVerifierChange` body (the kit's idiom), literals
1000 and 3 in the fee check (stock), `initialize` without an event or a zero check (stock). All read,
none changed. Both reports are beside this record.

**10. Three ports of 0.5.16 code met the strict linter and the compiler without a warning.** The
things that needed care: Uniswap's interfaces carry `pragma >=0.5.0` and compile under 0.8.30, but a
contract implementing `IUniswapV2Pair` through a separate ERC-20 base hits "derived contract must
override" on every public state variable the interface also declares, so the ERC-20 base inherits the
interface itself and the pair inherits the base; public constants do satisfy the interface's `pure`
getters (`MINIMUM_LIQUIDITY`, `name`, `PERMIT_TYPEHASH`). The forge test helper `expectRevert` is
consumed by any call that follows it, so a view read inside the arguments of the call under test
(`_isA0() ? 0 : 1`) swallows it; three tests failed that way on the first run and were rewritten to
read first and call after. Nothing else in the port bit.

**11. Gas, for the page's "swaps are the daily traffic".** On the fork: first `mint` into an empty pair
152,597; a later `mint` 104,384; the first `swap` in a new second 119,189 (the accumulators' first
write) and 84,989 to 85,132 after; `burn` 108,248; a liquidity-token transfer into the pair 46,805;
`skim` 69,811 to 75,423; a token transfer into the pair 34,525. At Redbelly's dollar pricing (US$0.01
per 21,000 gas) a swap is about four cents, of which the recipient's `isAllowed` read is a small part.
Fees on a fork mean nothing in RBNT; these are gas counts only.

## The rehearsal, as it ran (`rehearsal-output.txt`)

Ten steps on a fork of testnet (chain 31337, fork of 153 at block 3,052,528; the rehearsal's own
blocks 3,052,541 to 3,052,594), every sender an unlocked Anvil account. The factory, mock verifier
and request id read from `deployments/local.json`, the pair from `allPairs(0)`; `isVerifiedRecipient`
true for the Valid wallet and false for account 8. 1,000,000 of each mock token minted to six wallets.
The Valid wallet (3) sends 100,000 of each into the pair and mints: 99,999.999... liquidity tokens,
reserves 100,000 and 100,000 (152,597 gas). Each of the NeverIssued, Expired, Revoked and
WrongJurisdiction wallets sends 1,000 of each token in and is refused on `mint` with
`NotEligible(wallet, 708)`, and the Valid wallet skims the deposit back to it, so no refused wallet
holds a position and none loses its tokens. The NeverIssued wallet, verified by the network, swaps
1,000 token0 for 987.158... token1, exactly the quoted amount. The same swap asked for one unit more
is refused `UniswapV2: K`, and at the quoted amount goes through. A swap whose output is addressed to
account 8 (never allowed by the permission mock) is refused `NotVerified(account 8)` from the
NeverIssued sender and from account 8 itself, and the stranded deposit is skimmed to a verified
wallet. The Revoked and WrongJurisdiction wallets swap. Account 4 is made Valid until now plus 600 s,
adds 50,000 of each (104,384 gas), the clock moves 601 s, the mock reads Expired, adding more is
refused `NotEligible`, the transfer into the pair and the burn succeed and 49,999.999... token0 and
48,572.18... token1 come back. The Valid wallet is revoked: `mint` refused, a liquidity-token transfer
to the NeverIssued wallet refused `NotEligible(that wallet, 708)`, a swap goes through, and the exit
goes through, leaving the pair with reserves of 1,023 and 993 wei and a total supply of exactly the
locked 1,000. Since the start block: 2 `Mint`, 2 `Burn`, 5 `Swap`, no `EligibilityDenied` (every
refusal reverts). 52 transactions with status ok, 0 reverted, 14 refusals, each decoded to its name
and arguments.

## Not done

- **The repository the prompt names.** Finding 1. Nothing in `redbellynetwork/interface` was changed
  or could carry this check; the clone sits at `~/code/card-10-upstream`, untouched, with no build run
  in it.
- **A router.** The rehearsal and the tests call the pair's low-level functions directly, as Uniswap's
  own tests do. A v2 router for this factory needs its init code hash from
  `type(GatedPair).creationCode` (`TRADE-OFFS.md` entry 7) and a gas margin (finding 5).
- **A web page.** The template's page speaks `GatedERC20`'s ABI; the web app was not touched, so
  `typecheck` and `build` were not run for this card.
- **Testnet deploy and Routescan verification.** Not in the prompt, but the path's standard. Both wait
  for the owner's wallet; the agent signs nothing on a real network. The deploy script is ready;
  `TOKEN_A` and `TOKEN_B` are the two addresses to set on 153 if real tokens are wanted there.
- **A real verifier.** The gate ran on `ReceptorMock`. The AU wholesale recipe is a draft until a run
  against a live verifier on 153 with the Eligibility SDK (`recipes/README.md`).
- **An allow-list of contracts as swap recipients** (aggregators, flash-swap borrowers), which the
  trade-offs file describes and this run did not build.
- **A second agent.** The plan asks for two.
- **The hand-written project page and the terminal recording.**

## How to repeat it

```
mkdir -p ~/code && cd ~/code
npm create redbelly-dapp@latest card-10 -- --yes
cd card-10 && npm install && npm run contracts:install && npm run test     # 68 green
git init && git add -A && git commit -m baseline
(cd contracts && forge install Uniswap/v2-core@v1.0.1 --no-git && echo '@uniswap/v2-core/=lib/v2-core/contracts/' >> remappings.txt)
# add the files beside this record where their names say:
#   GatedPair.sol GatedPairERC20.sol GatedPairFactory.sol IPermission.sol TRADE-OFFS.md -> contracts/src/pool/
#   MockERC20.sol -> contracts/src/mocks/   GatedPair.t.sol -> contracts/test/
#   Deploy.s.sol -> contracts/script/ (replaces the template's)   rehearse-pool.sh -> scripts/
npm run test                                   # 88 green, 8 suites
(cd contracts && forge fmt --check src script test && forge lint src)
npm run dev -- --no-web --port 8550 --request-id 708   # in one shell; forks 153, deploys the factory, two mock tokens and a pair, seeds 708
bash scripts/rehearse-pool.sh > ../card-10-rehearsal-output.txt   # in another; outside the tree, the hashes trip pre-flight
npm run preflight                              # 6 of 7; DEPLOYER is the expected failure
npm run lint:slither; (cd contracts && aderyn . -o ../aderyn-report.md)
```
