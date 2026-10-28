// `redbelly fees`: what the measured calls cost on each chain today. Exit 0 when every chain was
// read, 1 when one could not be (the line says which and why), 2 on bad arguments. --json for agents.
import { FEES_VERSION, feesReportJson, renderFeesText, runFees } from './fees.js';
import type { FeesOptions } from './fees.js';

export const FEES_HELP = `redbelly fees [options]

Reads both chains (151 mainnet, 153 testnet) and prints, for each, the head block and its time,
the base fee, RBNT in US dollars from the on-chain feed, the measured calls a builder meets (a
transfer, the recipient guard, the gated token, enabling a wallet) in gas, RBNT and US cents at
today's base fee, and on mainnet the enable call at nine block heights since the first week.
The command-line twin of the site's fee checker. Read-only, no key.

  --chain <151|153>    one chain instead of both
  --rpc <url>          JSON-RPC endpoint in place of the chain's governors RPC (a fork works)
  --timeout <ms>       per request (default 10000)
  --no-history         skip the mainnet history reads
  --json               print the report as JSON
  --version, --help
`;

export function parseFeesArgs(argv: readonly string[]): FeesOptions & { json: boolean; help: boolean; version: boolean } {
  const o: FeesOptions & { json: boolean; help: boolean; version: boolean } = { json: false, help: false, version: false };
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
      case '--chain': {
        const c = Number(next());
        if (c !== 151 && c !== 153) throw new Error('--chain must be 151 or 153');
        o.chain = c;
        break;
      }
      case '--rpc': o.rpc = next(); break;
      case '--timeout': {
        const t = Number(next());
        if (!Number.isInteger(t) || t <= 0) throw new Error('--timeout must be a whole number of milliseconds');
        o.timeoutMs = t;
        break;
      }
      case '--no-history': o.history = false; break;
      case '--json': o.json = true; break;
      case '--help': case '-h': o.help = true; break;
      case '--version': o.version = true; break;
      default:
        if (/^(0x)?[0-9a-fA-F]{64}$/.test(a)) throw new Error('that argument looks like a private key; redbelly fees reads the chain and never takes one');
        throw new Error(`unknown argument "${a}"\n\n${FEES_HELP}`);
    }
  }
  return o;
}

export async function feesMain(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let args: ReturnType<typeof parseFeesArgs>;
  try {
    args = parseFeesArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(FEES_HELP);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${FEES_VERSION}\n`);
    return 0;
  }
  const { json, help: _h, version: _v, ...opts } = args;
  const report = await runFees(opts);
  process.stdout.write(json ? feesReportJson(report) : renderFeesText(report));
  // The failures are already in the report; repeat them on stderr so a pipe that keeps only stdout still shows the reason in a terminal.
  for (const c of report.chains) if (!c.ok) process.stderr.write(`redbelly fees: chain ${c.chain ?? 'at ' + c.rpc} could not be read: ${c.error}\n`);
  return report.ok ? 0 : 1;
}
