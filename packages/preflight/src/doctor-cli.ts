#!/usr/bin/env node
// redbelly-doctor: one line per check, pass, warn or fail, with the fix on the same line.
// Exit 0 only when every required check passes; 1 otherwise; 2 on bad arguments. --json for agents.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DOCTOR_VERSION, renderDoctorText, runDoctor } from './doctor.js';

export const DOCTOR_HELP = `redbelly-doctor [options]

Checks the machine before the first command: Node 22 or later; forge, anvil and cast on
PATH, one version, and the real binaries rather than the @foundry-rs npm shim that exits 0
whatever the binary returned; slither and aderyn (optional); git; no .env tracked by git;
and, in a scaffold, vendor/ matching the versions the scaffolder recorded. One line per
check with the fix on the same line. Touches no network and no key.

  --project <dir>   scaffold root, its contracts/ folder, or any directory (default: cwd)
  --json            print the report as JSON
  --version, --help

Exit 0 when every required check passes (optional checks may warn), 1 otherwise, 2 on bad arguments.
`;

export function parseDoctorArgs(argv: readonly string[]): { project?: string; json: boolean; help: boolean; version: boolean } {
  const o: { project?: string; json: boolean; help: boolean; version: boolean } = { json: false, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const [flag, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined];
    switch (flag) {
      case '--project': {
        const v = inline ?? argv[++i];
        if (v === undefined) throw new Error('--project needs a value');
        o.project = v;
        break;
      }
      case '--json': o.json = true; break;
      case '--help': case '-h': o.help = true; break;
      case '--version': o.version = true; break;
      default:
        if (/^(0x)?[0-9a-fA-F]{64}$/.test(a)) throw new Error('that argument looks like a private key; doctor never takes one and needs no address');
        throw new Error(`unknown argument "${a}"\n\n${DOCTOR_HELP}`);
    }
  }
  return o;
}

export async function doctorMain(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let args: ReturnType<typeof parseDoctorArgs>;
  try {
    args = parseDoctorArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(DOCTOR_HELP);
    return 0;
  }
  if (args.version) {
    process.stdout.write(`${DOCTOR_VERSION}\n`);
    return 0;
  }
  const report = await runDoctor(args.project !== undefined ? { project: args.project } : {});
  process.stdout.write(args.json ? JSON.stringify(report, null, 2) + '\n' : renderDoctorText(report));
  return report.ok ? 0 : 1;
}

/** True when this file is the process entry point (a bin symlink resolves to it), not an import. */
const isEntry = Boolean(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1]!)).href === import.meta.url;
if (isEntry) doctorMain().then((code) => { process.exitCode = code; }, (e) => { process.stderr.write(`${(e as Error).stack ?? e}\n`); process.exitCode = 2; });
