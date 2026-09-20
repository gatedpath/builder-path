# Hardhat build

The rules files in `packages/agent-rules/` must not assume Foundry, so this folder proves the same
five contracts compile under Hardhat with the same pins: solc 0.8.30, EVM `prague`, optimizer on at
200 runs. Hardhat 2.29.1 is the `hh2` line on npm, the same major as the Hardhat material on Vine
and Redbelly's archived verifier example.

`hardhat.config.js` sets `paths.root` to the package root, so it compiles `../src` in place and
resolves OpenZeppelin from the package's `node_modules`. Only `cache/` and `artifacts/` land here,
and both are ignored by git.

```
npm run setup            # once, at the package root
npm run hardhat:compile  # or: cd hardhat && npx hardhat compile
```

Last run 2026-09-12: `Compiled 5 Solidity files successfully (evm target: prague)` with
`solc 0.8.30+commit.73712a01`. The network entries carry no accounts on purpose; signing is a
Foundry keystore or hardware wallet on the builder's machine, never a key in a config file.
