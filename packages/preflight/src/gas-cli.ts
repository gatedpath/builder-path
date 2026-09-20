// `redbelly gas`: the gas report in RBNT and US cents. Exit 0 when priced, 1 when the source could
// not be read or the RPC did not answer, 2 on bad arguments. --json for agents.
import { GAS_VERSION, gasReportJson, renderGasText, runGas } from './gas.js';
import type { GasOptions } from './gas.js';

export const GAS_HELP = `redbelly gas [options]

Prices a gas snapshot or a forge gas report at the chain's latest base fee and on-chain feed
price, one row per test or function, in RBNT and US cents. Reads .gas-snapshot when the project
has one, else runs forge test --gas-report --json. Read-only: two RPC reads, no key.

  --project <dir>      Foundry project or scaffold root (default: current directory)
  --chain <151|153>    chain to price on (default 153); the RPC must report it
  --rpc <url>          JSON-RPC endpoint (default: the governors RPC for --chain; a fork works)
  --snapshot <file>    price this .gas-snapshot or gas-report JSON instead of the project's
  --report             run forge test --gas-report --json even when .gas-snapshot exists
  --diff <file>        a previous .gas-snapshot or gas-report JSON to compare against
  --json               print the report as JSON
  --version, --help
`;

export function parseGasArgs(argv: readonly string[]): GasOptions & { json: boolean; help: boolean; version: boolean } {
  const o: GasOptions & { json: boolean; help: boolean; version: boolean } = { json: false, help: false, version: false };
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
      case '--chain': {
        const c = Number(next());
        if (c !== 151 && c !== 153) throw new Error('--chain must be 151 or 153');
        o.chain = c;
        break;
      }
      case '--rpc': o.rpc = next(); break;
      case '--snapshot': o.snapshot = next(); break;
      case '--report': o.report = true; break;
      case '--diff': o.diff = next(); break;
      case '--json': o.json = true; break;
      case '--help': case '-h': o.help = true; break;
      case '--version': o.version = true; break;
      default:
        if (/^(0x)?[0-9a-fA-F]{64}$/.test(a)) throw new Error('that argument looks like a private key; redbelly gas reads the chain and never takes one');
        throw new Error(`unknown argument "${a}"\n\n${GAS_HELP}`);
    }
  }
  return o;
}

export async function gasMain(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let args: ReturnType<typeof parseGasArgs>;
  try {
    args = parseGasArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(GAS_HELP);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${GAS_VERSION}\n`);
    return 0;
  }
  const { json, help: _h, version: _v, ...opts } = args;
  try {
    const report = await runGas(opts);
    process.stdout.write(json ? gasReportJson(report) : renderGasText(report));
    return 0;
  } catch (e) {
    process.stderr.write(`redbelly gas: ${(e as Error).message}\n`);
    return 1;
  }
}
