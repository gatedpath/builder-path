// The twelve prompt cards from PLAN.md section 14.2. Fields per 14.1: title, one-line outcome,
// level, estimated time, recipe used, the prompt, what you will learn, last verified with, and
// `run`, the path of the run record under cards/runs/. `lastVerified` stays null and
// `verifiedWith` empty until a card has been run on a fresh scaffold; nothing here claims a run
// that did not happen. Cards 1 to 4 ran on 2026-09-12 with one agent (Claude Code); the plan
// asks for two, so `secondAgentPending` says so on the card. Cards 1 and 2 were reworded after
// the run showed the original prompt did not fit the scaffold; the run records say why. Card 2 was
// reworded again on 2026-09-18, after the contract kit split the pauser and admin roles, and re-run
// the same day before this file changed. Card 5 ran on 2026-09-18 and stopped at a fork (`forkOnly`):
// its prompt asks for testnet and Routescan, which wait for a wallet.
export type Level = 'warm-up' | 'build' | 'stretch';
// One value per folder in `recipes/`, so a chip on a card can never name a recipe a builder cannot
// open. Residency is a predicate inside a query rather than a recipe of its own, which is why there
// is no `jurisdiction` entry here; card 6 says so in its prompt.
export type Recipe = 'over-18' | 'au-wholesale' | 'issuer-credential' | 'business-delegate' | 'none' | 'any';

export interface PromptCardData {
  n: number;
  title: string;
  outcome: string;
  level: Level;
  time: string;
  recipes: Recipe[];
  prompt: string;
  learn: string;
  lastVerified: string | null;
  verifiedWith: string[];
  /** Path of the run record, relative to the repository's redbelly-development-tool folder. */
  run?: string;
  /** The card's own project page under /tutorials/<slug>/ (PLAN.md section 19), when it has one. */
  slug?: string;
  /** PLAN 14.1 asks for two agents; true while only one has run the card. */
  secondAgentPending?: boolean;
  /**
   * True when the card's own words ask for a real network (a testnet deploy, a Routescan
   * verification) and the run stopped at a fork, because nothing of ours has signed on a real network yet. The badge
   * still shows the run's date, and the card says in words how far the run went, so "Verified" can
   * never read as more than was done.
   */
  forkOnly?: boolean;
}

export const RUNS_BASE =
  'https://github.com/gatedpath/builder-path/blob/main/';

export const levelLabels: Record<Level, string> = { 'warm-up': 'Warm-up', build: 'Build', stretch: 'Stretch' };
export const levelTimes: Record<Level, string> = { 'warm-up': '15 to 30 minutes', build: 'Half a day', stretch: 'A weekend' };
export const recipeLabels: Record<Recipe, string> = {
  'over-18': 'Over 18',
  'au-wholesale': 'AU wholesale investor',
  'issuer-credential': 'Issuer credential',
  'business-delegate': 'Business delegate',
  none: 'No recipe change',
  any: 'Any recipe',
};

// A short direction for every label on a card that a reader cannot decode on its own. One or two
// sentences each: what the label demands of you, or what the proof actually proves. These are the
// tooltip texts; `tip` is an editable field, so they go through "Website Text Edits" like the rest
// of the site's prose.
export const labelTips: { key: Level | Recipe; tip: string }[] = [
  {
    key: 'warm-up',
    tip: 'Change one thing on the scaffold you already have, and let the tests prove it. No new contract, and no wallet beyond the one you verified.',
  },
  {
    key: 'build',
    tip: 'One contract of your own, from an empty folder to a gate that holds, tested in all five credential states.',
  },
  {
    key: 'stretch',
    tip: 'More than one contract, an admin behind a Safe, and a ship report produced before anything is called finished.',
  },
  {
    key: 'over-18',
    tip: 'Proves the holder is an adult and reveals nothing else. It is request id 18 in the scaffold, so this is the recipe to start on.',
  },
  {
    key: 'au-wholesale',
    tip: 'Proves an accountant has certified the holder as a sophisticated or wholesale investor. On a public chain that reveals financial information about a person, so read the privacy note in the recipe before you use it.',
  },
  {
    key: 'issuer-credential',
    tip: 'Proves the holder carries a credential from one named accredited issuer. Pin the issuer in the query, or you are proving less than you think.',
  },
  {
    key: 'business-delegate',
    tip: 'Proves the wallet is an authorised representative of a verified business. It is a role read on the business identifier contract rather than a zero-knowledge proof, so it behaves differently from the other three.',
  },
  {
    key: 'any',
    tip: 'Any of the four recipes fits. Pick the one closest to the rule your contract actually needs.',
  },
  {
    key: 'none',
    tip: 'Leave the gate exactly as the scaffold ships it. This card is about something other than eligibility.',
  },
];

export const tipFor = new Map(labelTips.map((t) => [t.key, t.tip]));

/** How many of the three effort marks a level fills. Read as a difficulty meter, not a rating. */
export const levelWeight: Record<Level, number> = { 'warm-up': 1, build: 2, stretch: 3 };

export const cards: PromptCardData[] = [
  {
    n: 1,
    slug: 'change-the-gate',
    title: 'Change the gate',
    outcome: 'The gated function checks AU wholesale investor status instead of age, and the tests prove it.',
    level: 'warm-up',
    time: levelTimes['warm-up'],
    recipes: ['au-wholesale', 'over-18'],
    prompt: 'Switch the gated function from the over-18 recipe (request id 18) to the AU wholesale investor recipe (708). Keep everything else. Run the five-state tests, then run npm run dev and use the dev state panel to show wallet 3 passing the 708 gate and failing it once it is Revoked. Show me the diff.',
    learn: 'Recipes are swappable; tests are the contract; the local loop shows the gate move.',
    lastVerified: '2026-09-14',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-09-14/card-01.md',
    secondAgentPending: true,
  },
  {
    n: 2,
    slug: 'prove-the-pause',
    title: 'Prove the pause',
    outcome: 'Proof that only the pauser can pause and only the admin can unpause, that every flip emits, and an invariant that nothing the token holds changes while paused.',
    level: 'warm-up',
    time: levelTimes['warm-up'],
    recipes: ['none'],
    prompt: 'The token already pauses. Prove it: show that only the pauser can pause and only the admin can unpause, that every flip emits an event, and add an invariant test that nothing the token holds changes while paused, including through mint.',
    learn: 'Admin roles live behind the Safe; invariants.',
    lastVerified: '2026-09-18',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-09-18/card-02.md',
    secondAgentPending: true,
  },
  {
    n: 3,
    slug: 'explain-the-missing-code',
    title: 'Explain the missing code',
    outcome: 'A written explanation of why there is no reorg handling, and what your indexer must do instead.',
    level: 'warm-up',
    time: levelTimes['warm-up'],
    recipes: ['none'],
    prompt: 'Explain why this project has no confirmation-count or reorg handling, citing the finality page. Then tell me what my off-chain indexer must do instead.',
    learn: 'Deterministic finality and idempotency. No code produced.',
    lastVerified: '2026-09-12',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-09-12/card-03.md',
    secondAgentPending: true,
  },
  {
    n: 4,
    slug: 'break-it-on-purpose',
    title: 'Break it on purpose',
    outcome: 'A refused mainnet deploy, with pre-flight’s exact reasons in front of you.',
    level: 'warm-up',
    time: levelTimes['warm-up'],
    recipes: ['none'],
    prompt: 'Try to deploy this to mainnet right now and show me exactly what pre-flight says and why.',
    learn: 'The two-speed rule, experienced rather than read.',
    lastVerified: '2026-09-12',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-09-12/card-04.md',
    secondAgentPending: true,
  },
  {
    n: 5,
    slug: 'tokenised-bond',
    title: 'Tokenised bond',
    outcome: 'A fixed-coupon bond token on testnet: gated mint and transfers, stablecoin coupons, forced transfer with a justification.',
    level: 'build',
    time: levelTimes.build,
    recipes: ['au-wholesale'],
    prompt: 'Build a fixed-coupon bond token: issuer mints to eligible AU wholesale investors, coupons paid in a stablecoin on a schedule, transfers only between eligible holders, forced transfer with on-chain justification for the compliance role. Testnet. Five-state tests on every gated function, pre-flight clean, verified on Routescan.',
    learn: 'The gated ERC-20 shape, scheduled payments, a compliance role that leaves a trail.',
    lastVerified: '2026-09-18',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-09-18/card-05.md',
    secondAgentPending: true,
    forkOnly: true,
  },
  {
    n: 6,
    slug: 'carbon-credit-registry',
    title: 'Carbon credit registry',
    outcome: 'A registry with issuer-gated minting, permanent retirement, and an event a subgraph can index.',
    level: 'build',
    time: levelTimes.build,
    recipes: ['issuer-credential', 'over-18'],
    prompt: 'Build a registry where an accredited issuer mints credits with a project ID and vintage, holders can retire credits permanently, and retirement emits an event a subgraph can index. Gate minting to issuer credentials and holding to over-18 residents of AU or NZ. Residency is a predicate inside the over-18 recipe\'s query, not a recipe of its own, so add it to that query rather than reaching for a second gate.',
    learn: 'Two gates on one contract, one-way state, events written for an indexer, and the difference between a recipe and a predicate inside one.',
    lastVerified: null,
    verifiedWith: [],
  },
  {
    n: 7,
    slug: 'event-tickets-with-an-age-gate',
    title: 'Event tickets with an age gate',
    outcome: 'An ERC-721 ticket with an age-gated purchase, a resale price cap enforced on transfer, a check-in lock, organiser refunds and the three frontend states.',
    level: 'build',
    time: levelTimes.build,
    recipes: ['over-18'],
    prompt: 'Build an ERC-721 ticket where purchase requires the over-18 recipe, resale is capped at a set percentage of face value with the cap enforced inside the transfer itself, tickets are non-transferable after check-in, and the organiser can refund. Include the frontend states for unverified, ineligible and eligible wallets. Capping how many tickets one person may hold is a different problem and is out of scope: the access check proves a wallet is verified, it does not prove two wallets are different people. Say so in a comment rather than writing a limit that does not hold.',
    learn: 'Gating an NFT mint, a transfer that checks a price as well as an eligibility, state that changes transferability, and where the identity layer stops.',
    lastVerified: null,
    verifiedWith: [],
  },
  {
    n: 8,
    slug: 'invoice-financing',
    title: 'Invoice financing',
    outcome: 'A verified business lists an invoice, an eligible investor funds it at a discount, repayment releases the funds.',
    level: 'build',
    time: levelTimes.build,
    recipes: ['business-delegate', 'au-wholesale'],
    prompt: 'Build a contract where a verified business lists an invoice, an eligible investor funds it at a discount, and repayment releases funds. Use the business-delegate recipe for the listing side, so the lister is an authorised representative acting for the business rather than a person holding a credential of their own, and the wholesale recipe for investors.',
    learn: 'Different recipes for different roles on one contract; a business acting through a delegate wallet rather than a personal identity.',
    lastVerified: null,
    verifiedWith: [],
  },
  {
    n: 9,
    slug: 'grant-milestone-escrow',
    title: 'Grant milestone escrow',
    outcome: 'A funder deposits stablecoin, a grantee proves eligibility, a reviewer releases tranches with an on-chain note.',
    level: 'build',
    time: levelTimes.build,
    recipes: ['any'],
    prompt: 'Build an escrow where a funder deposits stablecoin, a grantee proves eligibility, and a reviewer role releases tranches against milestones with an on-chain note per release.',
    learn: 'Roles, tranches and a written record on-chain; picking the recipe yourself.',
    lastVerified: null,
    verifiedWith: [],
  },
  {
    n: 10,
    slug: 'gated-liquidity-pool',
    title: 'Gated liquidity pool',
    outcome: 'The forked Uniswap interface with pool entry gated to wholesale wallets and swaps open to any verified wallet.',
    level: 'stretch',
    time: levelTimes.stretch,
    recipes: ['au-wholesale'],
    prompt: 'Using the forked Uniswap interface in the Redbelly GitHub org, add an eligibility check to pool entry so only wholesale-credentialed wallets can add liquidity, leave swaps open to any verified wallet, and document the trade-offs.',
    learn: 'Where identity gating goes in a swap; LP eligibility; writing down a trade-off.',
    lastVerified: null,
    verifiedWith: [],
  },
  {
    n: 11,
    slug: 'fractional-property',
    title: 'Fractional property',
    outcome: 'ERC-1155 units, a rental income distributor and a unit-weighted sale vote, all gated, admin behind a timelocked Safe, ship report produced.',
    level: 'stretch',
    time: levelTimes.stretch,
    recipes: ['au-wholesale'],
    prompt: 'Build a property vehicle: an ERC-1155 of units, a rental income distributor, a governance vote on sale weighted by units, all gated to the AU wholesale recipe. Admin behind a Safe with a 48-hour timelock. Produce the ship report.',
    learn: 'More than one contract under one gate; a timelock in front of admin; the ship report as the finish line.',
    lastVerified: null,
    verifiedWith: [],
  },
  {
    n: 12,
    slug: 'startup-cap-table',
    title: 'Startup cap table',
    outcome: 'Share classes, vesting schedules, board approval for transfers, per-class gating, a ship report and a one-page explanation a lawyer could read.',
    level: 'stretch',
    time: levelTimes.stretch,
    recipes: ['any'],
    prompt: 'Build a cap table with share classes, vesting schedules, a transfer approval flow for the board role, and eligibility gating per class. Produce the ship report and a one-page explanation a lawyer could read.',
    learn: 'Gating per class, an approval flow, and explaining the result to someone who will not read the code.',
    lastVerified: null,
    verifiedWith: [],
  },
];

export const warmUpCards = cards.filter((c) => c.level === 'warm-up');
