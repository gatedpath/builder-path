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

You need Node 22 or later and [Foundry](https://getfoundry.sh). If something is missing on your machine, `npm run doctor` will tell you exactly what. When your tests finish, the last line reads `68 tests passed, 0 failed` (that is with scaffolder 0.2.0).

So what did that just give you? A set of Foundry contracts built on a gated base, tested against every state a credential can be in: valid, expired, revoked, wrong jurisdiction, and never issued. There are fuzz and invariant tests in there too. You also get a Next.js web app that walks a user through verifying their wallet and then offers one gated action, plus rules files for Claude Code, Cursor, Codex CLI, Copilot, and Gemini CLI, so whichever agent you use starts with the same ground rules. `npm run dev` runs the whole thing locally on Anvil. Before you sign anything, there is a pre-flight to run, and the deploy script will refuse mainnet unless you have a real Safe 1.4.1, a real verifier contract, a verified deployer and a ship report dated today.

## The packages

They are all on npm under the MIT licence, at version 0.2.0.

| Package | What it is |
|---|---|
| [`create-redbelly-dapp`](packages/create-redbelly-dapp) | The scaffolder |
| [`@gatedpath/chains`](packages/chain-definitions) | Chain objects, verified addresses, read-only helpers such as `isAllowed` |
| [`@gatedpath/contract-kit`](packages/contract-kit) | A gated ERC-20 with an issuer registry, compliance transfers, split pause roles, and the Safe plus timelock pattern |
| [`@gatedpath/receptor-mock`](packages/receptor-mock) | `IRedbellyVerifier`, the `Gated` base, a five-state mock and the test base |
| [`@gatedpath/preflight`](packages/preflight) | `redbelly-preflight`, `redbelly-doctor`, `redbelly gas` and `redbelly ship` |
| [`@gatedpath/mcp`](packages/mcp) | A local MCP server for coding agents. It holds no key and takes none |
| [`@gatedpath/agent-rules`](packages/agent-rules) | One source rendered to every agent's rules file, and the failure table behind `explain_failure` |
| [`@gatedpath/frontend-kit`](packages/frontend-kit) | `useEligibility` and the five states a user can be in |
| [`@gatedpath/ops-kit`](packages/ops-kit) | An alert poller, a system-contract watcher, Routescan scripts, a runbook |

There is also a `recipes/` folder with eligibility recipes: over 18, Australian wholesale investor, accredited issuer and business delegate. Treat them as drafts. Wherever a recipe says `verify`, it means Redbelly's documentation does not pin that detail down yet, so please do not fill the gap with a guess.

## How I work on this

Some things that I believe in, because they are why this project is worth trusting. You bring your own agent. I do not host a model, I do not proxy your prompts, and nothing in here ever holds an API key or a private key. When something needs to sign, it asks for the name of a Foundry keystore account, and hands the job to `forge` or `cast`.

There are two speeds. Getting to testnet should be quick. Getting to mainnet goes through pre-flight and the ship report, and I will not tell you that anything holding real value can be on mainnet in an afternoon.

If it is published, it was run. The code samples on the site are pulled out of files that compile, and every "verified" mark links to the dated record of the run behind it. You will find those under [`cards/runs/`](cards/runs) and in each package's `reports/` folder.

And every fact about the network comes with where I got it and when I checked it. That list is in [`SOURCES.md`](SOURCES.md).

## Where this really stands

Everything here has been proven on a local chain or on a fork of testnet, and that's as far as it goes so far. I have not yet deployed any of my own to Redbelly testnet or mainnet, so a real testnet deployment, verifying my own contract on Routescan, and seeing a live alert fire are all still ahead, and the pages mark them as pending. The prompt cards have been run with one agent, Claude Code, and a second is planned. The contracts have had an internal audit but not an external one, so please read them as a starting point for your own review and not as audited code.

An audit on 19 September 2026 found actual faults in versions 0.1.x. Two of them were a compliance role that could mint tokens and deploy guards that a single flag could bypass. They're fixed in 0.2.0 and the old versions are marked deprecated on npm. If you scaffolded a project before that date, please scaffold it again.

## About this repository

This is a published copy. The daily work occurs elsewhere and the public bits are exported here by copying a fixed list of folders only, failing if it finds anything private. This is why the history is short, and why you will see comments referring to planning notes (`PLAN.md`, `RESEARCH.md`) that are not here.

Issues are welcome. If you've found a security problem, please read [`SECURITY.md`](SECURITY.md) first.

## Licence

MIT. See [`LICENSE`](LICENSE).
