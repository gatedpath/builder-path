#!/usr/bin/env node
// redbelly-agent-rules: write every rules file into a directory.
//   --out <dir>      target directory (default: current directory)
//   --only <format>  one of claude, agents, cursor, copilot, gemini, llms, llms-full; repeatable or comma-separated
//   --dry-run        print what would be written, touch nothing
//   --check          exit 1 if any file on disk differs from what would be generated
//   --list           print the formats and their paths
import { formats, isFormat, targetPath } from './render.js';
import type { Format } from './render.js';
import { writeRulesFiles } from './write.js';

const HELP = `redbelly-agent-rules [--out <dir>] [--only <format>]... [--dry-run] [--check] [--list]

Writes ${formats.map((f) => targetPath[f]).join(', ')} into --out (default: the current directory).
Every file is rendered from one source, so their content is the same; only the framing differs.

  --out <dir>      target directory
  --only <format>  restrict to a format: ${formats.join(', ')} (repeat or comma-separate)
  --dry-run        show what would change, write nothing
  --check          exit 1 when a file on disk differs from the render (for CI)
  --list           print formats and their relative paths
  --help           this text
`;

interface Args {
  out: string;
  only: Format[];
  dryRun: boolean;
  check: boolean;
  list: boolean;
  help: boolean;
}

export function parseArgs(argv: readonly string[]): Args {
  const args: Args = { out: process.cwd(), only: [], dryRun: false, check: false, list: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--out') args.out = next();
    else if (a.startsWith('--out=')) args.out = a.slice('--out='.length);
    else if (a === '--only' || a.startsWith('--only=')) {
      const raw = a === '--only' ? next() : a.slice('--only='.length);
      for (const f of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!isFormat(f)) throw new Error(`unknown format "${f}"; known: ${formats.join(', ')}`);
        if (!args.only.includes(f)) args.only.push(f);
      }
    } else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--check') args.check = true;
    else if (a === '--list') args.list = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`unknown argument "${a}"\n\n${HELP}`);
  }
  return args;
}

export function main(argv: readonly string[] = process.argv.slice(2)): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (args.list) {
    for (const f of formats) process.stdout.write(`${f.padEnd(10)} ${targetPath[f]}\n`);
    return 0;
  }
  const only = args.only.length > 0 ? args.only : undefined;
  const result = writeRulesFiles(args.out, { ...(only ? { only } : {}), dryRun: args.dryRun, check: args.check });
  if (args.check) {
    for (const f of result.unchanged) process.stdout.write(`ok       ${f}\n`);
    for (const f of result.drifted) process.stdout.write(`drifted  ${f}\n`);
    if (result.drifted.length > 0) {
      process.stderr.write(`${result.drifted.length} file(s) differ from the render. Run: redbelly-agent-rules --out ${args.out}\n`);
      return 1;
    }
    return 0;
  }
  const verb = args.dryRun ? 'would write' : 'wrote';
  for (const f of result.written) process.stdout.write(`${verb.padEnd(11)} ${f}\n`);
  for (const f of result.unchanged) process.stdout.write(`unchanged   ${f}\n`);
  return 0;
}

process.exitCode = main();
