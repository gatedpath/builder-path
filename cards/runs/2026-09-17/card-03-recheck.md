# Card 3, Explain the missing code: the answer re-checked on 2026-09-17

The agent's answer of 12 September (`../2026-09-12/card-03.md`) was checked again, claim by claim,
against RESEARCH.md as it stands on 17 September. No agent ran; this is a reading.

| Claim in the answer | 12 September | 17 September |
|---|---|---|
| DBFT is leaderless, finality deterministic, proposals form a super block | verified | unchanged; the S&P 2021 paper, read in full on 17 September, says the same (question 5 row) |
| Treat the receipt as final; idempotency keyed on transaction hash and log index | follows from the above | unchanged |
| Blocks only with traffic; bursts and silence | measured, question 4 | unchanged |
| "Vine ... says nothing about how transactions are ordered within it (open question 5)" | true | **superseded.** Redbelly answered on 17 September: the ordering is documented in the S&P 2021 paper for its UTXO design, changes in Q4 2026, and will be in the next yellow paper (questions 5 and 38). The advice, never depend on order inside a block, stands and is stronger |
| No `debug_*` or `trace_*`; read events | measured | unchanged |
| "Routescan indexes testnet as `153_2`, which suggests the chain has been reset once" | recorded as a suggestion, question 26 | **superseded.** The 15 September reading found block 1 matching Routescan's first indexed block, `153_2` equal to `153`, and no reset visible in chain data. The advice, record the genesis hash and refuse to continue on a mismatch, is still sound |

Four of six unchanged, two superseded by later research, and in both the agent's advice was the
safe one because it told the indexer not to depend on the uncertain thing. The project page carries
the two corrections beside the record.
