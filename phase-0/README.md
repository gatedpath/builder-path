# Phase 0 — verification scripts

Read-only checks that turn the plan's **verify** marks into measured facts. No
dependencies beyond Node 18+. Nothing here signs anything or needs a key.

These cannot run from a Claude Code on the web session unless the environment's
network policy allows Redbelly's hosts (see `../setup/egress-allowlist.txt`). They run
fine from a desktop terminal or a local Claude Code session.

```
cd "phase-0"
node chain-check.mjs testnet        # chain ID, client, fee model, RPC method support
node chain-check.mjs mainnet
node probe-opcodes.mjs testnet      # execution fork (PUSH0? Cancun?) and precompiles
node probe-opcodes.mjs mainnet
node measure-blocktime.mjs testnet 30    # 30 minutes; run once for 1440 (24 h)
```

Results land in `results/` as dated JSON. Copy the conclusions into `../RESEARCH.md`
against the matching open question, with the date and the file name.

Override RPC URLs with `RBN_TESTNET_RPC` / `RBN_MAINNET_RPC` if the defaults change.

## What each answers

| Script | Open questions in PLAN.md section 9 |
|---|---|
| `chain-check.mjs` | 3 (gas limits), 6 (gas pricing as seen from RPC), 11 (RPC behaviour), plus which tracing methods indexers can use |
| `probe-opcodes.mjs` | 1 (EVM fork, PUSH0, transient storage), 2 (precompiles) |
| `measure-blocktime.mjs` | 4 (block interval only) |
| `measure-latency.sh` | 4 (inclusion latency as a user feels it; needs a verified, funded keystore wallet) |
| `first-contract/` | 7 (does a verified wallet suffice to deploy), deploy cost, Routescan verification, and the error an unverified wallet gets |

## Order of work, and why

Run the read-only scripts first. They need no wallet, touch no identity, and answer
questions 1 to 4 and 6. The wallet steps below come last, and none has been run yet. A
wallet that can write on Redbelly is tied to a verified identity, so nothing here signs
until the read-only work is done. Where a business can be verified, a development wallet
belongs under the business, as a delegate, and not under a person.

## With a verified wallet (after the questions above are answered)

Wallet hygiene first. A verified wallet is an identity that carries to mainnet. Never
paste its private key into a chat, an `.env`, or a command line. Import it once into a
Foundry keystore and sign by account name from then on:

```
cast wallet import rbn-dev --interactive     # prompts for key and a password, stores encrypted
cast wallet address --account rbn-dev
```

Use a dedicated development wallet for all of this and keep your main one out of scripts
entirely. Create it on a hardware wallet with a fresh account index if you have one
(register via MetaMask connected to the device; run Foundry with `--ledger`). Otherwise
create it under a new seed phrase in a separate browser profile, register it, then import
the key once into a Foundry keystore. Never derive it from the seed your main wallet
uses. Before registering, check RESEARCH.md questions 19 to 22: how many wallet slots
you have, whether a wallet can be unlinked, and what the terms say. Testnet only in
Phase 0; never send mainnet RBNT to the dev wallet.

Then, in order:

1. Faucet RBNT to the wallet at https://redbelly.faucetme.pro/ (Discord login). Record the amount and cooldown; neither is published.
2. `./measure-latency.sh rbn-dev 10` — ten timed self-transfers.
3. `first-contract/` — deploy, interact, verify on Routescan, per its README.
4. Repeat the deploy from an unverified wallet and record the exact error.
5. Copy every result into `../RESEARCH.md` against its question, with the date.
