// The prompt cards from PLAN.md section 14.2 (twelve there; 13 and 14 added 10 October 2026 from PLAN.md 21.8). Card 13 ran on
// 2026-10-10 with one agent and stopped at the fork (`forkOnly`); its prompt's test sentence was reworded
// after the run, which showed the five credential states are a recipe's question and not the network gate's.
// Card 13 deployed on 153 and verified on Routescan on 2026-10-17 (`forkOnly` removed; the record says what
// was and was not done on the real network).
// Card 9 deployed on 153 and verified on Routescan on 2026-10-23, reusing the scaffold token's mock verifier
// (never `forkOnly`; its record's verdict of 23 October says what ran on the real network).
// Card 14 run on 153 on 2026-10-23 through its own policy, the owner typing the confirmation at the human line
// (its record's verdict of 23 October; the live sends through the policy on 153 are still to come).
// Card 15 added 11 October 2026 from another builder's Discord question (RESEARCH question 61) and the
// candidate write-up under research/; unrun. Card 16 added 17 October 2026, the fee checker, written up
// under research/ first (PLAN 21.5) and run the same day on the deploy project's scaffold. Cards 17 and 18
// added the same evening from PLAN 23.4c and 23.4d (the register explorer, pay the register); 17 ran on 2026-10-27 on a fresh
// 0.2.3 scaffold from npm and read 44 registers live from mainnet (its record under cards/runs/2026-10-27/). Cards 6 to 12, 14, 15
// and 18 ran on 2026-10-17 on fresh scaffolds and local forks, one agent each; their records say what the prompt
// asked for that a fork cannot give. Fields per 14.1: title, one-line outcome,
// scope, estimated time, recipe used, the prompt, what you will learn, last verified with, and
// `run`, the path of the run record under cards/runs/. `lastVerified` stays null and
// `verifiedWith` empty until a card has been run on a fresh scaffold; nothing here claims a run
// that did not happen. Cards 1 to 4 ran on 2026-09-12 with one agent (Claude Code); the plan
// asks for two, so `secondAgentPending` says so on the card. Cards 1 and 2 were reworded after
// the run showed the original prompt did not fit the scaffold; the run records say why. Card 2 was
// reworded again on 2026-09-18, after the contract kit split the pauser and admin roles, and re-run
// the same day before this file changed. Card 5 ran on 2026-09-18 and stopped at a fork (`forkOnly`):
// its prompt asks for testnet and Routescan, which wait for a wallet.
// What you will build, taken from what each card actually asks for. These are three shapes of
// work, not three difficulties: there is no order among them and nothing here ranks a reader.
export type Scope = 'scaffold' | 'one-contract' | 'several-contracts';
// One value per folder in `recipes/`, so a chip on a card can never name a recipe a builder cannot
// open. Residency is a predicate inside a query rather than a recipe of its own, which is why there
// is no `jurisdiction` entry here; card 6 says so in its prompt.
export type Recipe = 'over-18' | 'au-wholesale' | 'issuer-credential' | 'business-delegate' | 'none' | 'any';

export interface PromptCardData {
  n: number;
  title: string;
  outcome: string;
  /** The idea pool (PLAN.md 20.8): why the project needs this network, and who would transact on it and
   *  how often. `who` describes; it never promises a number. Both are the owner's words to edit. */
  why: string;
  who: string;
  scope: Scope;
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
  /**
   * The project's contract on the real testnet, from the run record and nothing else: the address a
   * reader can open on Routescan, the block and the date it landed, and whether its use was then run
   * on the network. Absent until a deploy of ours has happened; a card never says "live" from a fork.
   */
  deployed?: Deployment;
}

/** One deployment on chain 153 (added 27 October 2026, site audit item 8). */
export interface Deployment {
  chain: 153;
  /** The contract's name as the record gives it. */
  contract: string;
  /** Checksummed address, copied from the record. */
  address: string;
  block: number;
  /** ISO date of the deploy transaction. */
  date: string;
  /** Verified on Routescan (source matches). Always true so far; a deploy of ours is verified the same hour. */
  verified: boolean;
  /**
   * ISO date on which the use the card describes was run on the network (a send through the guard, requests
   * through the policy, an invoice's life, a ticket's life), or null while only the deploy has happened.
   */
  useRun: string | null;
  /** Other contracts the project put on 153 beside this one (mocks, adapters), from the record. */
  others: number;
}

/** Routescan's testnet page for an address; a reader checks the source there, not on this site. */
export function routescanAddress(address: string): string {
  return `https://redbelly.testnet.routescan.io/address/${address}`;
}

export const RUNS_BASE =
  'https://github.com/gatedpath/builder-path/blob/main/';

export const scopeLabels: Record<Scope, string> = {
  scaffold: 'On the scaffold',
  'one-contract': 'One contract',
  'several-contracts': 'Several contracts',
};
export const scopeTimes: Record<Scope, string> = {
  scaffold: '15 to 30 minutes',
  'one-contract': 'Half a day',
  'several-contracts': 'A weekend',
};
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
export const labelTips: { key: Scope | Recipe; tip: string }[] = [
  {
    key: 'scaffold',
    tip: 'Change one thing on the scaffold you already have, and let the tests prove it. No new contract, and no wallet beyond the one you verified.',
  },
  {
    key: 'one-contract',
    tip: 'One contract of your own, from an empty folder to a gate that holds, tested in all five credential states.',
  },
  {
    key: 'several-contracts',
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
    tip: 'Any of the four recipes fits. Pick the one closest to the rule your contract needs.',
  },
  {
    key: 'none',
    tip: 'Leave the gate exactly as the scaffold ships it. This card is about something other than eligibility.',
  },
];

export const tipFor = new Map(labelTips.map((t) => [t.key, t.tip]));

export const cards: PromptCardData[] = [
  {
    n: 1,
    slug: 'change-the-gate',
    title: 'Change the gate',
    outcome: 'The gated function checks AU wholesale investor status instead of age, and the tests prove it.',
    why: 'The gate is one line bound to a recipe, so changing who may call a function is a change of recipe and not a rewrite. This is the smallest real change you can make to a gated contract, and the tests tell you whether you made it.',
    who: 'Nobody transacts. It runs in the tests on your machine, and it is here so that the first gate you ship is not the first one you have changed.',
    scope: 'scaffold',
    time: scopeTimes.scaffold,
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
    why: 'A token that carries regulated value needs a pause that only the right role can use, and proof that nothing moves while it is on. The kit separates who may pause from who may unpause, and this project makes you prove it.',
    who: 'Nobody transacts. The output is a set of tests and one invariant.',
    scope: 'scaffold',
    time: scopeTimes.scaffold,
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
    why: 'Finality on this network is deterministic, so the reorg handling you carry over from Ethereum is code that can never run. Knowing why lets you delete it on purpose and not by accident.',
    who: 'Nobody transacts. The output is a page of writing and a simpler indexer.',
    scope: 'scaffold',
    time: scopeTimes.scaffold,
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
    why: 'The mainnet gate belongs to this kit: a Safe as admin, a real verifier, a verified deployer and a ship report dated today. Being refused by it is the quickest way to learn what it checks.',
    who: 'Nobody transacts, by design. Every attempt is refused before anything is sent.',
    scope: 'scaffold',
    time: scopeTimes.scaffold,
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
    why: 'A bond may only be held by investors the law allows. Here the token checks that itself on every mint, transfer and claim, against the AU wholesale investor recipe, so the register of holders cannot drift from the list of people allowed to hold it.',
    who: 'The issuer mints once for each issue and funds each coupon, holders claim it, and holders trade between themselves when they choose. The coupons are the recurring traffic: one funding and a claim from each holder on every date.',
    scope: 'one-contract',
    time: scopeTimes['one-contract'],
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
    why: 'A registry is worth what its issuers are worth. Minting here is open only to a wallet holding a credential from one named issuer, checked by the contract, so the right to mint is not a key that someone was handed.',
    who: 'Issuers mint for each verified batch, buyers purchase and transfer, and every retirement is a transaction that can never be undone. Use shows up as retirements.',
    scope: 'one-contract',
    time: scopeTimes['one-contract'],
    recipes: ['issuer-credential', 'over-18'],
    prompt: 'Build a registry where an accredited issuer mints credits with a project ID and vintage, holders can retire credits permanently, and retirement emits an event a subgraph can index. Gate minting to issuer credentials and holding to over-18 residents of AU or NZ. Residency is a predicate, not a recipe of its own, but on-chain verification answers one query per request today, so write the residency predicate into the holder query document, bind the one request id, and say in the open that the residency half waits for the verifier rather than reaching for a second gate.',
    learn: 'Two gates on one contract, one-way state, events written for an indexer, and the difference between a recipe and a predicate inside one.',
    lastVerified: '2026-10-17',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-10-17/card-6.md',
    secondAgentPending: true,
  },
  {
    n: 7,
    slug: 'event-tickets-with-an-age-gate',
    title: 'Event tickets with an age gate',
    outcome: 'An ERC-721 ticket with an age-gated purchase, a resale price cap enforced on transfer, a check-in lock, organiser refunds and the three frontend states.',
    why: 'The buyer proves they are over eighteen without the organiser ever seeing a birth date, and the ticket enforces its own resale cap on every transfer.',
    who: 'Every sale, every resale and every check-in at the door is a transaction, so an event brings one burst on sale day and another when the doors open.',
    scope: 'one-contract',
    time: scopeTimes['one-contract'],
    recipes: ['over-18'],
    prompt: 'Build an ERC-721 ticket where purchase requires the over-18 recipe, resale is capped at a set percentage of face value with the cap enforced inside the transfer itself, tickets are non-transferable after check-in, and the organiser can refund. Include the frontend states for unverified, ineligible and eligible wallets. Capping how many tickets one person may hold is a different problem and is out of scope: the access check proves a wallet is verified, it does not prove two wallets are different people. Say so in a comment rather than writing a limit that does not hold.',
    learn: 'Gating an NFT mint, a transfer that checks a price as well as an eligibility, state that changes transferability, and where the identity layer stops.',
    lastVerified: '2026-10-17',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-10-17/card-7.md',
    deployed: { chain: 153, contract: 'GatedTicket', address: '0x7296ABEffB78f95B061D9F635714379C43a6E1E1', block: 3056726, date: '2026-10-25', verified: true, useRun: '2026-10-26', others: 0 },
    secondAgentPending: true,
  },
  {
    n: 8,
    slug: 'invoice-financing',
    title: 'Invoice financing',
    outcome: 'A verified business lists an invoice, an eligible investor funds it at a discount, repayment releases the funds.',
    why: 'Both sides are checked by the contract and not by a back office: the seller is a delegate of a verified business, and the funder passes the wholesale investor gate.',
    who: 'A business lists an invoice, an investor funds it, and the repayment releases the funds: three transactions for each invoice, for as long as the business keeps invoicing.',
    scope: 'one-contract',
    time: scopeTimes['one-contract'],
    recipes: ['business-delegate', 'au-wholesale'],
    prompt: 'Build a contract where a verified business lists an invoice, an eligible investor funds it at a discount, and repayment releases funds. Use the business-delegate recipe for the listing side, so the lister is a delegate or officeholder the business has authorised (the recipe\'s request id 0) acting for the business, rather than a person holding a credential of their own, and the wholesale recipe for investors.',
    learn: 'Different recipes for different roles on one contract; a business acting through a delegate wallet rather than a personal identity.',
    lastVerified: '2026-10-17',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-10-17/card-8.md',
    deployed: { chain: 153, contract: 'InvoiceFinancing', address: '0xcd7F22Ddc8d22224A98f1c98c601F890cb3F3d90', block: 3056722, date: '2026-10-25', verified: true, useRun: '2026-10-25', others: 5 },
    secondAgentPending: true,
  },
  {
    n: 9,
    slug: 'grant-milestone-escrow',
    title: 'Grant milestone escrow',
    outcome: 'A funder deposits stablecoin, a grantee proves eligibility, a reviewer releases tranches with an on-chain note.',
    why: 'The funder chooses what a grantee has to prove, using any recipe, and the escrow will not release money to a wallet that cannot prove it.',
    who: 'One deposit, then one release for each milestone with a note from the reviewer on chain. Few transactions, each one carrying real value.',
    scope: 'one-contract',
    time: scopeTimes['one-contract'],
    recipes: ['any'],
    prompt: 'Build an escrow where a funder deposits stablecoin, a grantee proves eligibility, and a reviewer role releases tranches against milestones with an on-chain note per release.',
    learn: 'Roles, tranches and a written record on-chain; picking the recipe yourself.',
    lastVerified: '2026-10-17',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-10-17/card-9.md',
    deployed: { chain: 153, contract: 'GrantEscrow', address: '0x57B3848Dabd2488495Af156e7b198f19eF32D395', block: 3055920, date: '2026-10-23', verified: true, useRun: null, others: 0 },
    secondAgentPending: true,
  },
  {
    n: 10,
    slug: 'gated-liquidity-pool',
    title: 'Gated liquidity pool',
    outcome: 'A Uniswap v2 pair with pool entry gated to wholesale wallets and swaps open to any verified wallet.',
    why: 'Two kinds of participant share one pool, and the pool enforces the difference: only wholesale wallets may provide liquidity, while any verified wallet may swap.',
    who: 'Liquidity providers add and remove now and then. Swaps are the daily traffic, if the pair is one people want.',
    scope: 'several-contracts',
    time: scopeTimes['several-contracts'],
    recipes: ['au-wholesale'],
    prompt: 'Using Uniswap v2 core (vendor Uniswap/v2-core v1.0.1; the fork in the Redbelly GitHub org is the interface only and holds no contracts), add an eligibility check to pair entry so only wholesale-credentialed wallets can add liquidity, leave swaps open to any verified wallet, and document the trade-offs.',
    learn: 'Where identity gating goes in a swap; LP eligibility; writing down a trade-off.',
    lastVerified: '2026-10-17',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-10-17/card-10.md',
    secondAgentPending: true,
  },
  {
    n: 11,
    slug: 'fractional-property',
    title: 'Fractional property',
    outcome: 'ERC-1155 units, a rental income distributor and a unit-weighted sale vote, all gated, admin behind a timelocked Safe, ship report produced.',
    why: 'Units can only ever sit in wallets that pass the wholesale gate, so the register of owners is a register of eligible investors by construction.',
    who: 'Units change hands rarely. Rent goes out to holders on a schedule, and a vote on a sale is one transaction from each holder.',
    scope: 'several-contracts',
    time: scopeTimes['several-contracts'],
    recipes: ['au-wholesale'],
    prompt: 'Build a property vehicle: an ERC-1155 of units, a rental income distributor, a governance vote on sale weighted by units, all gated to the AU wholesale recipe. Admin behind a Safe with a 48-hour timelock. Produce the ship report.',
    learn: 'More than one contract under one gate; a timelock in front of admin; the ship report as the finish line.',
    lastVerified: '2026-10-17',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-10-17/card-11.md',
    secondAgentPending: true,
  },
  {
    n: 12,
    slug: 'startup-cap-table',
    title: 'Startup cap table',
    outcome: 'Share classes, vesting schedules, board approval for transfers, per-class gating, a ship report and a one-page explanation a lawyer could read.',
    why: 'Each share class carries its own gate and a transfer needs board approval on chain, so the cap table cannot drift away from who is allowed to hold what.',
    who: 'Few transactions, each one mattering: grants, vesting releases and approved transfers. A cap table is not daily traffic, and this card does not pretend it is.',
    scope: 'several-contracts',
    time: scopeTimes['several-contracts'],
    recipes: ['any'],
    prompt: 'Build a cap table with share classes, vesting schedules, a transfer approval flow for the board role, and eligibility gating per class. Produce the ship report and a one-page explanation a lawyer could read.',
    learn: 'Gating per class, an approval flow, and explaining the result to someone who will not read the code.',
    lastVerified: '2026-10-17',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-10-17/card-12.md',
    secondAgentPending: true,
  },
  {
    n: 13,
    slug: 'transfer-that-refuses-to-lose-money',
    title: 'A transfer that refuses to lose your money',
    outcome: 'A guard in front of every send: the recipient is checked against the network\'s permission contract before the transaction is built, on chain as well as in the wallet, with an address book that resolves a name to an address and shows the check beside it.',
    why: 'The network\'s founder described this exact project on the network\'s own podcast (Redbelly Insights, episode 32, from minute 27) as the side project he would hand to someone who wants to build here: a wallet that asks the permission contract whether the destination has passed the identity gate before it sends, so a typo cannot send money to an address nobody holds. Only here can a wallet or a contract ask that question of every address, so only here does this check exist.',
    who: 'Anyone sending RBNT or a token to a person, every time they send. The guard sits in front of transfers that would happen anyway, so its use is the network\'s own transfer traffic and not a new kind of it.',
    scope: 'one-contract',
    time: scopeTimes['one-contract'],
    recipes: ['none'],
    prompt: 'Build a transfer guard with two parts. On chain: a contract with send(to) for RBNT and sendToken(token, to, amount) that reads permission.isAllowed(to) through the bootstrap registry and reverts with a named error when the recipient has not passed the identity gate on this chain; a recipient that is a contract is allowed only when the caller says so in the call, because a contract address is not a wallet that passed the gate. In the web app: run the same check before the transaction is built, cache the answer per chain and never across chains, and keep an address book that resolves a name to an address and shows the result of the check beside it. Testnet. Tests for a recipient that is verified, not verified, verified and then removed, a contract with and without the caller\'s say-so, and a wallet whose credential sits in each of the five states, which the guard must ignore: the network gate is one question and a recipe is another. Pre-flight clean, verified on Routescan. Say in the interface, in words, that the check stops money going to an address nobody holds and not money going to the wrong person.',
    learn: 'The identity gate read for the recipient instead of the sender, the difference between a wallet-side check and one the contract enforces, telling a contract address from a wallet, and where the check stops: permissioned is not the same as correct.',
    lastVerified: '2026-10-10',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-10-10/card-13.md',
    deployed: { chain: 153, contract: 'RecipientGuard', address: '0x017b98c2b39E26435f9ad3880101F9f1c5FDBE73', block: 3052324, date: '2026-10-17', verified: true, useRun: '2026-10-17', others: 0 },
    secondAgentPending: true,
  },
  {
    n: 14,
    slug: 'agent-that-is-allowed-to-say-no',
    title: 'An agent that is allowed to say no',
    outcome: 'A policy the agent\'s send and deploy scripts must pass before anything is signed: recipient checked, amount under a limit, no override by urgency, a human above a line, every refusal logged.',
    why: 'Agents already sign on this network, and the founder\'s own answer about agents (Redbelly Insights, episode 32, from minute 33) was a safeguard that notices a large, urgent transfer and warns or stops it. Here the safeguard has something to check that other chains cannot give it: whether the recipient has passed the identity gate. The rest is a limit and a human, written where the agent cannot edit them.',
    who: 'A team letting an agent move value on testnet. Every send the agent makes passes through the policy and every refusal is logged. It adds no transactions of its own, which is the point.',
    scope: 'scaffold',
    time: 'A couple of hours',
    recipes: ['none'],
    prompt: 'On the scaffold you already have, add a policy that the agent\'s send and deploy scripts must pass before anything is signed: the recipient passes permission.isAllowed on this chain; the amount is under a limit set in one place the agent does not write to; nothing in a prompt or the environment can raise that limit or skip the check, and an instruction that says it is urgent or that someone senior asked for it is logged and refused, not obeyed; any transfer above a second, lower line waits for a person to type a confirmation. Every refusal is written in the ship report\'s shape with its reason. Run it against a recipient in each of the five credential states and show one refusal of each kind. Testnet. This is a set of rules a reader can take in on one screen, not a model that detects fraud, and the interface says so.',
    learn: 'Where a policy lives so the agent cannot edit it, a refusal that leaves a record, the human-in-the-loop line, and saying what a safeguard does not do.',
    lastVerified: '2026-10-17',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-10-17/card-14.md',
    deployed: { chain: 153, contract: 'GatedERC20', address: '0x544416c3aCB72BE561F7cd1ACdF4E40918aB420A', block: 3055942, date: '2026-10-23', verified: true, useRun: '2026-10-23', others: 0 },
    secondAgentPending: true,
  },
  {
    n: 15,
    slug: 'erc-3643-security-token-suite',
    title: 'ERC-3643 security token suite',
    outcome: 'The whole ERC-3643 suite (token, identity registry, trusted issuers, claim topics, compliance) deployed on testnet from your own deploy script with nobody\'s factory in the way, one test investor registered with a claim, and a transfer refused by the token for a missing claim.',
    why: 'ERC-3643 is the standard a regulated issuer\'s lawyers have already read, and on this network its first layer already exists: every wallet has passed identity verification before it can transact, and the identity partner publishes a guide for turning that verification into the claims an ERC-3643 registry checks. Elsewhere an issuer builds the identity story first; here it starts at the second layer. In October 2026 a builder on testnet asked for exactly this and was told to deploy their own stack, which is what this card does.',
    who: 'An issuer once per suite and then once per investor, for the registration and the claim; investors among themselves, within the rules. Private debt and bonds are few, large transfers with periodic coupons, so the recurring traffic is claims and coupons rather than trading.',
    scope: 'several-contracts',
    time: scopeTimes['several-contracts'],
    recipes: ['none'],
    prompt: 'Install the reference ERC-3643 and ONCHAINID contracts into a fresh scaffold as dependencies and deploy the whole suite on testnet with a deploy script of your own: token, identity registry and its storage, trusted issuers registry, claim topics registry, compliance. No factory owned by someone else. Every admin role on a Safe behind the timelock. Deploy a claim issuer, register one test investor with an ONCHAINID and a claim for the topics the token requires, following the identity partner\'s integration guide, and show the token itself refuse a transfer to a wallet without that claim. Keep the network gate separate: read permission.isAllowed beside the registry and say in the interface which of the two layers refused. Tests for every state a claim can be in, pre-flight clean, verified on Routescan, a ship report.',
    learn: 'The two identity layers and which one answers which question, deploying a suite of contracts without a factory, claims and claim topics, and why a regulated issuer asks for this standard by name.',
    lastVerified: '2026-10-17',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-10-17/card-15.md',
    secondAgentPending: true,
    forkOnly: true,
  },
  {
    n: 16,
    slug: 'fee-checker',
    title: 'The fee checker',
    outcome: 'A read-only page that prices a call on each chain from the latest base fee and the network\'s own price feed: four measured calls, a box for your own gas figure, and the enable call at nine block heights across two years of mainnet, drawn as two charts and a table, every figure dated.',
    why: 'Gas on this network is priced in US dollars and paid in RBNT at the feed\'s rate, and most wallets show it wrongly; the network\'s own fee notes say so, and my own enable fee showed it, 20.4 RBNT in the first week of mainnet and 568 today for the same dollar. Only a page that reads the chain can show the cost honestly, and what a call costs is the first thing a builder asks here.',
    who: 'Anyone about to pay a fee, before they pay it. The page reads and never writes, so it adds no transactions of its own; its use is the question every builder and every holder asks before the first one.',
    scope: 'scaffold',
    time: 'An hour or two',
    recipes: ['none'],
    prompt: 'On the scaffold you already have, add a page that tells a visitor what a transaction costs on this network right now, read from the chain and not from a wallet: the base fee of the latest block and the price feed\'s US dollar rate for RBNT, priced for four calls (a plain transfer at 21,000 gas, the recipient guard from project 13 at 503,685, the scaffold\'s token at 1,971,486 and enabling a wallet at 2,154,375, each with where its figure was measured), a box where the reader types a gas figure and sees it in RBNT and in dollars, and the enable call\'s cost at nine block heights from the first week of mainnet to the head, drawn as two charts, one in RBNT on a log scale and one in dollars, with the same figures as a table. Both chains, each read on its own. Nothing stored, nothing sent anywhere but the public RPC, a dated line saying when each figure was read, and a plain sentence that the dollar line is flat because the network prices gas in dollars and converts to RBNT at the time of the call. Say what the page is not: a fee estimate for your own contract, or a price of RBNT anywhere but the network\'s own feed.',
    learn: 'Where the base fee and the feed price live and how to read both in one call, pricing gas in integers until the last step, a page that needs no wallet and writes nothing, why a log scale is the honest one for a token priced in dollars, and dating every figure you show.',
    lastVerified: '2026-10-17',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-10-17/card-16.md',
    secondAgentPending: true,
  },
  {
    n: 17,
    slug: 'register-explorer',
    title: 'The register explorer',
    outcome: 'A read-only page that lists every ERC-3643 register on the chain the app points at, with name, supply, pause state, the gate kind (registration only or claims), trusted issuers and claim topics, and says for the connected wallet which registers have verified it; the same reads the kit\'s register reader makes, one hook per register.',
    why: 'Forty-four of the 527 token contracts on mainnet were ERC-3643 registers in the census of 12 October 2026, each with an identity registry that answers isVerified for any wallet, and nothing on the network reads that layer for a visitor; the explorer shows a register as a token with holders and no more. Only here does every register sit beside a network-wide identity gate, so one page can say which of the three gates a wallet has passed.',
    who: 'A holder before a transfer, an issuer\'s operations team, and anyone deciding whether to build beside a register. It reads and never writes, so it adds no transactions; it makes the ones that follow safer.',
    scope: 'scaffold',
    time: 'A couple of hours',
    recipes: ['none'],
    prompt: 'On the scaffold you already have, add a page that lists every ERC-3643 register on the chain the app points at. Keep the candidate addresses in one file and ask each whether identityRegistry() answers with a contract; for each that does, read its name, symbol, supply, decimals, version, pause state, the registry and its storage, the trusted issuers with the topics each is trusted for, the claim topics the token requires, and the word the kit uses for the gate kind, registration only or claims. With a wallet connected, show for each register whether its registry has verified that wallet, its country code, whether it is frozen, and its balance, in the same words the kit uses for its states. Read-only: nothing is written, nothing leaves the browser but reads of the public RPC, and every figure carries the block it was read at. Mainnet is the chain with registers on it today; say so, and say that reading mainnet signs nothing. Say in the interface which of the three gates each answer belongs to: the network gate, a recipe gate, the register gate.',
    learn: 'The ERC-3643 register as a second identity layer, the three gates and which question each answers, reading a suite of contracts through one hook, and a page that is honest about which chain it reads.',
    lastVerified: '2026-10-27',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-10-27/card-17.md',
    secondAgentPending: true,
  },
  {
    n: 18,
    slug: 'pay-the-register',
    title: 'Pay the register',
    outcome: 'A distribution tool: given a register\'s address it rebuilds the holder table from the chain, lets the fund\'s administrator pay a distribution in an on-chain AUD stablecoin to every holder pro rata, and writes a receipt log; stablecoin transfers only, never register transfers, so no contract of yours needs the issuer\'s registration.',
    why: 'A distribution date is the moment a register turns into dozens or hundreds of real transactions, which is the traffic this network was built for and the thing its own chief executive said it lacks. Only here does a holder table come with a verified identity behind every row, and only here do licensed AUD stablecoins sit on the same chain as the registers they would pay.',
    who: 'A fund administrator on every coupon or distribution date, paying every holder in one sitting; holders receive and need do nothing. Few sittings, many transfers each.',
    scope: 'one-contract',
    time: scopeTimes['one-contract'],
    recipes: ['none'],
    prompt: 'Build a distribution tool for an ERC-3643 register that exists on the network. Rebuild the holder table from the chain (Transfer events windowed at 100 blocks per eth_getLogs, then balanceOf at one block) and show it with the block it was read at. A contract that takes a stablecoin, a register address, a total and a snapshot block, and pays every holder pro rata to its balance at that block, in one or more transactions, with an event per payment and a receipt log the administrator can export; the payer is the administrator\'s own verified wallet and the contract writes stablecoin transfers only, never register transfers, so it crosses no register gate. Before anything else, read whether the AUD stablecoins on mainnet gate their senders or recipients and whether a contract may send them, and say what you found; if a stablecoin refuses contract senders, pay from the wallet one transfer at a time and say so in the interface. Testnet with a mock stablecoin and a register you deploy from project 15\'s suite, or a fork of mainnet against a real register with nothing signed on the real network. Tests for a holder whose balance moved after the snapshot block, a holder with zero balance, rounding dust, and a payment that fails part way. Pre-flight clean, a ship report.',
    learn: 'Rebuilding a holder table from events, choosing a snapshot block, paying pro rata without dust, writing to a stablecoin while never touching a register, and reading another issuer\'s token before you build on it.',
    lastVerified: '2026-10-17',
    verifiedWith: ['Claude Code'],
    run: 'cards/runs/2026-10-17/card-18.md',
    secondAgentPending: true,
    forkOnly: true,
  },
];

export const scaffoldCards = cards.filter((c) => c.scope === 'scaffold');
