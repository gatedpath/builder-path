# Card 16, The fee checker, the agent track: run of 2026-10-17

## Verdict

**Built on the deploy project's scaffold and read live from both chains in a browser, the same
afternoon the card was written.** One new page, `web/src/app/fees/page.tsx`, on the scaffold at
`~/code/first-153` (a 0.2.1 scaffold that already carries project 13's guard), using the scaffold's
own kit and nothing new: the chain objects and `gasCostUsd` from `@gatedpath/chains`, viem's public
client for the blocks, the app's query client for the refresh. `npm run typecheck` clean, `next build`
clean with `/fees` in the route list (`typecheck-and-build.txt` beside this record). Opened at
`http://localhost:3153/fees` from a production build and read, in the browser, with no wallet connected:

- **Mainnet (151)**, read 2026-10-17 13:39:12 UTC in 1,482 ms: head block 3,228,446, base fee
  264,403.37 gwei, feed price US$0.001801 per RBNT set at 13:38:01 UTC. A plain transfer 5.55 RBNT
  (US$0.0100); the recipient guard's deploy 133 RBNT (US$0.24); the scaffold's token 521 RBNT
  (US$0.94); enabling a wallet 570 RBNT (US$1.03); the box's default 100,000 gas 26.4 RBNT (US$0.0476).
- **Testnet (153)**, read 13:39:16 UTC in 4,551 ms: head block 3,052,342, the same base fee and feed
  price to the figure shown, so the same four costs.
- **The history**: ten mainnet blocks (204, 400,000 … 3,100,000 and the head) read in one go, the
  enable call priced at each: 20.5 RBNT at block 204, 570 RBNT at the head, US$1.03 at every point.
  Two charts drawn, the RBNT one on a log scale with ticks at 1, 10, 100 and 1,000, the dollar one
  flat; the first and last points labelled; the table under them.

Nothing was signed, nothing was sent, no wallet was connected. The page writes nothing.

The same reads, with a build-time snapshot that stands with JavaScript off, are the site's own
[What it costs](/fees/) page, built the same day from `site/src/lib/fees-reader.ts`; the card's prompt
describes both.

## Where the card comes from

The owner enabled her dev wallet on 17 October 2026. The network's Discord guide says the enable
costs 20 RBNT; her wallet showed one figure and the chain charged another (568 RBNT, about US$1.02),
and the chain read back the same call at 20.4 RBNT in the first week of mainnet. The gap is the
network pricing gas in dollars and converting to RBNT at the feed's rate, which Vine's fee notes
warn most wallets get wrong. Her question that afternoon: "do we have a gas checker with a gui as a
tutorial project?" We did not. Write-up before the code: `research/idea-2026-10-17-fee-checker-draft.md`.

## The prompt, as run

> On the scaffold you already have, add a page that tells a visitor what a transaction costs on this
> network right now, read from the chain and not from a wallet: the base fee of the latest block and
> the price feed's US dollar rate for RBNT, priced for four calls (a plain transfer at 21,000 gas, the
> recipient guard from project 13 at 503,685, the scaffold's token at 1,971,486 and enabling a wallet
> at 2,154,375, each with where its figure was measured), a box where the reader types a gas figure and
> sees it in RBNT and in dollars, and the enable call's cost at nine block heights from the first week
> of mainnet to the head, drawn as two charts, one in RBNT on a log scale and one in dollars, with the
> same figures as a table. Both chains, each read on its own. Nothing stored, nothing sent anywhere but
> the public RPC, a dated line saying when each figure was read, and a plain sentence that the dollar
> line is flat because the network prices gas in dollars and converts to RBNT at the time of the call.
> Say what the page is not: a fee estimate for your own contract, or a price of RBNT anywhere but the
> network's own feed.

## What was built (files beside this record)

- `fees-page.tsx`: the page, as it sits at `web/src/app/fees/page.tsx`. One client component, no
  new dependency. The "now" reads go through `useQueries`, one per chain, refetched every minute with
  one retry; the history waits for mainnet's head and then reads the ten blocks with viem's
  `getBlock`. RBNT is computed in integers (`gas × baseFeeWei`, divided down to six decimals at the
  end), the way the kit's `gasCostUsd` does it. The chart is a small SVG component: one thin line,
  a title on every point for hover, the first and last values labelled, no library.
- `typecheck-and-build.txt`: `npm run typecheck` and `next build`, both clean; `/fees` static.
- The home page gained one sentence pointing at `/fees` (`web/src/app/page.tsx`).

## What the run found

**1. The first browser read of testnet failed and the retry answered.** The console showed a CORS
error for `governors.testnet.redbelly.network` on the first attempt, then the second attempt read the
chain in 4,551 ms. Both RPCs answer `OPTIONS` with `access-control-allow-origin: *` when asked from
the command line, so the header was not missing; the first governor behind the endpoint answered
without it, or did not answer. This matches what the network told us in October: the endpoint tries
one governor for five seconds and then another. A page that reads 153 from a browser needs a retry,
and this one has one. Mainnet answered first time in 1,482 ms.

**2. The two chains priced the same call to the same figure.** Base fee and feed price were equal on
151 and 153 at the minute of the read (264,403.37 gwei; US$0.001801). Both feeds carry the same
dollar rate, so a cost measured on testnet is the cost on mainnet; that is why the site can say so.

**3. The dollar line is flat to the cent across two years.** 2,154,375 gas at US$0.01 per 21,000 gas is
US$1.03 at every block; the RBNT line runs from 20.5 to 570. The chart needs a log scale to be honest
about the RBNT side, and the card's prompt asks for one.

**4. The kit already had the pricing.** `gasCostUsd` in `@gatedpath/chains` gives the feed price and
its timestamp with the cost of any gas figure at any base fee, so the page needed no reader of its
own; one call per chain, for 21,000 gas at the block's base fee, gave both figures. The site's version
reads the feed itself because it also runs at build time without the kit.

**5. A map of hooks is not allowed.** The first draft called `useQuery` inside `CHAINS.map`, which React
forbids even for a constant list. `useQueries` is the right call, and the page uses it.

## Not done

- A second agent has not run the card; the plan asks for two.
- The Solidity track has nothing to write: there is no contract. The project page says so.
- A gas figure for the reader's own contract is typed by hand. Pricing the ship report's measured
  figures automatically is noted for 0.2.2, not built.
- No test file: the page reads and renders, and the proof is the live read above. A test with a mocked
  RPC would be the next thing to add if the page grows.

## How to repeat it

```
npm create redbelly-dapp@latest fees -- --template empty --yes
cd fees && npm install
# put fees-page.tsx beside this record at web/src/app/fees/page.tsx
cd web && npm run typecheck && npm run build && npm run start -- --port 3153
# open http://localhost:3153/fees with no wallet connected
```
