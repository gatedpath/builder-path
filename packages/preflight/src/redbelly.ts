#!/usr/bin/env node
// `redbelly <command>`: one bin for the checks a builder runs by hand. `preflight` is the seven
// checks, `doctor` the machine, `gas` the report in RBNT and US cents, `ship` the mainnet gate that
// writes its own report. Each is also its own bin (redbelly-preflight, redbelly-doctor) or an MCP tool.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { main as preflightMain } from './cli.js';
import { doctorMain } from './doctor-cli.js';

const HELP = `redbelly <command> [options]

  preflight   the seven checks before a deploy (redbelly-preflight)
  doctor      the machine before the first command (redbelly-doctor)
  gas         gas per function in RBNT and US cents at the chain's base fee and feed price
  ship        pre-flight, Slither, the five-state tests and the gas figures, written to deployments/ship-<chain>-<date>.md

redbelly <command> --help for each. Nothing here takes a key; signing tools take a keystore name.
`;

const commands: Record<string, (argv: readonly string[]) => Promise<number>> = {
  preflight: preflightMain,
  doctor: doctorMain,
  gas: async (argv) => (await import('./gas-cli.js')).gasMain(argv),
  ship: async (argv) => (await import('./ship-cli.js')).shipMain(argv),
};

export async function redbellyMain(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '--help' || cmd === '-h') {
    process.stdout.write(HELP);
    return cmd ? 0 : 2;
  }
  const fn = commands[cmd];
  if (!fn) {
    process.stderr.write(`unknown command "${cmd}"\n\n${HELP}`);
    return 2;
  }
  return fn(rest);
}

/** True when this file is the process entry point (a bin symlink resolves to it), not an import. */
const isEntry = Boolean(process.argv[1]) && pathToFileURL(realpathSync(process.argv[1]!)).href === import.meta.url;
if (isEntry) redbellyMain().then((code) => { process.exitCode = code; }, (e) => { process.stderr.write(`${(e as Error).stack ?? e}\n`); process.exitCode = 2; });
