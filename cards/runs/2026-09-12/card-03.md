# Card 3, Explain the missing code: run of 2026-09-12

## Verdict

Verified. The card produces no code, so the test is whether the explanation is right. Every claim below was checked against `RESEARCH.md` (questions 4, 5, 11 and 26 and the measured rows dated 2026-09-12) and the site's consensus page; the check is at the end. The agent wrote the explanation in about four minutes from the scaffold's rules file and the two concept pages; no tool ran. Nothing to compile, no gate to test, and pre-flight does not apply to a prose answer, so the card ships on the correctness check alone.

Agent: Claude Code (this session), following the prompt exactly as written on the card, with the scaffold's own `CLAUDE.md` rules file loaded. A second agent has not run this card yet.
Scaffold: the same fresh gated-erc20 scaffold as cards 1, 2 and 4, unchanged.
Tools: none ran. The agent read the scaffold's `CLAUDE.md`, the consensus page (`/concepts/consensus-and-finality/`) and the blocks page (`/concepts/blocks-on-demand/`).

## The prompt, as written on the card

> Explain why this project has no confirmation-count or reorg handling, citing the finality page. Then tell me what my off-chain indexer must do instead.

## The agent's answer, verbatim

There is no confirmation counting and no reorg handling in this project because Redbelly's consensus does not produce forks. The network runs DBFT, a leaderless Byzantine consensus in which every governor proposes, the proposals are combined into one super block, and the block is final the moment it is decided; Vine's consensus page says transactions are "finalised in seconds", and the site's consensus page spells out the consequence: a transaction that is in a block is final, and there is no later block that can replace it. Confirmation counts exist on chains where the canonical chain can change for a few blocks after inclusion; reorg handlers exist so an indexer can unwind what it did for a block that later disappears. Neither situation arises here, so code that guards against them would be dead weight, and worse than dead weight: a "wait for N confirmations" loop on a network that produces blocks only when there are transactions would wait for blocks that may not come for minutes.

What your indexer must do instead:

1. Treat the receipt as final. When `eth_getTransactionReceipt` returns a block number, the state change is permanent. Keep a pending state only for the seconds between send and receipt, and poll for the receipt about once a second rather than sleeping for a block time, because there is no block time.
2. Make every handler idempotent against yourself. With no reorgs, the only ways an event reaches your code twice are your own retry, a restarted worker, or a duplicated webhook. Key every off-chain write on the transaction hash plus the log index, and make processing the same key twice a no-op. That is the whole of "reorg safety" on this network.
3. Do not infer order inside a block. Vine says proposals from all governors are combined into one super block and says nothing about how transactions are ordered within it (open question 5 in the research log). Order your own records by block number and log index for display, but never let business logic depend on transaction A in a block having run before transaction B in the same block.
4. Expect bursts and silence. Blocks come when there is traffic: minutes with nothing, then several blocks seconds apart. Design the backlog for that shape, and do not alert on "no new block for two minutes"; on testnet that is normal.
5. Read events, not traces. The governors RPC does not serve `debug_*` or `trace_*`, so the indexer's only view of state changes is the events the contracts emit and `eth_getLogs`. This is why the scaffold emits an event on every state change a monitor would care about, including `ForcedTransfer` with its justification.
6. Handle a testnet reset without a reorg handler. Routescan indexes testnet as `153_2`, which suggests the chain has been reset once since launch (open question 26). A reset is not a reorg: the chain ID stays 153 and history starts again. Record the genesis block hash at start-up and refuse to continue on a mismatch, rather than trying to reconcile.

What you can delete from a ported indexer: the confirmation-depth setting, the "canonical chain" tracking table, the block-hash and parent-hash walk that detects a reorg, and the unwind path. Keep the idempotency key; it now protects you from yourself rather than from the chain.

## Check against the research log

| Claim | Where it rests | Status |
|---|---|---|
| DBFT is leaderless, finality is deterministic, proposals form a super block | `RESEARCH.md` facts table, "DBFT leaderless, deterministic finality, superblocks"; Vine's consensus page; the NCA 2018 and S&P 2021 papers; the site's consensus page | verified, high |
| "Finalised in seconds" | Question 4, Vine consensus page, 2026-09-12 | verified quote; the measured time-to-inclusion is still open (question 4, partial), which the answer does not claim |
| Blocks only with traffic; gaps of minutes, then blocks seconds apart | Question 4, ten-minute samples on both networks, 2026-09-12 | measured |
| Ordering inside a super block unstated | Question 5, Vine consensus page; Red Belly S&P 2021 describes deterministic ordering but the implementation rule is unconfirmed | partial; the answer tells the indexer not to depend on it, which is the safe reading |
| No `debug_*` or `trace_*`; `eth_getLogs` works | Facts table, `phase-0/results/chain-check-*-2026-09-12.json` | measured |
| Testnet indexed as `153_2` | Question 26, observed in Routescan's API response, 2026-09-12 | open; the answer presents it as a suggestion of a reset, which is what the log says |

Nothing in the answer goes beyond the log. The one place an agent could overreach is intra-block ordering, and the answer stops where the research does.

## Wording

Unchanged. The prompt was unambiguous and the "finality page" it cites exists on the site.
