# Card 13, A transfer that refuses to lose your money, the agent track: run of 2026-10-10

## Verdict (updated 17 October 2026)

**Deployed on testnet and verified on Routescan.** On 17 October 2026 the owner deployed the guard to
chain 153 from her dev wallet (`0x38d8fd4d6bAd7Af440Ed5D35a4E381f5f2936B59`, a keystore in her own
Terminal, the key never in a file or the chat): `RecipientGuard` at **0x017b98c2b39E26435f9ad3880101F9f1c5FDBE73**, transaction
`0x5d4cb865a3b9efff916057ac746a4c4c7f009389d426bec500023754dc21e339`, block 3,052,324, 503,685 gas at 263,963.68 gwei, about 133 test RBNT. Source verified the same
hour with `forge verify-contract 0x017b98c2b39E26435f9ad3880101F9f1c5FDBE73 src/RecipientGuard.sol:RecipientGuard --chain 153 --verifier-url
https://api.routescan.io/v2/network/testnet/evm/153/etherscan --etherscan-api-key verifyContract --watch`
("Pass - Verified"; Routescan records RecipientGuard, v0.8.30, Prague, optimizer 200 runs). Read back
live: `BOOTSTRAP_REGISTRY()` is the registry, `permission()` resolves the real testnet permission contract
`0x519ba1b4…`, `check(deployer)` is Permissioned, `check(guard)` is Contract. Files beside this record:
`deployment-153-RecipientGuard.json`, `broadcast-153-run-latest.json`. Two findings from the real run
are in RESEARCH.md's log of 17 October (the deploy command needs `--sender`; a first deploy needs more
test RBNT than one faucet claim). **The send and the refusal, on the real network, the same afternoon.** The owner sent 1 test RBNT through
the guard to her own verified wallet: transaction `0xf2a474dddf1a91d67fe7ca16e9d69f92c79677d4fa80d6bf646a65bf79b88973`, block 3,052,326, 50,308 gas, status 1,
the `Sent` event carrying 1,000,000,000,000,000,000 wei. The refusal was simulated from her wallet with
nothing signed (`cast call ... --from`): a send to Anvil's account 2, which `permission.isAllowed` on 153
says is not allowed, reverts with `RecipientNotPermissioned(0x3c44…)`, selector `0xa7eda872`, and the
guard's `check` reads NotPermissioned for it. The founder's side project (episode 32, minute 27) exists on
his network and does what he described: a transfer that refuses an unverified recipient.

The verdict of 10 October stands below as written then.

## Verdict, 10 October 2026

Proven on a fork of testnet, and not further. One new contract, `RecipientGuard`, compiles under the
scaffold's strict linter (a warning fails the build), `forge fmt --check` is clean, 38 tests pass in
4 suites (the empty template's 20 and 18 new ones, one of them a fuzz over recipients and amounts),
pre-flight clears 6 of 7 (the one failure is `DEPLOYER is a public address`, which is what the shared
step says to expect before a wallet is set), the web app's send page type-checks and builds
(`/send` is in the production route list), and the guard's whole day was rehearsed on a local fork
of testnet with every refusal the right one. Wall time 5 min 44 s from the baseline commit to the
end of the rehearsal; a little over 20 minutes including the two fixes below and the web page.

**What the prompt asks for and this run did not do:** the deploy to testnet and the verification on
Routescan. Both need a wallet-signed transaction, and this project has not made one on a real
network yet. The card therefore says "proven on a fork" beside its date. Nothing was signed or sent
to a real network; the fork ran as chain 31337 and every sender was an unlocked Anvil test account
(indices 2, 3, 4 and 7; never 0 or 1).

Agent: Claude Code (Claude Fable 5.1). One agent; the plan asks for two.
Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1. Project: a fresh scaffold made the same
hour from the published packages, `npm create redbelly-dapp@latest guard -- --template empty --yes`,
`npm install`, `npm run contracts:install`, committed as the baseline before the card began
(20 tests green). Slither and Aderyn are not installed on this machine and were not run; see "Not done".

## Where the card comes from

The network's founder, on *Redbelly Insights* episode 32 (from minute 27; transcript in
`research/sources/`), named this as the side project he would hand to someone who wants to build
on Redbelly: a wallet that asks the permission contract whether the destination exists before it
sends. This run builds that, and adds the half he left to "the wallet": an address book, and the
plain words that a verified address is not necessarily the right one.

## The prompt, as run

> Build a transfer guard with two parts. On chain: a contract with send(to) for RBNT and
> sendToken(token, to, amount) that reads permission.isAllowed(to) through the bootstrap registry
> and reverts with a named error when the recipient has not passed the identity gate on this chain;
> a recipient that is a contract is allowed only when the caller says so in the call, because a
> contract address is not a wallet that passed the gate. In the web app: run the same check before
> the transaction is built, cache the answer per chain and never across chains, and keep an address
> book that resolves a name to an address and shows the result of the check beside it. Testnet.
> Tests for a recipient in each of the five credential states and for a contract recipient,
> pre-flight clean, verified on Routescan. Say in the interface, in words, that the check stops
> money going to an address nobody holds and not money going to the wrong person.

## What was built (files beside this record)

`src/RecipientGuard.sol`, 116 lines, no base contract, no owner, no roles, no balance:

- `send(to, allowContract)`, payable: refuses an empty call, runs the check, forwards the RBNT in
  the same call, emits `Sent`. `sendToken(token, to, amount, allowContract)`: the same with
  OpenZeppelin's `SafeERC20.safeTransferFrom`, so the sender approves the guard first and a token
  with its own gate (the kit's `GatedERC20` checks the real sender and recipient, never the spender)
  still applies it.
- `check(to)` returns a `Verdict`: `Zero`, `Contract`, `Permissioned` or `NotPermissioned`. The web
  page shows it before it asks for a signature; the contract applies it again when the transaction
  arrives. The page's answer is a courtesy and the contract's is the rule.
- The permission contract is found through the bootstrap registry (`0xDAFEA492…`, the one fixed
  address on both chains) **on every call**, never remembered, because the system-contract watcher
  showed on 17 September that the permission proxy's admin can move. A chain with no registry, or
  a registry that names nothing, reverts `NoPermissionContract` rather than guessing.
- A contract recipient is refused with `RecipientIsContract` unless the caller passes
  `allowContract`, because `isAllowed` is not a meaningful question for a contract. An account whose
  code is a 23-byte EIP-7702 delegation designator (`0xef0100…`) is still a wallet and is checked as
  one; the chain runs Prague, so this case exists.
- Named errors for every refusal, so the web page's `FailureWords` and a block explorer can say
  what happened; the governors RPC serves no trace methods, so a bare revert would be silent.

Also `script/DeployGuard.s.sol` (the scaffold's pre-flight, then the one contract; nothing to hand
to a Safe), `test/RecipientGuard.t.sol` (18 tests), `test/mocks/MockToken.sol` and
`test/mocks/Receivers.sol` (tests and rehearsal only), `scripts/rehearse-guard.sh`, and
`web/src/app/send/page.tsx` (`send-page.tsx` here). The scaffold's own files are untouched:
`git status` against the baseline shows additions only, and `npm run dev` still deploys the
template's `GatedExample` exactly as shipped.

## What the run found

**1. "Five credential states" means something different for a recipient check.** The five states
(never issued, valid, expired, revoked, wrong jurisdiction) belong to a dApp's recipe on the
verifier. The guard reads the network gate, `permission.isAllowed`, which has two answers. The
honest test is the one in `test_check_ignoresTheFiveCredentialStates`: the recipient's credential
is walked through all five states on a `ReceptorMock` and the guard's verdict never moves; only
`isAllowed` moves it. The card's prompt is reworded after this run to say exactly that (as cards 1
and 2 were after theirs), and the project page should teach it: the gate is one question, a recipe
is another.

**2. The scaffold's linter is strict, as promised.** A test that could have been `view` failed the
build (warning 2018 is an error under `deny_warnings`). One word fixed it. Worth knowing before a
first run.

**3. The fuzz test's first assertion was wrong, not the contract.** It asserted the recipient's
balance *equals* the amount; the fuzzer found a recipient that already held something. The
assertion now compares the difference. The counterexample is in the record's history and nothing
in the contract changed.

**4. `cast send --create` wants its options first.** The rehearsal's token deploy failed once on
argument order; `cast send --from … --create <code>` is the working form on Foundry 1.7.1.

**5. The local loop expects a `Gated` contract.** `npm run dev` deploys `script/Deploy.s.sol` and
reads `requestId()` from what it deploys. The guard has no request id (it gates on the network, not
a recipe), so it sits beside the template's `GatedExample` with its own deploy script and
rehearsal, instead of replacing them. The send page reads the guard's address from
`NEXT_PUBLIC_GUARD_ADDRESS` and, until that is set, checks recipients and does not send.

**6. On the fork, the registry named the permission contract at `0x519ba1b4…` at block 3,048,628.**
Recorded here because the guard resolves it live; if that answer changes, the watcher should have
seen it first.

## The rehearsal, as it ran (`rehearsal-output.txt`)

Nine steps on a fork of testnet: the registry's permission contract swapped for the test mock on the
local chain; the guard deployed after pre-flight; `check` saying Permissioned, NotPermissioned and
Contract for the friend, the stranger and the guard itself; 1 RBNT reaching the friend; 1 RBNT to
the stranger refused with `RecipientNotPermissioned` and the sender's balance untouched; a contract
refused without the caller's say-so and, with it, `NativeTransferFailed` for a contract that cannot
receive; a token approved and 5 units reaching the friend; the same token to the stranger refused;
the friend's verification removed and the next send refused.

## What the web page does

Recipient box that takes a name from the book or an address; the book is `localStorage`, one book
per chain, nothing leaves the browser. The check runs in the browser against the public RPC
(`getCode`, then `isAllowed`), cached thirty seconds under a key that includes the chain id, so an
answer from 153 is never shown for 151. Four verdicts in plain words. A contract needs a ticked
box. The send goes through the guard, simulated first so a refusal shows its words instead of a
mined failure. Two sentences at the top say what the check stops and what it does not.

## Not done

- **Testnet deploy and Routescan verification.** Waits for the owner's testnet decision and a
  public wallet address (`YOUR-LIST-draft.md`). The deploy script is ready and has no arguments.
- **Slither and Aderyn.** Not installed on this machine at the time of the run. *11 October 2026,
  both present and run on the deploy project (`~/code/first-153`, Slither 0.11.6, Aderyn 0.6.8).
  Aderyn: nothing on the guard. Slither: two notes on `send`, both read and left as they are. "Lacks a
  zero-check on `to`": the zero address is refused one line earlier through `check()`'s `Zero`
  verdict, which Slither does not follow through the enum. "Reentrancy": the `Sent` event is emitted
  after the external call; the contract has no state, the call is made only to a recipient the
  checks passed, and a failed call reverts the event with everything else. A reviewer should still
  read that line first.*
- **A second agent.** The plan asks for two.
- **The hand-written project page and the terminal recording.** The card's page is generated from
  the card data and links here; the written tracks (PLAN 19) and a recording of the rehearsal
  follow once the words are settled.
- **A `checkRecipient` helper in the published frontend kit.** The page implements the check itself
  so the dApp depends only on published packages; moving it into `@gatedpath/frontend-kit` is for
  version 0.2.2.
- **`sendToken` through a `GatedERC20`.** The empty template does not vendor the contract kit, so
  the token path was proven with a plain ERC-20. The kit token's gate runs on sender and recipient,
  not on the spender, so the guard composes with it by design; a test to show it belongs to the
  bond's project.

## How to repeat it

```
npm create redbelly-dapp@latest guard -- --template empty --yes
cd guard && npm install && npm run contracts:install
# add the six files beside this record where their names say; the web page to web/src/app/send/page.tsx
npm run test
bash scripts/rehearse-guard.sh
npm run preflight
cd web && npm run typecheck && npm run build
```
