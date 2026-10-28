# Card 17, The register explorer, the agent track: run of 2026-10-27

## Verdict

**Built on a fresh 0.2.3 scaffold from npm and read live from mainnet in a browser, read-only.** One new page,
`web/src/app/registers/page.tsx`, one data file, `web/src/lib/registers.ts` (the candidate addresses, in one place as
the prompt asks), and one link on the home page; nothing new installed. The page uses the kit's `useRegister`, one
hook per register in a row component, and the kit's own ABIs for the three reads the hook does not expose
(`identityStorage`, `issuersRegistry` with `getTrustedIssuerClaimTopics`, `investorCountry`). `npm run typecheck`
clean, `next build` clean with `/registers` in the route list, the scaffold's 68 contract tests unchanged and green,
`forge fmt --check` clean, pre-flight 6 of 7 (the one failure is `DEPLOYER is a public address`, expected before a
wallet is set). Opened at `http://localhost:3151/registers` from a production build pointed at 151 and read, with no
wallet connected, at 20:47 UTC: **44 of 44 candidates answer as registers at block 3,241,235**; 38 are
`registration only` and 6 `claims`; 26 paused, 18 not. Browser console clean. Nothing was signed, nothing was sent,
no wallet was connected; the page writes nothing. The transcript is `card-17/live-read-151-transcript.md`.

Timings. `npm create redbelly-dapp@latest card-17 -- --yes` 13 s (the 0.2.3 tarball fetched from the registry),
`npm install` 24 s, `npm run contracts:install` 1 s, `npm run test` 3 s for the baseline's 68 and 1 s after;
`npm run typecheck` 1 s, `NEXT_PUBLIC_CHAIN_ID=151 npm run build` 8 s. Agent: Claude Code (Claude Fable 5.1), one
session, the card's prompt given as written. Scaffold at `~/code/card-17`, left uncommitted on the owner's word; a
baseline commit of the fresh scaffold was made first so this record's `diff.patch` is the agent's changes alone.

The card's wording did not change. Two things in it deserve her eye in the text pass (findings 4 and 5).

## The prompt, as run

> On the scaffold you already have, add a page that lists every ERC-3643 register on the chain the app points at.
> Keep the candidate addresses in one file and ask each whether identityRegistry() answers with a contract; for each
> that does, read its name, symbol, supply, decimals, version, pause state, the registry and its storage, the trusted
> issuers with the topics each is trusted for, the claim topics the token requires, and the word the kit uses for the
> gate kind, registration only or claims. With a wallet connected, show for each register whether its registry has
> verified that wallet, its country code, whether it is frozen, and its balance, in the same words the kit uses for its
> states. Read-only: nothing is written, nothing leaves the browser but reads of the public RPC, and every figure
> carries the block it was read at. Mainnet is the chain with registers on it today; say so, and say that reading
> mainnet signs nothing. Say in the interface which of the three gates each answer belongs to: the network gate, a
> recipe gate, the register gate.

## What was built (files beside this record)

- `registers.ts`: the candidate list by chain. Mainnet: the 44 addresses that answered `identityRegistry()` in the
  census of 12 October 2026 (527 ERC-20 contracts from Routescan, each asked by `eth_call`; all T-REX 4.1.3).
  Testnet: none. The file carries the date the list was checked and the page prints it.
- `registers-page.tsx`: the page. The header says which chain the app points at, that mainnet is the chain with
  registers today, that the list is 44 mainnet addresses and none for testnet, and that reading mainnet signs
  nothing; when the app points elsewhere it says how to point it at 151. A "Three gates" paragraph names the
  network gate (`permission.isAllowed`), a recipe gate (a dApp's verifier and request id, with a link to
  `/eligibility`) and the register gate (each register's identity registry), and says this page answers the first
  and the third. With a wallet connected, the network gate's answer is read through the template's own
  `useIsAllowed`, and each row answers the register gate in the kit's words (`r.state`: `registered`,
  `not-registered`, `frozen`, `paused`), with verified, country code (read only when an identity is registered),
  frozen and balance. Every row ends with the block it was read at. The heading's count comes from the reads
  (each row reports once the chain has answered), not from the list's length.
- `diff.patch`, `typecheck-output.txt`, `build-output.txt`, `preflight-output.txt`, `test-output.txt`, `timings.txt`.

## What the run showed

**1. Thirty-eight of forty-four registers are registration-only.** The 12 October finding on the largest register
holds across the chain: most registers trust no issuer and require no claim topics, so the issuer's act of
registering a wallet is the whole gate. Six use claims: two issuers in all (`0x6B48…4B11` for topics 1 to 5 or
1 to 3 on four registers; `0x06f3…85c5` for topic 13 on the two RBC notes).

**2. Registers share identity plumbing.** The two Remara registers point at one identity registry; the two RBC notes
have two registries over one identity storage. A page that lists registers as independent tokens would miss that a
wallet verified for one is verified for its sibling.

**3. Twenty-six of forty-four are paused.** More than half the registers on mainnet cannot transfer today. The kit's
`paused` state ranks above the wallet's standing, which is the right order: a verified holder of a paused register
still cannot move.

**4. The card's outcome line promises "holders"; the prompt does not ask for it and the chain cannot answer it in one
read.** A holder count is not a view on T-REX; card 18 rebuilt one register's table from 526 Transfer events over
1,697 block windows. The page shows supply and no holder count. Her text pass: drop "holders" from the outcome, or
say "supply".

**5. "The chain the app points at" against "mainnet is the chain with registers".** A fresh scaffold points at
testnet, where the list is empty, so the page as scaffolded shows no register and says why and how to point the app
at 151. This run built with `NEXT_PUBLIC_CHAIN_ID=151`, which the prompt allows. An alternative the prompt does not
ask for is a page that reads mainnet whatever the app's chain, through a second transport; not built.

**6. A child must not set its parent's state while rendering.** The first draft reported "this address is a register"
to the heading's counter during the row's render; React forbids that. It is in an effect now. Same family as card
16's finding 5 (hooks inside a map).

**7. The wallet column is proven from the command line, not in the page.** No wallet extension exists in the browser
the session used. The ops kit's `redbelly-register`, from the public registry at 0.2.3, read one claims-gated
register with the owner's development wallet: not verified, not registered, balance 0, which is the row the page
would show. The browser proof with a connected wallet is hers to make when she opens the page with hers.

## Not done

- A second agent has not run the card; the plan asks for two.
- The Solidity track has nothing to write: there is no contract. The project page says so.
- The candidate list is a snapshot of 12 October. The census tool PLAN 23.3 describes would refresh it; until then a
  register deployed after that date is not listed, and the page says when the list was last checked.
- No test file: the page reads and renders, and the proof is the live read above. A test with a mocked RPC and a
  fixture of one registration-only and one claims register would be the next thing to add.

## How to repeat it

```
npm create redbelly-dapp@latest card-17 -- --yes
cd card-17 && npm install && npm run contracts:install
# put registers.ts at web/src/lib/registers.ts and registers-page.tsx at web/src/app/registers/page.tsx
cd web && npm run typecheck && NEXT_PUBLIC_CHAIN_ID=151 npm run build && npm run start -- --port 3151
# open http://localhost:3151/registers; connect a wallet to see the register gate answered for it
```
