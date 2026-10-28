# The Builder Path, for Redbelly Network

I made this to take a dApp from an idea to deployed on [Redbelly Network](https://redbelly.network) (chain 151 is mainnet, 153 is testnet) without skipping the normal steps that get skipped: the identity gate, the checks before you sign anything, and watching the contract once it is live. It works if you write in Solidity yourself or if you tell an AI coding agent to write this for you.

This is an independent project. Redbelly did not make it and is not associated with it. Their own developer portal is [Vine](https://vine.redbelly.network). If you want a fact about the network, Vine is where to reference it. What you find here is what that means for the code you are about to write.

## Try here

```sh
npm create redbelly-dapp@latest my-app -- --yes
cd my-app
npm install
npm run contracts:install
npm run test
```

You need Node 22 or later and [Foundry](https://getfoundry.sh). If something is missing on your machine, `npm run doctor` will tell you exactly what. When your tests finish, the last line reads `68 tests passed, 0 failed` (that is with scaffolder 0.2.3, which I ran from the public registry in an empty folder on 26 October 2026, the day it was published, and again on 27 October for the register explorer below).

So what did that just give you? A set of Foundry contracts built on a gated base, tested against every state a credential can be in: valid, expired, revoked, wrong jurisdiction, and never issued. There are fuzz and invariant tests in there too. You also get a Next.js web app that walks a user through verifying their wallet and then offers one gated action, plus rules files for Claude Code, Cursor, Codex CLI, Copilot, and Gemini CLI, so whichever agent you use starts with the same ground rules. `npm run dev` runs the whole thing locally on Anvil. Before you sign anything, there is a pre-flight to run, and the deploy script will refuse mainnet unless you have a real Safe 1.4.1, a real verifier contract, a verified deployer and a ship report dated today.

## What is on the real network

Since the first copy of this page went up, the path has been walked on testnet 153 for real, from my own verified wallet, one signature at a time. Eighteen prompt cards exist and every one has now been run once by an agent on a fresh scaffold. Five of them are deployed on 153 and their source is verified on Routescan, and four of the five have had their actual use run on the network, not on a fork. Each card's run record under [`cards/runs/`](cards/runs) carries the transactions, the gas and what the real network showed that a fork could not.

| Card | Contract on 153 | Deployed | Its use on the network |
|---|---|---|---|
| 13, a transfer that refuses to lose money | [`RecipientGuard`, 0x017b…BE73](https://redbelly.testnet.routescan.io/address/0x017b98c2b39E26435f9ad3880101F9f1c5FDBE73/contract/153/code) | 17 Oct 2026, block 3,052,324 | one send through it, and the refusal of an unverified recipient read live ([record](cards/runs/2026-10-10/card-13.md)) |
| the scaffold's own token | [`GatedERC20`, 0x26ab…9BaC](https://redbelly.testnet.routescan.io/address/0x26ab267769C249a007e2f1869272bf30fd169BaC/contract/153/code) and its mock verifier | 23 Oct 2026, block 3,055,910 | the gate read back live; no supply yet ([record](cards/runs/2026-10-23/scaffold-token.md)) |
| 9, grant milestone escrow | [`GrantEscrow`, 0x57B3…D395](https://redbelly.testnet.routescan.io/address/0x57B3848Dabd2488495Af156e7b198f19eF32D395/contract/153/code) | 23 Oct 2026, block 3,055,920 | deployed and verified; its deposit and release are still to run ([record](cards/runs/2026-10-17/card-9.md)) |
| 14, an agent that is allowed to say no | [`GatedERC20`, 0x5444…420A](https://redbelly.testnet.routescan.io/address/0x544416c3aCB72BE561F7cd1ACdF4E40918aB420A/contract/153/code) | 23 Oct 2026, block 3,055,942, through the policy | six sends through the policy: two allowed, one held for a human, three refused ([record](cards/runs/2026-10-17/card-14.md)) |
| 8, invoice financing | [`InvoiceFinancing`, 0xcd7F…3d90](https://redbelly.testnet.routescan.io/address/0xcd7F22Ddc8d22224A98f1c98c601F890cb3F3d90/contract/153/code) | 25 Oct 2026, block 3,056,722 | one invoice listed, funded, repaid, frozen and released, behind live-shape verifier adapters ([record](cards/runs/2026-10-17/card-8.md)) |
| 7, event tickets with an age gate | [`GatedTicket`, 0x7296…E1E1](https://redbelly.testnet.routescan.io/address/0x7296ABEffB78f95B061D9F635714379C43a6E1E1/contract/153/code) | 25 Oct 2026, block 3,056,726 | eleven transactions on 26 Oct: tickets bought and refunded, every refusal read live ([record](cards/runs/2026-10-17/card-7.md)) |

What it cost, measured from the receipts: the scaffold's token and its mock verifier together were 2,675,097 gas, 815.53 test RBNT, about US$1.27 at that day's feed price. The six deploys above came to 3,273 test RBNT between them, and running four of them for real on the network another 1,020, so about 4,300 in all: nine faucet claims at 500 a day. The network prices gas in US dollars and converts to RBNT at the moment of the call, so the dollar column is the one that holds still. A plain transfer on 153 was 21,000 gas, 6.40 test RBNT and one US cent on 23 October 2026.

The first project to have a repository of its own is the scaffold's token: [`gatedpath/gated-token`](https://github.com/gatedpath/gated-token), the exact scaffold `npm create redbelly-dapp` gives you, taken to testnet with its deployment records, its ship report and its CI green. The other deployed projects follow it, one repository each.

One thing to be clear about. On testnet the identity gate inside every one of these contracts is a mock verifier that I deploy and seed, because testnet has no verifier for the recipes these contracts use. Card 13 is the exception, since it reads the network's own permission contract, which is real on both chains. The real path, where a person's credential is checked through Receptor, needs the Eligibility SDK, which installs with a GitHub token and runs with a verifier API key that comes from Redbelly support, not from a page you can self-serve. Until I hold one, nothing of mine passes a real credential, and every page says so where it matters. The mock refuses to deploy on mainnet at all.

## The packages

They are all on npm under the MIT licence, at version 0.2.3 since 26 October 2026.

| Package | What it is |
|---|---|
| [`create-redbelly-dapp`](packages/create-redbelly-dapp) | The scaffolder |
| [`@gatedpath/chains`](packages/chain-definitions) | Chain objects, verified addresses, read-only helpers such as `isAllowed` |
| [`@gatedpath/contract-kit`](packages/contract-kit) | A gated ERC-20 with an issuer registry, compliance transfers, split pause roles, and the Safe plus timelock pattern |
| [`@gatedpath/receptor-mock`](packages/receptor-mock) | `IRedbellyVerifier`, the `Gated` base, a five-state mock and the test base |
| [`@gatedpath/preflight`](packages/preflight) | `redbelly-preflight`, `redbelly-doctor`, `redbelly gas`, `redbelly ship` and, since 0.2.3, `redbelly fees` |
| [`@gatedpath/mcp`](packages/mcp) | A local MCP server for coding agents. It holds no key and takes none |
| [`@gatedpath/agent-rules`](packages/agent-rules) | One source rendered to every agent's rules file and a skill file, and the failure table behind `explain_failure` |
| [`@gatedpath/frontend-kit`](packages/frontend-kit) | `useEligibility` and the five states a user can be in, and since 0.2.3 a recipient check to ask before a signature |
| [`@gatedpath/ops-kit`](packages/ops-kit) | An alert poller, a system-contract watcher, Routescan scripts, a register reader, a runbook |

There is also a `recipes/` folder with eligibility recipes: over 18, Australian wholesale investor, accredited issuer and business delegate. Treat them as drafts. Wherever a recipe says `verify`, it means Redbelly's documentation does not pin that detail down yet, so please do not fill the gap with a guess.

## If you are an agent, or directing one

The rules files are one body rendered six ways, so every tool reads the same thing: the generated samples are in [`packages/agent-rules/generated-samples/`](packages/agent-rules/generated-samples), and the same body with front matter is a skill file at [`skills/redbelly/SKILL.md`](packages/agent-rules/generated-samples/skills/redbelly/SKILL.md). Save it as `.claude/skills/redbelly/SKILL.md` or `.cursor/skills/redbelly/SKILL.md` and read its "Start here" section before your first command. Since 0.2.3 every rules file opens with that section, carries a "Stop and ask" section for the moments that need a person (a mainnet deploy, whose wallet is deploying, a credential nobody has named), and lists the five failures a builder meets first with their fixes.

Those fixes come from one failure table, 51 entries at 0.2.3, that `doctor`, the MCP server's `explain_failure` and the web app's error helper all read. Two of the entries were added from what the real deploys did wrong, which is the point of running them.

If you want to know what a transaction will cost before anything is signed, `npx -y -p @gatedpath/preflight redbelly fees --chain 153` reads both chains' base fee and feed price and prints the common calls in gas, RBNT and US cents. It is read-only and takes no key. It read testnet in 3.4 seconds from the public registry on 27 October 2026.

## How I work on this

Some things that I believe in, because they are why this project is worth trusting. You bring your own agent. I do not host a model, I do not proxy your prompts, and nothing in here ever holds an API key or a private key. When something needs to sign, it asks for the name of a Foundry keystore account, and hands the job to `forge` or `cast`.

There are two speeds. Getting to testnet should be quick. Getting to mainnet goes through pre-flight and the ship report, and I will not tell you that anything holding real value can be on mainnet in an afternoon.

If it is published, it was run. The code samples on the site are pulled out of files that compile, and every "verified" mark links to the dated record of the run behind it. You will find those under [`cards/runs/`](cards/runs) and in each package's `reports/` folder.

And every fact about the network comes with where I got it and when I checked it. That list is in [`SOURCES.md`](SOURCES.md).

## Where this really stands

Everything here has been proven on a local chain or a fork, and six projects of mine have now gone further, onto testnet 153, with verified source and real transactions behind them. Nothing of mine is on mainnet, and nothing will be until the ship report and the Safe are real, which is the rule the deploy script enforces on everyone, me included. The identity gate on testnet is a mock, as the section above says. The ops kit's alert poller has been run against forks and the public APIs, and I have not yet seen a live alert fire for a contract of mine. The prompt cards have each been run with one agent, Claude Code, and the second agent the standard asks for is still pending on all of them. The contracts have had an internal audit but not an external one, so please read them as a starting point for your own review and not as audited code.

An audit on 19 September 2026 found actual faults in versions 0.1.x. Two of them were a compliance role that could mint tokens and deploy guards that a single flag could bypass. They're fixed in 0.2.0 and the old versions are marked deprecated on npm. Versions 0.2.2 and 0.2.3 followed in October from what the real deploys taught me: a deploy command that needs `--sender` beside the keystore name, a dry run whose record looked exactly like a real one, and a ship report that wrote my machine's path into a file meant for a public repository. Every older version is deprecated. If you scaffolded a project before 26 October 2026, scaffold it again.

## About this repository

This is a published copy. The daily work occurs elsewhere and the public bits are exported here by copying a fixed list of folders only, failing if it finds anything private. This is why the history is short, and why you will see comments in the code referring to planning notes and a research log that are not here: they hold correspondence and open questions, so they stay private, and what can be public from them is on this page and in [`SOURCES.md`](SOURCES.md). The project repositories under [`gatedpath`](https://github.com/gatedpath) are made the same way.

Issues are welcome. If you've found a security problem, please read [`SECURITY.md`](SECURITY.md) first.

## Licence

MIT. See [`LICENSE`](LICENSE).
