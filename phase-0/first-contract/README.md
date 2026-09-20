# First contract — walk the deploy path by hand

Purpose: prove, with a verified wallet, that a plain deploy works on testnet, how long
it takes, what it costs, and whether Routescan verification works. This is Phase 0
step 4. Record every answer in `../../RESEARCH.md`.

Prerequisites: Foundry installed, a verified wallet imported as a keystore account
(`cast wallet import rbn-dev --interactive`), testnet RBNT on it.

```
cd "phase-0/first-contract"
export RBN_TESTNET_RPC=https://governors.testnet.redbelly.network
forge build

# deploy, timed
time forge create src/Hello.sol:Hello \
  --rpc-url redbelly_testnet --account rbn-dev \
  --constructor-args "gm redbelly"

# interact
cast call <address> "greeting()(string)" --rpc-url redbelly_testnet
cast send <address> "set(string)" "second write" --rpc-url redbelly_testnet --account rbn-dev

# verify on Routescan (confirm the URL in foundry.toml first)
forge verify-contract <address> src/Hello.sol:Hello \
  --chain 153 --verifier-url https://api.routescan.io/v2/network/testnet/evm/153/etherscan \
  --etherscan-api-key verifyContract --constructor-args $(cast abi-encode "constructor(string)" "gm redbelly")
```

Things to write down: deploy wall-clock time, gas used and effective gas price for the
deploy and the write (convert to RBNT and USD), whether verification succeeded and with
which URL, and anything the RPC or explorer did that surprised you. Then try the same
deploy from a wallet that is NOT verified and record exactly what error comes back;
that error message goes on page one of the site.
