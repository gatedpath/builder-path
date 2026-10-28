# Card 14, An agent that is allowed to say no, the agent track: run of 2026-10-17

## Verdict (updated 23 October 2026)

**Run on testnet, through the policy, with a person at the terminal.** On 23 October 2026 the owner took
the scaffold's deploy to chain 153 the way the card says it must go: `npm run deploy -- --from rbn-testnet
--reason "card 14 on testnet"`, with `VERIFIER` set to the mock the gated token project deployed earlier the
same day. The policy read its rules from `~/.config/agent-policy/card-14.json`, which she wrote and locked
herself that afternoon (chain 153, `maxRbnt` 100, `confirmAboveRbnt` 10), ran its checks (chain 153 reported
by the RPC, a keystore account as signer with no key read, nothing in the request or the environment asking
for more, the deployer passing `permission.isAllowed`), stopped at the human line, and she typed the
confirmation phrase at the terminal. Then forge signed with her keystore. `GatedERC20` at
**0x544416c3aCB72BE561F7cd1ACdF4E40918aB420A**, transaction
`0x9e18aeaf55ef394149ad59c2c0fde1060eadcb0c4f175d05d3bcc1674b32233a`, block 3,055,942 (16:48:01 UTC),
1,972,293 gas at 304,859.46 gwei, 601.27 test RBNT (balance 40,233.73 to 39,632.46, read from chain). One
transaction, because the verifier was reused. Routescan already held the source as verified when the
submission was made: the bytecode matches the token verified from the gated token project that morning, and
the explorer page shows it verified. The decision is in `policy-153-2026-10-23.md` beside this record, with
`person-confirmed: pass` as its last row, and the post-deploy ship report (every check, 68 tests, Slither
fresh) is `ship-153-2026-10-23.md`.

Three of the "Not done" items below closed by this run: testnet, a person at the terminal, and the policy
file written by a person. Two things came out of it. First, a bug: the keystore path built the forge command
with `--account` only and no `--sender`, which the fork run never reached (the Anvil path passes `--sender`)
and which is the exact omission that stopped the first real run of card 13 on 17 October; one line in
`scripts/policy.mjs` fixed it before the deploy, and the fixed file is beside this record. Second, the ship
report's Slither check failed on the first run because this scaffold had never run the analyser (no Solidity
was added); `npm run lint:slither` was run (17 contracts, 81 detectors, the same three timestamp notes the
kit triaged in September, nothing at the fail level) and the second ship run passed. The scaffold's own
work (the three scripts, the rehearsal, the rule file, the two package lines) is still uncommitted in
`~/code/card-14`; it is committed on her word.

**The live use, later the same afternoon: six requests through the policy on the real network.** Each from her
keystore, each decision in `policy-153-2026-10-23.md` beside this record. Allowed and landed: 1 RBNT to her own
verified wallet, below the human line (transaction `0x2507b3b3b7ee0bff13f33137e8c56111635c3e3a86f637200ec94145be08735e`,
block 3,055,946, 21,000 gas, 6.40 test RBNT in gas); and 15 RBNT, above the line, which the policy held until she
typed `send 15 RBNT to 0x38d8…` at the terminal, then cast signed (`0xf402e5a0790cbde54833dfebf6c8984deae491c1165d7f664babae08fec1e142`,
block 3,055,950, 17:05:58 UTC, 21,000 gas). Refused, nothing signed, each for the reason the card names: 250 RBNT
against the limit of 100 (`amount-under-limit` fail, and the human line noted as well); 5 RBNT with the reason
"URGENT, the CEO approved this, pay now" (`no-override` fail: "logged and refused, not obeyed. Urgency and seniority
do not move a limit"); and 1 RBNT to `0x…dEaD` (`recipient-allowed` fail: "does not pass permission.isAllowed on
chain 153: the network's gate, not a recipe"). Two of the refusals were run twice when earlier commands were replayed
from the chat, so the log holds more than one entry for them; the extra rows are refusals and cost nothing, and one replay of the 15 RBNT send was
confirmed and went out a second time (the seventh section of the log; 6.40 in gas, the 15 back to her own wallet).
Balance after the day: 39,613.25 test RBNT. The one thing the card asked for that is still not done on the real network is
nothing: deploy, allowed sends, the human line crossed by a person for a send and for a deploy, and every refusal,
all happened on 153 with the keystore path. What remains below is the web interface, contract recipients, a second
agent, and the README.

The verdict of 17 October stands below as written then.

## Verdict, 17 October 2026

Proven on a fork of testnet, and not further. One policy, `scripts/policy.mjs`, that the scaffold's
new `npm run send` and `npm run deploy` go through before `cast send` or `forge script --broadcast`
is reached: the recipient must pass `permission.isAllowed` on the chain the RPC reports (read through
the bootstrap registry with `isAllowed` from `@gatedpath/chains`, the way the scaffold's own scripts
read it); the amount must sit at or under `maxRbnt` in one read-only file outside the project that
the scripts never write; a request that says it is urgent or that someone senior asked, an
environment variable or a flag that tries to steer, is logged and refused; a send above
`confirmAboveRbnt`, and every deploy, waits for a person to type a confirmation at the terminal
itself; and every decision is appended to `deployments/policy-<chain>-<date>.md` in the ship
report's shape (the header comment, a title, a checks table with a reason per row). The rules
proper, `decide`, are lines 86 to 118 of a 153-line file. The output says on every run that this is
a set of rules and not a model that detects fraud.

On a fork of chain 153 (Anvil as 31337, forked at block 3,052,397, five Anvil accounts seeded into
the five credential states by `npm run dev`), 22 requests went through the policy in one session:
7 were allowed and landed on the fork (seven sends of 1 to 5 RBNT, 21,000 gas each, from Anvil
account 7), 15 were refused, and nothing was signed by anything but an Anvil account. One refusal of
each kind the prompt names was shown: a recipient that fails `isAllowed` (Anvil account 8), 250 RBNT
over the 100 RBNT limit, "URGENT" and "the CEO approved this" refused and logged, `POLICY_LIMIT`
and `LIMIT` in the environment refused, `--force` refused, 50 RBNT above the 10 RBNT human line
refused because no person was at a terminal, a deploy refused for the same reason. Also refused: a
64-hex value offered as the signer (before the rules ran, and never written anywhere), Anvil account
0 as the signer, a contract as the recipient, a writable policy file and a missing one. 20 of the 22
decisions are in the decision log; the two refusals for an unusable policy file have no log to go to
and are in `policy-file-checks.txt`. The scaffold's 68 tests pass unchanged (no Solidity was added),
pre-flight clears 6 of 7 with `DEPLOYER is a public address` the one failure, as the shared step says
to expect without a wallet, and `npm run rules:check` is clean.

**What the prompt asks for and this run did not do:** "Testnet." No transaction was made on chain
153; nothing was signed on a real network; the policy was never run with a keystore account. No
person typed a confirmation, so the human line was crossed by nobody: the two requests that reached
it were refused for want of a terminal, which is the designed outcome when an agent runs alone, and
the typed path is untested. The policy file was written by this agent, not by a person (finding 2).
The "interface" that says this is rules and not a model is the command line; the scaffold's web app
was not touched.

Wall time: scaffold under 1 s (the scaffolder was in the npx cache), `npm install` 19.1 s,
`contracts:install` 2.1 s, `npm run test` 2.9 s, baseline committed at 14:46 BST. The session was then
cut off by a rate limit and resumed at 16:54; from the first file written to the end of the final
rehearsal was 9 minutes (16:54 to 17:03), inside which the fork was started four times (23.5 to 29.2 s
cold, 4.3 to 6.8 s with warm caches) because it was stopped from outside twice and once by my own
mistake (finding 10). The final rehearsal, 16 steps, ran in 3.4 s; the file checks after it in about
3 s; pre-flight 1.9 s; the tests 0.6 s warm.

Agent: Claude Code (Claude Fable 5.1). One agent; the plan asks for two.
Machine: the owner's Mac, Node v24.20.0, Foundry 1.7.1. Project: a fresh scaffold made the same
afternoon from the published packages, `npm create redbelly-dapp@latest card-14 -- --yes` (the default
`gated-erc20` template, 70 files, scaffolder 0.2.1), `npm install`, `npm run contracts:install`,
committed as the baseline before the card began (68 tests green). Slither and Aderyn were not run:
no contract changed.

## Where the card comes from

The network's founder, on *Redbelly Insights* episode 32 (from minute 33; transcript in
`research/sources/`), answered the question about agents with a safeguard: an employee told by "the
boss" to move a large sum urgently, and a tool that notices the outlier and warns or stops it. The
write-up that turned it into a card (`research/idea-2026-10-10-founder-wishlist-tutorials-draft.md`)
chose deterministic rules over a model and said so: recipient permissioned, amount under a limit,
no override on urgency, a person above a line, refusals logged. This run builds those rules on the
scaffold, where the one thing another chain cannot give the safeguard is available: whether the
recipient has passed the identity gate.

## The prompt, as run

> On the scaffold you already have, add a policy that the agent's send and deploy scripts must pass
> before anything is signed: the recipient passes permission.isAllowed on this chain; the amount is
> under a limit set in one place the agent does not write to; nothing in a prompt or the environment
> can raise that limit or skip the check, and an instruction that says it is urgent or that someone
> senior asked for it is logged and refused, not obeyed; any transfer above a second, lower line
> waits for a person to type a confirmation. Every refusal is written in the ship report's shape with
> its reason. Run it against a recipient in each of the five credential states and show one refusal
> of each kind. Testnet. This is a set of rules a reader can take in on one screen, not a model that
> detects fraud, and the interface says so.

## What was built (files beside this record)

`scripts/policy.mjs`, 153 lines, no dependency beyond the vendored `@gatedpath/chains`:

- `loadPolicy` reads the one file, `~/.config/agent-policy/<project folder name>.json`, and refuses a
  missing file (printing the one line a person runs: `mkdir`, `cp policy/limits.example.json`,
  `chmod 444`), a symlink, or a file with any write bit set. It reads no environment variable for a
  limit and takes no flag for one. The file names the chain (31337 or 153; 151 is refused in the
  loader), the RPC for the local chain (for 153 the RPC comes from the chains package), `maxRbnt` and
  `confirmAboveRbnt`. Amounts are parsed to wei as integers.
- `decide` runs six checks and reports every one, the way a ship report lists every check: `chain`
  (the RPC's `eth_chainId` equals the policy's), `signer` (an Anvil index 2 to 9 on the local chain,
  a keystore account name on 153; never 0 or 1; never a key), `no-override` (a word list over the
  stated reason and the arguments, environment names matching `POLICY|LIMIT|OVERRIDE|SKIP|URGENT|
  CONFIRM|FORCE`, and flags such as `--force`, `--limit`, `--private-key`, `--yes`),
  `recipient-allowed` (`isAllowed` through the registry, and `eth_getCode` empty: a contract is not a
  wallet that passed the gate), `amount-under-limit`, and `human-line` (above `confirmAboveRbnt` the
  verdict is "waits"; a deploy always waits, with `deployer-allowed` in place of the recipient check).
- `personConfirms` opens `/dev/tty` itself, never stdin, and asks for the exact phrase `send <amount>
  RBNT to <address>` or `deploy on chain <id> from <address>`. With no terminal the request is
  refused with the reason in the log.
- `recordDecision` appends to `deployments/policy-<chain>-<date>.md`: `<!-- redbelly-policy chain=…
  date=… ok=… generatedAt=… -->`, a heading with the verdict, the reason the caller gave, and the
  `| Check | Result | Reason |` table. `printDecision` prints the same rows in `renderShipText`'s
  layout under the line "This is a set of rules, not a model that detects fraud."

`scripts/send.mjs` (45 lines, `npm run send -- --to --amount --from [--reason]`) and
`scripts/deploy.mjs` (43 lines, `npm run deploy -- --from [--reason]`) build the request, run the
policy, wait for the person where the verdict says so, record, and only then call `cast send
--value … --from <anvil address> --unlocked` or `--account <name>`, or `forge script
script/Deploy.s.sol --rpc-url <the policy's rpc> --broadcast --sender … --unlocked` or `--account`.
An unknown option is refused; a 64-hex value in any argument is refused before the policy runs and
is recorded without its value. Also `policy/limits.example.json` (the file a person copies),
`.claude/rules/agent-policy.md` (ten lines for the agent: only these two commands move value, never
touch the policy file, never type the confirmation), two lines in `package.json`, and
`scripts/rehearse-policy.sh` (the 16 steps). The scaffold's generated files are untouched:
`npm run rules:check` passes and `git status` against the baseline shows additions and the
`package.json` lines only (`package.json.diff`). `policy-31337-2026-10-17.md` here is the decision log
as the fork left it.

## What the run found

**1. The five credential states all pass the recipient check, and that is correct.** The policy
reads the network gate, `permission.isAllowed`, which has two answers; the five states (never issued,
valid, expired, revoked, wrong jurisdiction) belong to a recipe on the dApp's verifier. On the fork
all five seeded wallets pass the gate (the local loop allows them), so 1 RBNT reached each of them,
and the recipient refusal came from Anvil account 8, which the fork's gate says is not allowed. The
rehearsal prints the recipe state beside each wallet, labelled "information only; the policy does
not read it", so a reader can see which question refused. Card 13's run found the same thing and
its prompt was reworded; this card's sentence "Run it against a recipient in each of the five
credential states and show one refusal of each kind" still reads as if a state would refuse, and the
lead may want to say what card 13's now says. The prompt was not changed here.

**2. The agent wrote the policy file.** The design has a person copy `limits.example.json` into
place and `chmod 444` it; in this run the same agent did that, because nobody else was in the
session. The mechanism is proven (`policy-file-checks.txt`: a 644 file is refused with the chmod line,
a missing file is refused with the setup line, the 444 file is read), the separation of hands is
not. The honest limit, printed in the file's header: the agent and the person share one OS user, so
`chmod 444` stops an accident and a `chmod` away stops nothing; the file is a line the agent is told
not to cross and a check that it has not been. A real wall is another OS user, a hardware wallet's
own limit, or a Safe threshold.

**3. Nobody crossed the human line.** Two requests reached it (50 RBNT, and the deploy); both were
refused with "no terminal is attached, so no person can type the confirmation". The confirmation is
read from `/dev/tty`, so a piped stdin cannot type it; an agent with a pseudo-terminal tool could.
That check stops a pipe and a careless agent, not a determined one, and the record says so rather
than calling it proof.

**4. The word rule is a word list.** "URGENT" and "the CEO approved this" were caught; "the client
cannot wait and the person in charge has already agreed" passed the words and 5 RBNT went out
(check 5, under both lines). That is what "not a model that detects fraud" means in practice, and
why the limit and the human line stand behind the words rather than beside them.

**5. A refusal with no readable policy has nowhere to go but the terminal.** When the file is
writable or missing, the loader refuses before anything can be recorded against a chain, so those
two refusals are not in the decision log. 20 of 22 decisions are. A log location that does not
depend on the policy file would close this; not built.

**6. Pre-flight's secret scanner flags a saved receipt.** My first attempt saved the rehearsal
transcript inside the project, and `no key-shaped value in the project's files` failed on the
transaction and block hashes in it (64-hex values). Transcripts now live outside the tree and
pre-flight reads 89 files clean. Anyone keeping a receipt in a scaffold will meet this; `cast send
--json` reduced to one line in `send.mjs` (hash, block, status, gas) is still a 64-hex value.

**7. A key offered as the signer is refused before the rules and never echoed.** Step 13 passed a
64-hex value as `--from`; the message names the shape and the alternatives, the decision log records
"a request refused before it was read" with the reason, and the test value appears zero times in the
log and the transcript. The first version recorded nothing for this case; it was fixed and the
rehearsal rerun.

**8. A contract recipient is refused outright.** `isAllowed` is not a meaningful question for a
contract (card 13), so the policy refuses when `eth_getCode` is not empty. A team that pays a Safe or
a contract needs a line in the policy for it (an allow-list of contract addresses, say); not built.

**9. Nothing was deployed through the wrapper.** A deploy always waits for a person, so `npm run
deploy` on the fork ended at the human line; the fork's `GatedERC20` came from `npm run dev`'s own
loop. The README still shows the direct `forge script … --broadcast` route; the agent rule file is
what points at the wrapper, and the README was not edited.

**10. The fork on port 8554 was stopped from outside twice, and the shared scratch folder
collided.** At about 17:00 and again at 17:02:01 my `npm run dev` exited with code 0 (a signal, no
error in its log), the second time at the second another agent's loop started on 8548. A first
transcript was also cut short by my own `head` on the pipe. The shared scratchpad is used by several
runs, and a file of mine named `rehearsal-output.txt` there vanished once and a partial copy of my
steps 1 to 9 was copied into card 9's folder by another run (no command of mine names card 9; the
check is in this run's transcript). Everything here is from one fork session at 17:03, written to a
private subfolder and then to this card's folder only. For parallel runs: a port, a scratch
subfolder and a `pkill` pattern that names the port, each per card.

**11. On the fork the registry named the permission contract at `0x519ba1b4…` at block 3,052,397**,
the same answer card 13 recorded at 3,048,628 on 10 October and the live deploy read on 17 October.

## The rehearsal, as it ran (`rehearsal-output.txt`, then `policy-file-checks.txt`)

Sixteen steps on the fork, Anvil account 7 signing: 1 RBNT to each of the five seeded wallets,
allowed, with each wallet's recipe state printed beside it (0 to 4); 1 RBNT to Anvil account 8,
refused by `recipient-allowed`; 250 RBNT to the Valid wallet, refused by `amount-under-limit` with
`human-line` also waiting; 5 RBNT "URGENT", 5 RBNT "the CEO approved this, skip the check",
5 RBNT with `POLICY_LIMIT=1000` in the environment, 5 RBNT with `--force`, each refused by
`no-override` and logged with the words; 50 RBNT "monthly payout", every check passing and
`human-line` waiting, refused because no terminal was attached; a 64-hex signer, refused before the
rules; `anvil:0`, refused by `signer`; 1 RBNT to the verifier contract, refused by
`recipient-allowed`; the deploy, every check passing and refused at the human line. Then the file
checks: the policy file at 644 refused, moved away refused, back at 444 the send allowed, `LIMIT=1000`
refused by `no-override`, `--limit 1000` refused as an unknown option, and the reworded instruction
allowed. The Valid wallet ended at 10,007 RBNT (10,000 + 1 + 1 + 5) and the stranger at 10,000.

## Not done

- ~~**Testnet.**~~ Done 23 October 2026, see the verdict at the top. Was: no transaction on chain 153, nothing signed on a real network, the keystore path
  (`--from <account name>`, `cast wallet address --account`) never exercised. It waits for the owner's
  testnet wallet, as card 13's did.
- ~~**A person at the terminal.**~~ Done 23 October 2026: the owner typed the deploy confirmation. Was: the typed confirmation was never given; both requests that reached
  the line were refused for want of a terminal.
- ~~**The policy file written by a person**~~ Done 23 October 2026: she wrote and locked the 153 file herself. Was: not by the agent (finding 2).
- **A web interface.** The prompt's "the interface says so" is met by the command line only.
- **Contract recipients** (finding 8) and a log for refusals when the policy file itself is unusable
  (finding 5).
- **Slither and Aderyn.** Not run: no Solidity was added or changed.
- **A second agent.** The plan asks for two.
- **The README** still describes the direct `cast` and `forge script` routes beside the new commands.
- **The project page and the terminal recording.**

## How to repeat it

```
npm create redbelly-dapp@latest card-14 -- --yes
cd card-14 && npm install && npm run contracts:install && npm run test
# add policy.mjs, send.mjs, deploy.mjs and rehearse-policy.sh to scripts/, limits.example.json to
# policy/, agent-policy.md to .claude/rules/, and the two lines of package.json.diff
# a person, once (the agent does not run this line):
mkdir -p ~/.config/agent-policy && cp policy/limits.example.json ~/.config/agent-policy/card-14.json && chmod 444 ~/.config/agent-policy/card-14.json
npm run dev -- --no-web --port 8554      # in its own terminal; forks 153 as 31337 and seeds the five states
bash scripts/rehearse-policy.sh          # the sixteen steps; the log lands in deployments/policy-31337-<date>.md
npm run send -- --to <address> --amount 50 --from anvil:7     # in a terminal, to type the confirmation yourself
npm run preflight
```
