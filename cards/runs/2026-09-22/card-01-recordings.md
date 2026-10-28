# Card 1, the recordings: 22 September 2026

Two terminal recordings for project 1 (change the gate), made so the project page can show what
its worked results claim instead of only asserting them. Recordings are run records, so this is
the record of the run they came from.

## What was run, and where

A fresh scaffold in an empty folder, on this Mac, with Foundry 1.7.1 from `~/.foundry/bin`.

1. `npm create redbelly-dapp@latest my-app -- --yes` — the published scaffolder, version 0.2.1.
2. `npm install`, then `npm run contracts:install` (forge-std v1.16.2).
3. The step 3 edits applied: `REQUEST_ID` default moved from 18 to 708 in
   `contracts/script/Deploy.s.sol` and in `.env.example`, with the comments that describe them,
   and `contracts/test/WholesaleGate.t.sol` added.
4. `npm run test` — **recorded** as `casts/project1-test.cast`.
5. `npm run dev` — **recorded** as `casts/project1-dev.cast`, stopped with Ctrl-C once the web app
   said it was ready, which is the entry's `stop` rule in `casts.config.mjs`.

Steps 1 and 2 were not recorded here: the Start page already has recordings of both, made the same
way on 21 September, and repeating them on this page would say nothing new.

## Where the step 3 edits came from

Not retyped from the page. The change is the one in this project's own earlier run record,
`cards/runs/2026-09-17/card-01-solidity/`, which holds the changed `Deploy.s.sol`, the new
`WholesaleGate.t.sol` and `change.diff`.

That diff no longer applies cleanly: it was cut against the scaffold of 17 September, and
`.env.example` has been reworded since, so `patch` refuses its `.env.example` hunk. The two edits
were therefore made against the current file, and the test file was taken from
`site/src/samples/generated/project-gate-test.sol` — the same text the page shows the reader in
step 3, which `check-samples` compiles against the current kit on every build. So what ran is what
the page shows, on the kit a reader installs today.

**Worth knowing:** a run record's diff goes stale as the kit moves. This one was 5 days old and had
already drifted. A diff is still the right record of what changed; it is not a reliable way to
reproduce the state later.

## What the runs proved

- **`npm run test`: `72 tests passed, 0 failed, 0 skipped` across 8 test suites**, in 502 ms.
  That is exactly what step 3's worked result claims, now on kit 0.2.1 rather than the 17 September
  kit it was first written against.
- **`npm run dev`: forked chain 153 at block 3039512**, deployed `GatedERC20` with a `ReceptorMock`
  verifier, and printed the table. Its line ends `request id 708`, which is what step 4's worked
  result claims, and the run also prints `States are per request id 708`.

Nothing signed on a real network and no key was involved at any point: the fork is local, Anvil
signs for its own accounts, and the recorder runs with no input attached, so anything that asked a
question would have failed rather than waited.

## The third command on the page, and why it has no recording

Step 4's second terminal runs:

    cast call <token-address> 'requestId()(uint64)' --rpc-url http://127.0.0.1:8545

It stays as text. `<token-address>` is a placeholder a reader fills in from the table above it, and
a placeholder cannot be typed into a terminal, so there is nothing to record honestly. Recording it
would mean substituting one run's address and presenting it as the command the page gives, which
is not what the page gives.

## The change this needed in the gate

`scripts/check-casts.mjs` held every recorded command to a line of a **fenced code block** on its
page. That was enough while only the Start page had recordings, where every command is fenced.
Project pages are not written that way: step 3's worked result says what to run inline, mid
sentence, in a code span.

`fenceLines` became `commandsOnPage`, which reads fenced blocks, inline code spans and the `code`
attribute of a `<Code>` component. The rule it enforces is unchanged and just as tight: a command
on a page must match its recording, and a command changed on the page still fails the build until
the list and then the recording are made again. All seven recordings pass.

## Still open on this project

- The agent track cannot be recorded. Directing an agent is not a terminal session, so step 3's
  first tab stays as it is.
- The plan asks for two agents per card; one has run it. Unchanged by today.
- The page's `lastVerified` still reads 2026-09-17. Today's runs re-proved both worked results on
  0.2.1, so that date could move, but it is the owner's call and it is a claim about the card, not
  about the recordings.
