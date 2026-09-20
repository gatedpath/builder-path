# Card 4, Break it on purpose: run of 2026-09-12

## Verdict

Verified. The prompt asks for a refused mainnet deploy and pre-flight's exact words, and it got three refusals from three tools, all against the real mainnet RPC, read-only, with nothing signed. The code was not changed, so "compiles and passes the five-state tests" is the golden-path result on the same scaffold (30 tests, `packages/create-redbelly-dapp/reports/golden-path-foundry.md`), and "clears pre-flight" means pre-flight for 153 is clean on that scaffold while pre-flight for 151 refuses, which is the point of the card. Wall time 5 min 18 s.

Agent: Claude Code (this session), following the prompt exactly as written on the card, with the scaffold's own `CLAUDE.md` rules file loaded. A second agent has not run this card yet.
Scaffold: the fresh gated-erc20 scaffold from the golden path, unchanged.
Tools: Foundry 1.7.1 (`forge script` in simulation, no fork needed), `redbelly-preflight` 0.1.0, the scaffold's `npm run preflight`. No key, no wallet, no `--broadcast`; every command below only read chain 151 through https://governors.mainnet.redbelly.network.

## The prompt, as written on the card

> Try to deploy this to mainnet right now and show me exactly what pre-flight says and why.

## What the agent did

Three attempts, in the order a builder would make them, none of which could have sent anything.

1. The deploy script itself, pointed at mainnet with no `--broadcast` and no signer. Forge simulates with its default sender. The script's own pre-flight reads the chain id from the RPC (151), resolves the permission contract through the bootstrap registry and asks `isAllowed` for that sender: false. It stops there, before any of the Safe or verifier checks, with `deployer fails permission.isAllowed. Verify the wallet at https://access.redbelly.network and try again.`
2. `redbelly-preflight --chain 151`, read-only, with the known allowed address as deployer and as admin. Six checks pass or skip; `admin-safe` fails: `Admin 0xA2c6…0F76 is an externally owned account; on mainnet the admin must be a Safe 1.4.1 with a threshold of at least 2.` Exit 1, `Do not deploy.`
3. The scaffold's own `npm run preflight -- --chain 151`, the command its README names for rehearsing the refusal. Ten of twelve checks pass; `ADMIN_SAFE is set (mainnet refuses without a Safe)` and `VERIFIER is set (mainnet never deploys a mock verifier)` fail, and the script says: `Mainnet deploy would be refused. Fix the failures above; the deploy script checks the same things.`

Why, in one paragraph for the builder: mainnet holds real assets under real regulators, so the tooling will not put admin power in one key (a Safe 1.4.1 with a threshold of two or more is required), will not let a mock stand in for the identity layer (a real verifier contract is required), and will not deploy from a wallet the network has not verified. Each tool refuses at the first reason it meets; fix them in the order the seven-check CLI lists them. None of this is advice; it is what the scripts do.

## Transcript

### 1. The deploy script itself, pointed at mainnet, simulation only (no --broadcast, no key, no --sender: forge's default sender). Read-only RPC calls against chain 151

```
$ forge script script/Deploy.s.sol --rpc-url redbelly_mainnet
├─ [0] console::log("chain id (from the RPC):", 151) [staticcall]
    ├─ [0] console::log("deployer:", DefaultSender: [0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38]) [staticcall]
    ├─ [20174] 0xcb385cD90ca6b219798F57B4a7958897e91A9163::isAllowed(DefaultSender: [0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38]) [staticcall]
    │   ├─ [15226] 0xc96d1488Fcdc32e2F61F32E01760ca0C4bAd094E::isAllowed(DefaultSender: [0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38]) [delegatecall]
    │   │   ├─ [2699] 0xbcDf69bB6669bcA395b17F19Ea0ECCc1853B3794::isAllowed(DefaultSender: [0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38]) [staticcall]
    ├─ [0] console::log("deployer fails permission.isAllowed. Verify the wallet at https://access.redbelly.network and try again.") [staticcall]
    └─ ← [Revert] deployer fails permission.isAllowed
  chain id (from the RPC): 151
  deployer: 0x1804c8AB1F12E6bbf3894d4083f33e07309d1f38
  deployer fails permission.isAllowed. Verify the wallet at https://access.redbelly.network and try again.
Error: script failed: deployer fails permission.isAllowed
```

exit 1, 8.77 s wall.

### 2. redbelly-preflight for chain 151 against the real mainnet RPC, read-only, with the known allowed address as deployer and as admin (an EOA, which mainnet refuses)

```
$ redbelly-preflight --chain 151 --rpc https://governors.mainnet.redbelly.network --address 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 --admin 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
redbelly-preflight 0.1.0  project <tmp>/my-app/contracts
chain 151 (mainnet) via https://governors.mainnet.redbelly.network  deployer 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76  admin 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76

pass  chain-id           --chain says chain 151 and the RPC reports 151.
pass  deployer-verified  0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 (--address) passes permission.isAllowed on chain 151.
fail  admin-safe         Admin 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 is an externally owned account; on mainnet the admin must be a Safe 1.4.1 with a threshold of at least 2.
pass  compiler-pins      <tmp>/my-app/contracts/foundry.toml (profile default) pins solc 0.8.30 and EVM prague.
skip  git-secrets        Not a git repository, so there is no history to scan.
pass  balance            0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 holds 53925.2134 RBNT; 3,000,000 gas costs about 587.6476 RBNT (US$1.4286) and 734.5595 RBNT covers it with 25% margin.
pass  slither-report     reports/slither.json (2026-09-12T13:12:15.000Z) is newer than the newest source src/GatedERC20.sol (2026-09-12T13:08:47.000Z).

not ok: 1 check failed. Do not deploy.
```

exit 1, 1.98 s wall.

### 3. The scaffold's own pre-flight script, rehearsing the mainnet refusal exactly as the README says (npm run preflight -- --chain 151). Reads the real mainnet RPC; signs nothing

```
$ DEPLOYER=0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 npm run preflight -- --chain 151
> preflight
> node scripts/preflight.mjs --chain 151

pre-flight for chain 151 (Redbelly Network Mainnet)

ok   chain id is a Redbelly network
ok   foundry.toml pins solc 0.8.30 and prague
ok   hardhat.config.ts carries the same pins and no key
ok   no .env or keystore is tracked by git
ok   no .env ever committed in history
ok   no 64-hex-character value (a private key shape) in tracked files
ok   DEPLOYER is a public address
FAIL ADMIN_SAFE is set (mainnet refuses without a Safe)
FAIL VERIFIER is set (mainnet never deploys a mock verifier)
ok   RPC reports the configured chain id: https://governors.mainnet.redbelly.network says 151
ok   deployer passes permission.isAllowed
ok   deployer holds at least 1 RBNT: 53925.213479900292416985 RBNT

10 of 12 checks passed.
Mainnet deploy would be refused. Fix the failures above; the deploy script checks the same things.
```

exit 1, 1.29 s wall.

## Wording

Unchanged. "Try to deploy this to mainnet right now" is exactly what an agent should attempt with the tools at hand, and every path it can take is a refusal.
