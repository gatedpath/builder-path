# hardhat/

The Hardhat 3 view of `../contracts`. `src/` and `lib/` are links to `../contracts/src` and
`../contracts/lib`, so there is one set of Solidity files and one set of pins: solc 0.8.30,
EVM Prague, optimizer 200 runs, the same as `foundry.toml`. OpenZeppelin 5.6.1 comes from npm on
both sides; forge-std and receptor-mock come through the `lib/` link, with matching remappings.

```
__PM_INSTALL__            # installs hardhat 3.16.0 and the viem toolbox
__PM_RUN__ compile        # same artifacts as forge build, under artifacts/
__PM_RUN__ keystore:set   # stores REDBELLY_DEPLOYER_KEY in Hardhat's encrypted keystore, once
__PM_RUN__ deploy:testnet # runs scripts/deploy.ts against chain 153
```

The config holds no key. `configVariable("REDBELLY_DEPLOYER_KEY")` resolves from the
`hardhat-keystore` plugin, which prompts for the keystore password. Hardhat would also
accept an environment variable of that name; don't use one, the shell keeps history. For a
hardware wallet, switch the network's `accounts` to `"remote"` and point `url` at a local
signer that serves `eth_accounts` and `eth_sendTransaction`.

If the links are missing (a checkout on a filesystem without symlinks), recreate them:

```
ln -s ../contracts/src src && ln -s ../contracts/lib lib      # macOS, Linux
mklink /J src ..\contracts\src && mklink /J lib ..\contracts\lib   # Windows, cmd
```

The Foundry tests (`../contracts/test`) are the test suite; `forge test` runs them. Hardhat's
Solidity test runner is configured but there are no Hardhat-only tests.
