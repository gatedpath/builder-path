# Run record: adding the kit to a Foundry project that was not made by the scaffolder

Run on 21 September 2026 on macOS: `forge` 1.7.1, Node 24.20.0, the three packages at 0.2.1 from the
public npm registry. Paths are shortened to `<project>`.

**What this run is, and what it is not.** The project is the one `forge init` gives everybody: the
stock `Counter` with its test and its deploy script, `pragma solidity ^0.8.13`, no `package.json`.
Nobody shaped it to fit the kit, but it is small and we set it up ourselves. It shows the steps and
the places they stick. It is not proof against a team's real repository, and the page that uses this
record says so.

## 0. The baseline

`forge init existing-app --no-git --offline`, then `forge-std` v1.16.2 copied into `lib/` (offline, so
`forge init` could not fetch it). `forge test`: 2 passed.

## 1. Install the gate, and tell Foundry where it is

```sh
npm init -y
npm install --save-dev @gatedpath/receptor-mock@0.2.1
```

One package, no dependencies of its own. `remappings.txt` in the project:

```
forge-std/=lib/forge-std/src/
@gatedpath/receptor-mock/=node_modules/@gatedpath/receptor-mock/src/
@gatedpath/receptor-mock-test/=node_modules/@gatedpath/receptor-mock/test/
```

## 2. Gate one function

`Counter` inherits `Gated`, takes the verifier and the request id in its constructor, puts `gated`
on `increment`, and implements `_authorizeVerifierChange` with its own owner check (the project has
no OpenZeppelin, and none was added).

**First thing that stuck: the constructor changed, so everything that deploys it broke.**

```
Error (6160): Wrong argument count for function call: 0 arguments given but expected 2.
  --> script/Counter.s.sol:15:19
  --> test/Counter.t.sol:11:19
```

The deploy script now reads `VERIFIER` and `REQUEST_ID` from the environment. The test passes a
`ReceptorMock` and request id 18.

## 3. Run the project's old tests

**Second thing that stuck, and the one that matters: an old test of a gated function fails.**

```
[PASS] testFuzz_SetNumber(uint256)
[FAIL: NotEligible(0x7FA9385bE102ac3EAc297483Dd6233D62b3e1496, 18)] test_Increment()
```

The test contract is not a verified wallet, so the gate refuses it. This is the gate working. Every
existing test that calls a function you gate will do this.

## 4. Replace it with the five-state test

The test contract inherits `GatedTest`, calls `_deployMock()` in `setUp`, and the old
`test_Increment` becomes one call to `assertRevertsForAllInvalidStates`.

```
[PASS] testFuzz_SetNumber(uint256) (runs: 256)
[PASS] test_IncrementInAllFiveStates() (gas: 155424)
Suite result: ok. 2 passed; 0 failed; 0 skipped
```

## 5. One rules file for every developer's agent

```sh
npm install --save-dev @gatedpath/agent-rules@0.2.1 @gatedpath/preflight@0.2.1
npx redbelly-agent-rules --out .
```

Wrote `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/redbelly.mdc`, `.github/copilot-instructions.md`,
`GEMINI.md`, `llms.txt`, `llms-full.txt`. Then the line for CI:

```sh
npx redbelly-agent-rules --check --out .
```

Every file `ok`, exit code 0.

## 6. Doctor and pre-flight, outside a scaffold

`npx redbelly-doctor`: every required check passed; `env-tracked` and `vendor` said plainly that
this is not a git repository and not a scaffold. Two optional warnings (Slither and Aderyn are not
installed on this machine). Its closing line still suggests `npm run dev` or making a scaffold,
which does not fit a project that is not one.

`npx redbelly-preflight --chain 153` (read-only, against the public testnet RPC):

```
pass  chain-id           --chain says chain 153 and the RPC reports 153.
skip  deployer-verified  No deployer given; pass --account <keystore-name> or --address <0x…>.
skip  admin-safe         No admin given; pass --admin <0x…> ...
fail  compiler-pins      In <project>/foundry.toml (profile default), no solc_version is pinned and no evm_version is set; ...
skip  git-secrets        Not a git repository, so there is no history to scan.
skip  balance            No deployer given, so there is no balance to read.
fail  slither-report     No Slither report at reports/slither.json, ...
not ok: 2 checks failed. Do not deploy.
```

Exit code 1.

**Third thing that stuck: the stock `foundry.toml` pins nothing.** After adding
`solc_version = "0.8.30"` and `evm_version = "prague"`, the tests still passed and `compiler-pins`
read `pass`. `slither-report` still fails here because Slither is not installed on this machine;
exit code stays 1 until a report exists.

## Not run

- **A project pinned to an older compiler.** Every Solidity file in the kit says
  `pragma solidity 0.8.30;` exactly, so a project whose own files or `foundry.toml` pin another
  version cannot import it without moving to 0.8.30. That is read from the source, not measured:
  only 0.8.30 is installed on this machine, and both attempts stopped at "no solc version installed"
  before reaching the clash.
- A project that takes OpenZeppelin as a git submodule, a project with CI of its own, Hardhat.
- Any deploy, to a fork or a network. No wallet was involved.
- The contract kit (the gated ERC-20, the Safe and timelock layout). This run added the gate only.
