# Card 4, Break it on purpose, done by hand: run of 2026-09-17

## Verdict

Verified by hand, with no agent: the same three refusals the agent's run of 12 September got, from
the same three tools, against the real mainnet RPC, read-only. No signer, no `--broadcast`, no
wallet; the only address used is a public one that RESEARCH.md records as passing `isAllowed`.
Nothing was changed in the project. Machine: the owner's Mac, Foundry 1.7.1.

| # | Command, from the project folder | What it said |
|---|---|---|
| 1 | `cd contracts && forge script script/Deploy.s.sol --rpc-url redbelly_mainnet` | `chain id (from the RPC): 151`, `deployer: 0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38` (Foundry's default sender), `Error: script failed: deployer fails permission.isAllowed` |
| 2 | `node vendor/redbelly-preflight/dist/cli.js --project contracts --chain 151 --rpc https://governors.mainnet.redbelly.network --address 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 --admin 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76` | 5 pass, 2 fail. `fail admin-safe Admin 0xA2c6… is an externally owned account; on mainnet the admin must be a Safe 1.4.1 with a threshold of at least 2.` and `fail slither-report No Slither report at reports/slither.json, …`. Ends `not ok: 2 checks failed. Do not deploy.` |
| 3 | `npm run preflight -- --chain 151` | `6 of 9 checks passed`; fails `DEPLOYER is a public address`, `ADMIN_SAFE is set (mainnet refuses without a Safe)`, `VERIFIER is set (mainnet never deploys a mock verifier)`; ends `Mainnet deploy would be refused.` |

Differences from the agent's run of 12 September, all explained: tool 2 then failed one check and
today fails two, because Slither is not installed on this Mac and so there is no report to be fresh
(that run had Slither 0.11.6); its `git-secrets` check then skipped for want of a repository and
today passes over 4 commits; tool 3 then reported ten of twelve and today six of nine, because the
scaffold's pre-flight script has been reorganised since and this project has no `DEPLOYER` set. The
balance line priced 3,000,000 gas at US$1.4286 in both runs, which is the dollar-priced gas model
doing what it says.
