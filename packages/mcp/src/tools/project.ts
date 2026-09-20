// Tools that run something in the builder's project: pre-flight, the five-state test suites,
// the rules-file drift check. Each shells out with an argv array and returns what it saw.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { formats, targetPath, writeRulesFiles } from '@gatedpath/agent-rules';
import { readProjectConfig, runProcess } from '@gatedpath/preflight';
import { z } from 'zod';
import { fail, ok } from '../guard.js';
import { forgeRefusal } from '../forge-guard.js';
import { preflightCli } from '../paths.js';
import { addressSchema, chainSchema, rpcSchema } from './read-only.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const projectSchema = z.string().min(1).describe('Absolute path of the project directory (the one with foundry.toml or hardhat.config.*)');
export const accountSchema = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, 'a Foundry keystore name').optional().describe('Foundry keystore name under ~/.foundry/keystores; cast and forge decrypt it locally');
export const passwordFileSchema = z.string().optional().describe('Path to a file holding the keystore password, handed to forge/cast as --password-file; the password itself never passes through this server');

export const preflightInput = z.object({
  project: projectSchema,
  chain: chainSchema.optional(),
  rpc: rpcSchema,
  address: addressSchema.optional().describe('Deployer address for a read-only run'),
  account: accountSchema,
  passwordFile: passwordFileSchema,
  admin: addressSchema.optional().describe('Address that will own the deployed contracts; a Safe on mainnet'),
  gas: z.number().int().positive().optional().describe('Expected deployment gas; default 3,000,000'),
  profile: z.string().max(64).optional().describe('Foundry profile or Hardhat network name'),
  // No `skip`: a check an agent may switch off is not a check. `--skip` stays on the CLI, for a person (audit of 2026-09-19).
}).strict();

export async function preflight(args: z.infer<typeof preflightInput>): Promise<CallToolResult> {
  const project = resolve(args.project);
  if (!existsSync(project)) return fail(`project directory does not exist: ${project}`);
  const argv = [preflightCli(), '--project', project, '--json'];
  if (args.chain) argv.push('--chain', String(args.chain));
  if (args.rpc) argv.push('--rpc', args.rpc);
  if (args.address) argv.push('--address', args.address);
  if (args.account) argv.push('--account', args.account);
  if (args.passwordFile) argv.push('--password-file', args.passwordFile);
  if (args.admin) argv.push('--admin', args.admin);
  if (args.gas) argv.push('--gas', String(args.gas));
  if (args.profile) argv.push('--profile', args.profile);
  const r = await runProcess(process.execPath, argv, { cwd: project, timeoutMs: 180_000 });
  if (r.code === 2 || r.spawnError) return fail(`pre-flight could not run: ${(r.stderr || r.spawnError || '').trim()}`);
  try {
    const report = JSON.parse(r.stdout) as Record<string, unknown>;
    return ok({ ...report, exitCode: r.code, command: ['redbelly-preflight', ...argv.slice(1)].join(' ') });
  } catch {
    return fail(`pre-flight printed something that is not JSON (exit ${r.code})`, { stdout: r.stdout.slice(0, 4000), stderr: r.stderr.slice(0, 4000) });
  }
}

export const fiveStateInput = z.object({
  project: projectSchema,
  matchContract: z.string().max(200).optional().describe('Regex for --match-contract; default: every test contract that inherits GatedTest'),
}).strict();

/** Test contracts under test/ that inherit GatedTest, by name. */
export function findGatedSuites(project: string, testDir = 'test'): string[] {
  const dir = join(project, testDir);
  if (!existsSync(dir)) return [];
  const names: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.t.sol')) {
        const text = readFileSync(p, 'utf8');
        for (const m of text.matchAll(/\bcontract\s+([A-Za-z0-9_]+)\s+is\s+([^{]*)\bGatedTest\b/g)) names.push(m[1]!);
      }
    }
  };
  walk(dir);
  return names;
}

export async function fiveStateTests(args: z.infer<typeof fiveStateInput>): Promise<CallToolResult> {
  const project = resolve(args.project);
  if (!existsSync(join(project, 'foundry.toml'))) return fail(`no foundry.toml in ${project}; the five-state suites are Foundry tests built on GatedTest from @gatedpath/receptor-mock`);
  const refusal = forgeRefusal(project);
  if (refusal) return fail(refusal, { project: project });
  const suites = findGatedSuites(project);
  const pattern = args.matchContract ?? (suites.length ? `^(${suites.join('|')})$` : null);
  if (!pattern) return fail('no test contract inherits GatedTest; every gated function needs a suite that uses assertRevertsForAllInvalidStates or assertGatedPair', { project });
  const r = await runProcess('forge', ['test', '--match-contract', pattern, '--json'], { cwd: project, timeoutMs: 600_000 });
  if (r.spawnError) return fail(`forge is not installed or not on PATH (${r.spawnError}); the rules files say to offer the Hardhat config when forge is missing, but the five-state helper is Foundry-only today`);
  let parsed: Record<string, { test_results: Record<string, { status: string; reason?: string | null }> }>;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    return fail(`forge test did not print JSON (exit ${r.code})`, { stderr: r.stderr.slice(-4000), stdout: r.stdout.slice(-4000) });
  }
  const results: Array<{ suite: string; test: string; status: string; reason: string | null }> = [];
  for (const [suite, v] of Object.entries(parsed)) {
    for (const [test, t] of Object.entries(v.test_results)) results.push({ suite, test, status: t.status, reason: t.reason ?? null });
  }
  const passed = results.filter((t) => t.status === 'Success').length;
  const failed = results.filter((t) => t.status === 'Failure').length;
  return ok({
    project,
    suites,
    matchContract: pattern,
    passed,
    failed,
    skipped: results.length - passed - failed,
    ok: failed === 0 && r.code === 0 && results.length > 0,
    failures: results.filter((t) => t.status === 'Failure'),
    command: `forge test --match-contract '${pattern}' --json`,
  });
}

export const rulesCheckInput = z.object({ project: projectSchema }).strict();
export function rulesFilesCheck(args: z.infer<typeof rulesCheckInput>): CallToolResult {
  const project = resolve(args.project);
  if (!existsSync(project)) return fail(`project directory does not exist: ${project}`);
  const r = writeRulesFiles(project, { check: true, dryRun: true });
  const missing = formats.map((f) => targetPath[f]).filter((p) => !existsSync(join(project, p)));
  return ok({
    project,
    ok: r.drifted.length === 0,
    unchanged: r.unchanged,
    drifted: r.drifted,
    missing,
    fix: r.drifted.length ? `redbelly-agent-rules --out ${project}` : null,
    equivalent: `redbelly-agent-rules --check --out ${project}`,
  });
}

/** Compiler settings the verify tool copies from the project. */
export function projectPins(project: string, profile?: string): { solc: string | null; evm: string | null; runs: number | null } {
  const c = readProjectConfig(project, profile);
  return { solc: c.solc, evm: c.evmVersion, runs: c.optimizerRuns };
}
