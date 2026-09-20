// `redbelly ship`: the mainnet gate that writes its own report. Exit 0 when every check passed and
// deployments/ship-<chain>-<date>.md was written, 1 when a check failed (nothing written), 2 on bad
// arguments. --json for agents. Never takes a key: --account names a keystore that cast reads.
import { SHIP_VERSION, renderShipText, runShip, shipReportJson, ShipUsageError } from './ship.js';
import type { ShipOptions } from './ship.js';

export const SHIP_HELP = `redbelly ship --chain <151|153> --account <keystore-name> [options]

Runs pre-flight (seven checks) with the keystore's address, checks the Slither sidecar, runs
forge test and the five-state suites, prices the gas report at the chain's base fee and feed
price, reads the deployer and the admin (isAllowed, Safe 1.4.1, threshold, owners), and writes
deployments/ship-<chain>-<date>.md with every check and its result, the addresses, the
constructor arguments and the verify command. Refuses to write when any check fails. The
deploy script refuses to broadcast on 151 without a report dated today; 153 warns.

  --chain <151|153>        required
  --account <name>         required; Foundry keystore name, resolved with cast wallet address
  --password-file <path>   passed through to cast (or set ETH_PASSWORD)
  --admin <0x…>            the Safe that receives every role (or ADMIN_SAFE in .env); required on 151
  --gas <units>            deployment gas for the balance check (default: the gas report's deployment row)
  --verifier <0x…>         the dApp's verifier (or VERIFIER in .env); required on 151
  --project <dir>          Foundry project or scaffold root (default: current directory)
  --rpc <url>              JSON-RPC endpoint (default: the governors RPC for --chain; a fork works)
  --out <path>             write the report here instead
  --json                   print the report as JSON (the file is still written when checks pass)
  --version, --help
`;

export function parseShipArgs(argv: readonly string[]): (Partial<ShipOptions> & { json: boolean; help: boolean; version: boolean }) {
  const o: Partial<ShipOptions> & { json: boolean; help: boolean; version: boolean } = { json: false, help: false, version: false };
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
      case '--account': o.account = next(); break;
      case '--password-file': o.passwordFile = next(); break;
      case '--admin': o.admin = next(); break;
      case '--verifier': o.verifier = next(); break;
      case '--rpc': o.rpc = next(); break;
      case '--out': o.out = next(); break;
      case '--gas': {
        const g = next().replace(/[_,]/g, '');
        if (!/^\d+$/.test(g)) throw new Error('--gas must be a whole number of gas units');
        o.gas = BigInt(g);
        break;
      }
      case '--json': o.json = true; break;
      case '--help': case '-h': o.help = true; break;
      case '--version': o.version = true; break;
      default:
        if (/^(0x)?[0-9a-fA-F]{64}$/.test(a)) throw new Error('that argument looks like a private key; ship never takes one, use --account <keystore-name>');
        throw new Error(`unknown argument "${a}"\n\n${SHIP_HELP}`);
    }
  }
  if (!o.help && !o.version) {
    if (!o.chain) throw new Error(`--chain 151 or 153 is required\n\n${SHIP_HELP}`);
    if (!o.account) throw new Error(`--account <keystore-name> is required: the report carries the deployer's address and its isAllowed reading\n\n${SHIP_HELP}`);
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(o.account)) throw new Error('--account: keystore names use letters, digits, dot, dash and underscore only');
  }
  return o;
}

export async function shipMain(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let args: ReturnType<typeof parseShipArgs>;
  try {
    args = parseShipArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(SHIP_HELP);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${SHIP_VERSION}\n`);
    return 0;
  }
  const { json, help: _h, version: _v, ...opts } = args;
  try {
    const report = await runShip(opts as ShipOptions);
    process.stdout.write(json ? shipReportJson(report) : renderShipText(report));
    return report.ok ? 0 : 1;
  } catch (e) {
    process.stderr.write(`redbelly ship: ${(e as Error).message}\n`);
    return e instanceof ShipUsageError ? 2 : 1;
  }
}
