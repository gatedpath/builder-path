# Fork run: gated-erc20 scaffold against a testnet fork

Date: 2026-09-12T12:13:50.822Z
Fork source: https://governors.testnet.redbelly.network (chain 153)
Scaffolder: create-redbelly-dapp 0.1.0
Foundry: forge Version: 1.7.1

Every transaction below landed on the local anvil. Nothing was sent to the real network; the fork only read its state.

### anvil fork

```
$ anvil --fork-url https://governors.testnet.redbelly.network --port 44225
chain id 153, forked at block 3034370
```

### scaffold

```
$ node bin/index.js fork-app --yes --no-web
writing project files
  vendoring @redbelly-builder/chains and @redbelly-builder/agent-rules
  copying receptor-mock into contracts/lib
  generating contracts/script/Redbelly.sol from @redbelly-builder/chains
  writing rules files (CLAUDE.md, AGENTS.md, .cursor/rules/redbelly.mdc, .github/copilot-instructions.md, GEMINI.md)

Scaffolded gated-erc20 into <tmp>/fork-app (36 files).

Next steps
  cd <tmp>/fork-app
  npm install                 installs the web app and tooling
  npm run contracts:install   forge install of forge-std and OpenZeppelin at the pinned tags
  npm run test                forge build and forge test (unit, fuzz, invariant) in all five credential states
  npm run preflight           the checks the deploy script makes, run offline first

Read README.md for the golden path. Nothing in this project reads a private key; deploys use
`forge script --account <keystore-name>` or a hardware wallet. Mainnet (151) refuses to deploy
unless ADMIN_SAFE is a Safe 1.4.1 with a threshold of two or more and the deployer passes isAllowed.
The hardhat/ folder compiles the same sources with the same pins; see README.md for its commands.
```

### forge install

```
$ npm run contracts:install
Installed forge-std v1.16.2
```

### forge build

```
$ forge build
Compiling 44 files with Solc 0.8.30
Solc 0.8.30 finished in 2.27s
Compiler run successful!
```

### forge test

```
$ forge test --summary
Ran 9 tests for test/DeployPreflight.t.sol:DeployPreflightTest
Suite result: ok. 9 passed; 0 failed; 0 skipped; finished in 1.55ms (919.63µs CPU time)
Ran 14 tests for test/GatedERC20.t.sol:GatedERC20Test
Suite result: ok. 14 passed; 0 failed; 0 skipped; finished in 3.30ms (2.35ms CPU time)
Ran 3 tests for test/GatedERC20.fuzz.t.sol:GatedERC20FuzzTest
Suite result: ok. 3 passed; 0 failed; 0 skipped; finished in 136.99ms (262.30ms CPU time)
Ran 4 tests for test/GatedERC20.invariants.t.sol:GatedERC20Invariants
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
╭----------+---------------+-------+---------+----------╮
╰----------+---------------+-------+---------+----------╯
Suite result: ok. 4 passed; 0 failed; 0 skipped; finished in 628.63ms (1.61s CPU time)
╭----------------------+--------+--------+---------╮
╰----------------------+--------+--------+---------╯
```

### registry on the fork

```
$ cast call 0xDAFEA492D9c6733ae3d56b7Ed1ADB60692c98Bc5 "getContractAddress(string)(address)" permission
0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690
(expected 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690 from @redbelly-builder/chains)
```

### choosing an unverified sender

```
$ cast call 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690 "isAllowed(address)(bool)" <anvil accounts>
0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266: isAllowed true
0x70997970c51812dc3a010c7d01b50e0d17dc79c8: isAllowed true
0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc: isAllowed false
```

### deploy with an unverified sender (refused)

```
$ forge script script/Deploy.s.sol --rpc-url anvil --sender 0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc --unlocked --broadcast
├─ [0] console::log("chain id (from the RPC):", 153) [staticcall]
    ├─ [0] console::log("deployer:", 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC) [staticcall]
    ├─ [20174] 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690::isAllowed(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC) [staticcall]
    │   ├─ [15226] 0x7F31637245B89041173f7FE983705581c8F43685::isAllowed(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC) [delegatecall]
    │   │   ├─ [2699] 0x0E153C090f83e5D8672A47Ec70BC5384778BbDd8::isAllowed(0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC) [staticcall]
    ├─ [0] console::log("deployer fails permission.isAllowed. Verify the wallet at https://access.redbelly.network and try again.") [staticcall]
    └─ ← [Revert] deployer fails permission.isAllowed
  chain id (from the RPC): 153
  deployer: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  deployer fails permission.isAllowed. Verify the wallet at https://access.redbelly.network and try again.
Error: script failed: deployer fails permission.isAllowed
```

Refused, as expected: the real permission contract says this sender has never been verified at access.redbelly.network.

### impersonate a verified wallet

```
$ cast rpc anvil_impersonateAccount 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
cast call 0x519ba1b48D571FD92FAF6FE4D20fe74Ca435B690 "isAllowed(address)(bool)" 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
isAllowed: true
```

### deploy with the impersonated verified wallet (accepted)

```
$ forge script script/Deploy.s.sol --rpc-url anvil --sender 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 --unlocked --broadcast
token: contract GatedERC20 0xA26cdf5a504D9f7A7CdF4F7FeC33e851c0F79aED
  chain id (from the RPC): 153
  deployer: 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
  permission.isAllowed(deployer): true
  ADMIN_SAFE not set: the deployer holds the admin roles. Fine on testnet, refused on mainnet.
  admin: 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
  VERIFIER not set: DEPLOYING RECEPTOR MOCK. Every wallet starts ineligible; setStatus() decides. Not for mainnet.
  GatedERC20: 0xA26cdf5a504D9f7A7CdF4F7FeC33e851c0F79aED
  verifier: 0xCF1049b42750102F6BA28c4d5D48649877Bd55A8
Estimated gas price: 391765.097647451 gwei
Estimated total gas used for script: 2668340
Estimated amount required: 1045.36248065659940134 RBNT
ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
```

Deployed on the fork: GatedERC20 at 0xA26cdf5a504D9f7A7CdF4F7FeC33e851c0F79aED, ReceptorMock verifier at 0xCF1049b42750102F6BA28c4d5D48649877Bd55A8.

### the gate on the fork

```
$ cast send 0xA26cdf5a504D9f7A7CdF4F7FeC33e851c0F79aED "subscribe()"            # status NeverIssued
cast send 0xCF1049b42750102F6BA28c4d5D48649877Bd55A8 "setStatus(address,uint64,uint8)" 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76 1 1   # Valid
cast send 0xA26cdf5a504D9f7A7CdF4F7FeC33e851c0F79aED "subscribe()"            # status Valid
cast call 0xA26cdf5a504D9f7A7CdF4F7FeC33e851c0F79aED "balanceOf(address)(uint256)" 0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76
first subscribe: reverted (NotEligible(0xA2c6a3fC1E12dF79B9e3D099FaA2Ffe860450F76, 1))
setStatus: ok
second subscribe: succeeded
balance: 100000000000000000000 [1e20]
```

### fees

```
$ cast gas-price --rpc-url anvil
87913169095578 wei on the fork; the real feed says US$0.00243 per RBNT. Fee figures on a fork mean nothing; assert gas used, never a fee.
```

Finished 2026-09-12T12:14:03.917Z (13 s).
