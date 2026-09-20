# Prompt cards

The prompt cards from PLAN.md section 14 are data in `site/src/data/cards.ts`; this folder holds
the evidence that a card was run. A card ships as verified only if a run on a fresh scaffold
compiles, passes the five credential-state tests and clears pre-flight (card 3, which produces
no code, ships on a correctness check against `RESEARCH.md`). Each run records the prompt as
written, the diff the agent produced, `forge test`, `redbelly-preflight`, the wall time and the
tools used, and says whether the card's wording changed because the run showed it was
ambiguous.

| Run | Cards | Agent | Result |
|---|---|---|---|
| `runs/2026-09-12/` | 1 to 4 (the warm-ups) | Claude Code | all four verified; cards 1 and 2 reworded |
| `runs/2026-09-14/` | 1, with the dev state panel in its prompt (wave 6) | Claude Code | verified in 38 s; the panel flipped wallet 3 from Valid to Revoked on the 708 gate; pre-flight's balance check failed for the public stand-in wallet at that day's price, recorded as measured |

PLAN.md section 14.1 asks for two agents per card. Only one has run so far; a second (Cursor)
waits for a machine that has it, and the site says so on every card. The monthly CI re-run the
plan asks for is not wired yet; it belongs with the ship report in Wave 5.
