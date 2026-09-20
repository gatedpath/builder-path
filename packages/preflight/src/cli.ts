#!/usr/bin/env node
// redbelly-preflight: run before any deployment. Exit 0 when no check fails, 1 when one does,
// 2 on bad arguments. Never takes a key: --account names a Foundry keystore that cast reads.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CHECK_IDS, DEFAULT_GAS, VERSION, renderText, runPreflight } from './run.js';
import type { RunOptions } from './run.js';
import type { CheckId } from './types.js';

const HELP = `redbelly-preflight [options]

Checks a project before it deploys to Redbelly Network. Reads foundry.toml or
hardhat.config.*, talks JSON-RPC to one RPC and nothing else, and never sees a key.

  --project <dir>          project directory (default: current directory)
  --profile <name>         Foundry profile or Hardhat network to read
  --chain <151|153>        expected chain; defaults to the config's chain id, then CHAIN_ID in .env
  --rpc <url>              JSON-RPC endpoint; defaults to the governors RPC for --chain
  --account <name>         Foundry keystore name; address resolved with cast wallet address
  --password-file <path>   passed through to cast for that keystore (or set ETH_PASSWORD)
  --address <0x…>          deployer address for a read-only run (or DEPLOYER in .env)
  --admin <0x…>            address that will own the contracts (or ADMIN_SAFE in .env)
  --gas <units>            expected deployment gas (default ${DEFAULT_GAS.toLocaleString('en-US')})
  --slither-report <path>  report file (default: reports/slither.json or reports/slither.md)
  --skip <id,id>           skip checks: ${CHECK_IDS.join(', ')}
  --json                   print the report as JSON
  --version, --help
`;

export function parseArgs(argv: readonly string[]): RunOptions & { json: boolean; help: boolean; version: boolean } {
  const o: RunOptions & { json: boolean; help: boolean; version: boolean } = { json: false, help: false, version: false };
  const skip: CheckId[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const [flag, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    const next = (): string => {
      if (inline !== undefined) return inline;
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case '--project': o.project = next(); break;
      case '--profile': o.profile = next(); break;
      case '--chain': {
        const c = Number(next());
        if (c !== 151 && c !== 153) throw new Error('--chain must be 151 or 153');
        o.chain = c;
        break;
      }
      case '--rpc': o.rpc = next(); break;
      case '--account': o.account = next(); break;
      case '--password-file': o.passwordFile = next(); break;
      case '--address': o.address = next(); break;
      case '--admin': o.admin = next(); break;
      case '--gas': {
        const g = next().replace(/[_,]/g, '');
        if (!/^\d+$/.test(g)) throw new Error('--gas must be a whole number of gas units');
        o.gas = BigInt(g);
        break;
      }
      case '--slither-report': o.slitherReport = next(); break;
      case '--skip':
        for (const id of next().split(',').map((s) => s.trim()).filter(Boolean)) {
          if (!CHECK_IDS.includes(id as CheckId)) throw new Error(`unknown check "${id}"; known: ${CHECK_IDS.join(', ')}`);
          skip.push(id as CheckId);
        }
        break;
      case '--json': o.json = true; break;
      case '--help': case '-h': o.help = true; break;
      case '--version': o.version = true; break;
      default:
        if (/^(0x)?[0-9a-fA-F]{64}$/.test(a)) throw new Error('that argument looks like a private key; pre-flight never takes one, use --account <keystore-name>');
        throw new Error(`unknown argument "${a}"\n\n${HELP}`);
    }
  }
  if (skip.length) o.skip = skip;
  return o;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let args: ReturnType<typeof parseArgs>;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  const { json, help: _h, version: _v, ...opts } = args;
  const report = await runPreflight(opts);
  process.stdout.write(json ? JSON.stringify(report, null, 2) + '\n' : renderText(report));
  return report.ok ? 0 : 1;
}

/** True when this file is the process entry point (a bin symlink resolves to it), not an import. */
const isEntry = Boolean(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1]!)).href === import.meta.url;
if (isEntry) main().then((code) => { process.exitCode = code; }, (e) => { process.stderr.write(`${(e as Error).stack ?? e}\n`); process.exitCode = 2; });
