# @gatedpath/preflight

```
For agents
- Run `redbelly-preflight --project . --chain 153 --account <keystore-name> --admin <safe>` before
  any deploy and read every line. Exit 1 means do not deploy; fix the failing line, run it again.
- It never takes a key. --account names a Foundry keystore that cast reads; --address is for a
  read-only run. If you are tempted to pass a hex string, stop.
- Mainnet (151) refuses an EOA admin and a Safe with threshold below 2. Testnet warns instead.
- `--json` for CI and for the MCP server. Pins: solc 0.8.30, EVM prague (verified 2026-09-12).
```

Seven checks, each printed as `pass`, `fail`, `warn` or `skip` with one sentence saying why,
then a non-zero exit if anything failed. The package also carries `redbelly-doctor` (the machine
before the first command) and the `redbelly` bin whose subcommands are `preflight`, `doctor`, `gas`
(gas per function in RBNT and US cents) and `ship` (the mainnet gate that writes its own report);
each has a section below. This is the gate PLAN.md sections 5.4 and 6 (Deploy)
describe, corrected by section 15: there is no network-wide verifier address to match, so the
deployer's `permission.isAllowed` reading replaces it. Node 18 or newer, TypeScript, one
runtime dependency (`@gatedpath/chains`, by path). Network traffic is JSON-RPC to the
one RPC you name and nothing else.

## The checks

| id | What passes | What fails |
|---|---|---|
| `chain-id` | The chain in `foundry.toml` (`chain_id`), the Hardhat network's `chainId`, or `--chain` equals the RPC's `eth_chainId` | A mismatch, an RPC that is neither 151 nor 153, or an RPC that does not answer. Skips when nothing states an expected chain. |
| `deployer-verified` | The deployer passes `permission.isAllowed` on the target chain, read through the bootstrap registry | `isAllowed` is false: the wallet has not been through access.redbelly.network. Warns, whatever `isAllowed` says, when the deployer is one of the ten anvil/Hardhat default accounts, whose keys are public and two of which pass `isAllowed` on both networks (RESEARCH.md question 30) |
| `admin-safe` | `--admin` holds a SafeProxy whose slot 0 is the canonical Safe 1.4.1 singleton or SafeL2 singleton, that singleton's code hashes to the 1.4.1 release, and `getThreshold()` is 2 or more | On 151 an EOA, a non-Safe contract, foreign singleton code or threshold 1 fails; on 153 each of those is a warning |
| `compiler-pins` | `solc_version` (or `solc`) is 0.8.30 and `evm_version` is prague; Hardhat `solidity.version` and `settings.evmVersion` likewise | Anything else, or no config file |
| `git-secrets` | No added line anywhere in `git log -p --all` is secret-shaped, and no `.env` is tracked | A bare 64-hex value, a 0x 64-hex value on a line about a key, `PRIVATE_KEY=` with a real value, twelve consecutive BIP-39 words, or a keystore JSON. Skips outside git. |
| `balance` | Deployer balance covers `--gas` times the latest base fee, priced through the on-chain feed by `gasCostUsd`, plus 25 percent | Short, with the RBNT and USD figures and where to get testnet coins |
| `slither-report` | `reports/slither.json` or `reports/slither.md` (or `--slither-report`) exists and describes the sources as they are: when a `slither.sources.sha256` sidecar sits beside it, the SHA-256 of every `.sol` under the source directory must equal it; without a sidecar, the report must be newer than every source | Missing, a sidecar that no longer matches, or (with no sidecar) older than a source |

"Newer" inside a git repository means the commit time of the file's last change, or the
working-tree mtime for a modified or untracked file; a checkout gives every file the same
mtime, so mtimes alone would say nothing. Outside git, mtimes. The time rule has a hole,
found on 2026-09-12 while running the prompt cards: a clean project's report has no findings,
so re-running Slither writes byte-identical JSON, git records no change, and the report can
never become "newer" than a source that was edited after it. Hence the sidecar: the scaffold's
`npm run lint:slither` writes `reports/slither.sources.sha256` (SHA-256 over every `.sol`
under `src/`, sorted by POSIX path, each as `path`, newline, bytes, NUL), and when the sidecar
exists the check compares hashes and ignores times. `hashSources(dir)` is exported for tools
that write the sidecar.

The secrets check streams `git log -p --all --unified=0` and looks only at added lines, so a
key that was committed and later deleted still fails: it is in the history and history is
what gets cloned. Findings name the file, the commit and the kind of match, never the text.
Lockfiles, `lib/`, `out/`, `node_modules/` and minified files are skipped; lines that mention
sha256, keccak, integrity, a tx hash or a JSON `"id"` are treated as hashes.

## redbelly-doctor

The machine before the first command (PLAN.md 18.3). `redbelly-doctor` (also `redbelly doctor`,
`npm run doctor` in a scaffold, and the MCP server's `doctor` tool) prints one line per check with
`pass`, `warn` or `fail` and the fix on the same line, and exits 0 only when every required check
passes; `--json` for agents. The fix text is the failure table's (`@gatedpath/agent-rules`), so
`explain_failure` says the same thing about a pasted doctor line.

| id | required | What it checks |
|---|---|---|
| `node` | yes | Node 22 or later |
| `git` | yes | git on PATH |
| `forge`, `anvil`, `cast` | yes | each on PATH and answering `--version` |
| `foundry-version` | yes | the three report one version |
| `foundry-exit-code` | yes | each hands its exit code back. The `@foundry-rs` npm packages (1.7.1) install a Node shim that exits 0 whatever the binary returned, so a failed `forge build` reports success; doctor probes with a flag no binary knows (the real ones exit 2, the shim 0), names the shim, and prints the `ln -sf` line to the real binary it found in the platform package beside it |
| `slither`, `aderyn` | no | on PATH; a warning when missing or not at the version CI pins (0.11.6, 0.6.8) |
| `env-tracked` | yes | no `.env` or `.env.*` (other than `.env.example`) in `git ls-files` |
| `vendor` | yes | in a scaffold, each `vendor/redbelly-*/package.json` version equals the record the scaffolder wrote under `redbelly.vendor` in the root `package.json`; a scaffold without the record warns |

```
redbelly-doctor [--project <dir>] [--json]
```

## redbelly gas

A gas report in the unit the chain charges in (PLAN.md 18.3). `redbelly gas` (also `npm run gas` in a
scaffold and the MCP server's `gas_report` tool) reads `.gas-snapshot` when the project has one (one
row per test; fuzz lines by their mean) or runs `forge test --gas-report --json` (the deployment and
every function of the contracts in `gas_reports`), prices each row at the latest base fee and the
on-chain feed price with the same integer arithmetic as `gasCostUsd`, and prints gas, RBNT and US
cents per row. `--diff <file>` compares against a previous snapshot or report, either format, and
adds the gas and cents difference and what was added or gone. Two RPC reads, nothing else.

```
redbelly gas [--project <dir>] [--chain 151|153] [--rpc <url>] [--snapshot <file>] [--report] [--diff <file>] [--json]
```

Recorded runs against the real feeds, read-only, on 14 September 2026: `reports/gas-153-2026-09-14.md`
and `reports/gas-151-2026-09-14.md`. On both, 21,000 gas came to 1.000 US cents and the scaffold's
`GatedERC20` deploys for 1,898,391 gas, 383.7 RBNT, 90.4 cents at a feed price of US$0.002356 per RBNT.

## redbelly ship

The mainnet gate that produces the document you wanted anyway (PLAN.md 18.3). `redbelly ship --chain
<151|153> --account <keystore-name> [--admin <safe>] [--gas <n>]` (also `npm run ship` in a scaffold
and the MCP server's `ship_report` tool) runs the gas report first (its deployment row is the gas the
balance check prices), then pre-flight's seven checks with the keystore's address, checks the verifier
(`--verifier` or `VERIFIER` in `.env`; required on 151, where a missing one fails and on 153 warns that
a `ReceptorMock` will be deployed), runs `forge test --json` and counts the suites that inherit
`GatedTest`, reads the admin (Safe version, singleton, threshold, owners, `isAllowed`) and writes
`deployments/ship-<chain>-<date>.md`: a header line `status` reads back, every check with its result,
the deployer and admin readings, the contracts from `deployments/<chain>-*.json` with their
constructor arguments and the exact `forge verify-contract` command, the gas table, the tests, the
Slither line, the compiler pins, and the list of what the report does not prove. It refuses to write
when any check fails and exits 1 with the failing lines. Run it again after the deploy to fill in the
contract section; the file is dated in UTC.

The scaffold's `RedbellyDeployScript.sol` refuses to broadcast on 151 without `deployments/ship-151-<today>.md`
(a dry run says so and continues; 153 warns), and the Hardhat deploy script does the same. Tested on
a local chain 151 with the mocked registry, the real Safe 1.4.1 bytecode and a keystore `cast wallet
new` created for the test; nothing signs against a real network.

## Usage

```
redbelly-preflight [--project <dir>] [--profile <name>] [--chain 151|153] [--rpc <url>]
                   [--account <keystore-name> [--password-file <path>] | --address <0x…>]
                   [--admin <0x…>] [--gas <units>] [--slither-report <path>]
                   [--skip <id,id>] [--json]
```

`--account` runs `cast wallet address --account <name>` in the project directory; cast
decrypts the keystore, this process sees the address. Foundry looks for the keystore under
`$HOME/.foundry/keystores`. Without a terminal, give cast the password with
`--password-file` or `ETH_PASSWORD`. `--address` does the same checks read-only.

Flags you leave out are filled from the project's `.env` (parsed, never executed) or the
environment, using the names the scaffolder's templates already use: `DEPLOYER` for
`--address`, `ADMIN_SAFE` for `--admin`, `CHAIN_ID` for `--chain` when the config names no
chain. So inside a `create-redbelly-dapp` project the whole call is `redbelly-preflight`.
`--gas` defaults to 3,000,000; pass what `forge script` estimated. With `--json` the whole
report (below) goes to stdout.

This is the same set of checks the scaffolder's `RedbellyDeployScript.preflight()` makes in
Solidity at broadcast time and its `scripts/preflight.mjs` makes offline, generalised so any
Foundry or Hardhat project can run them, with the history scan, the compiler pins, the
balance margin and the Slither freshness added.

Exit codes: 0 no check failed (warnings allowed), 1 at least one fail, 2 bad arguments. An
argument that looks like a private key is a bad argument.

```ts
import { runPreflight, renderText } from '@gatedpath/preflight';
const report = await runPreflight({ project: '.', chain: 153, address: '0x…', admin: '0x…', gas: 1_200_000 });
process.stdout.write(renderText(report));
if (!report.ok) process.exit(1);
```

The report: `{ tool, version, generatedAt, project, config: { kind, file, profile }, chain:
{ expected, reported, rpc, network }, deployer, admin, checks: [{ id, status, reason, data }],
ok }`. `data` carries the numbers (threshold, balances, feed price, findings); it never
carries a secret.

## Tests

`npm test` builds, then runs `test/unit.test.mjs` (TOML and Hardhat readers, the secret
scanner, the Safe fixture hashes) and `test/preflight.test.mjs`, which spawns `anvil`
twice, on chain 151 and on 153, and:

- etches hand-assembled bytecode for the bootstrap registry, the permission contract and the
  price feed at the addresses `@gatedpath/chains` records (`test/mocks.mjs`), so the
  real helpers run their real code paths;
- etches the genuine Safe 1.4.1 runtime code, read from testnet with `eth_getCode` on
  2026-09-12 and byte-identical on mainnet (`test/fixtures/safe-1.4.1/`), at the canonical
  addresses, and deploys proxies through the real `SafeProxyFactory.createProxyWithNonce`
  from an unlocked anvil account, so `getThreshold()` and the singleton reads are answered by
  Safe's own logic. Etching, not compiling: no Solidity toolchain in the test and the bytes
  are the ones on chain;
- builds temporary git repositories with pinned commit dates for the secrets and Slither
  checks;
- creates a throwaway keystore with `cast wallet new` for the `--account` path (the key is
  generated inside cast, encrypted at once and never printed);
- checks the hardcoded list of anvil default accounts against the spawned anvil's `eth_accounts`.

29 tests. `npm run test:live` runs the read-only checks against the real testnet RPC using
the known allowed address from `@gatedpath/chains` as both deployer and admin.

## Last verified

2026-09-12. `npm test`: 29 passed (8 unit, 21 against anvil on 151 and 153). `npm run
test:live`: 1 passed. The live run's output is committed under `reports/` as
`testnet-153-2026-09-12.txt` and `.json`: chain, deployer, compiler, secrets, balance and
Slither pass; the admin warns because the known allowed address is an EOA, which is exactly
what the check is for. 1,000,000 gas cost 195.96 RBNT, US$0.4762 at the feed's US$0.002431,
which is the fixed-USD gas model in one line.

Anvil's base fee is not Redbelly's, so the balance figures in the anvil tests only prove
the arithmetic and the margin; the live run proves the price.
