// The two tools that shell out to forge with a keystore name. Section 13.2 of PLAN.md is the
// rule: the server never receives a private key; forge signs locally. deploy_testnet refuses
// chain 151 outright and refuses when pre-flight fails. verify_routescan builds the Routescan
// recipe and, by default, only dry-runs it (--show-standard-json-input), which makes no
// network call at all.
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseShipHeader, runProcess, shipReportPath } from '@gatedpath/preflight';
import { z } from 'zod';
import { fail, ok } from '../guard.js';
import { forgeRefusal } from '../forge-guard.js';
import { preflightCli } from '../paths.js';
import { reportedChainId, rpcFor } from '../rpc.js';
import { passwordFileSchema, projectSchema, projectPins } from './project.js';
import { addressSchema, chainSchema, rpcSchema } from './read-only.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const deployTestnetInput = z.object({
  project: projectSchema,
  script: z.string().regex(/^[A-Za-z0-9_./-]+\.s\.sol(:[A-Za-z0-9_]+)?$/, 'a Foundry script path like script/Deploy.s.sol:Deploy').describe('Foundry script to run, path[:Contract]'),
  account: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, 'a Foundry keystore name').describe('Foundry keystore name; forge decrypts it and signs locally'),
  passwordFile: passwordFileSchema,
  rpc: rpcSchema.describe('RPC override, for a local fork of testnet; default is the testnet governors endpoint. Anything reporting chain 151 is refused.'),
  admin: addressSchema.optional().describe('Admin address for pre-flight; a warning on testnet if it is an EOA'),
  gas: z.number().int().positive().optional().describe('Expected deployment gas for the balance check'),
  sig: z.string().regex(/^[A-Za-z0-9_]+\(\)$/).optional().describe('Script entry point; default run()'),
  skipSimulation: z.boolean().optional().describe('Pass --skip-simulation to forge script'),
}).strict();

export async function deployTestnet(args: z.infer<typeof deployTestnetInput>): Promise<CallToolResult> {
  const project = resolve(args.project);
  const refusal = forgeRefusal(project);
  if (refusal) return fail(refusal, { project });
  if (!existsSync(join(project, 'foundry.toml'))) return fail(`no foundry.toml in ${project}; this tool drives forge script`);
  const rpc = rpcFor(153, args.rpc);
  let chain: number;
  try {
    chain = await reportedChainId(rpc);
  } catch (e) {
    return fail(`the RPC at ${rpc} did not answer eth_chainId: ${(e as Error).message}`);
  }
  if (chain === 151) {
    return fail('refused: this RPC reports chain 151 (mainnet). deploy_testnet never deploys to mainnet. Mainnet deploys go through pre-flight, the ship report and a person running forge script themselves.', { rpc, chain });
  }
  const pre = [preflightCli(), '--project', project, '--json', '--rpc', rpc, '--account', args.account];
  if (chain === 153) pre.push('--chain', '153');
  if (args.passwordFile) pre.push('--password-file', args.passwordFile);
  if (args.admin) pre.push('--admin', args.admin);
  if (args.gas) pre.push('--gas', String(args.gas));
  const p = await runProcess(process.execPath, pre, { cwd: project, timeoutMs: 180_000 });
  let report: { ok?: boolean; checks?: unknown[] } = {};
  try {
    report = JSON.parse(p.stdout);
  } catch {
    return fail(`pre-flight could not run (exit ${p.code}): ${(p.stderr || p.stdout).trim().slice(-2000)}`);
  }
  if (!report.ok) return fail('refused: pre-flight failed. Fix every "fail" line, then call deploy_testnet again.', { preflight: report });

  // The ship report gate (PLAN.md 18.3): 151 is refused above whatever the file says; on 153 a missing
  // report dated today is a warning, the same words the deploy script prints.
  const shipPath = shipReportPath(project, 153);
  const shipHeader = existsSync(shipPath) ? parseShipHeader(readFileSync(shipPath, 'utf8')) : null;
  const shipReport = existsSync(shipPath)
    ? { present: true, path: shipPath, ok: shipHeader?.ok ?? null, warning: null }
    : { present: false, path: shipPath, ok: null, warning: `no ship report dated today for chain 153 at ${shipPath} (fine on testnet; mainnet refuses without one). ship_report or redbelly ship --chain 153 --account ${args.account} writes it.` };

  const forgeArgs = ['script', args.script, '--rpc-url', rpc, '--account', args.account, '--broadcast'];
  if (args.passwordFile) forgeArgs.push('--password-file', args.passwordFile);
  if (args.sig) forgeArgs.push('--sig', args.sig);
  if (args.skipSimulation) forgeArgs.push('--skip-simulation');
  const r = await runProcess('forge', forgeArgs, { cwd: project, timeoutMs: 600_000, stdin: '' });
  if (r.spawnError) return fail(`forge is not installed or not on PATH (${r.spawnError})`);
  const scriptFile = basename(args.script.split(':')[0]!);
  const runLatest = join(project, 'broadcast', scriptFile, String(chain), 'run-latest.json');
  const deployed = r.code === 0 ? readDeployments(runLatest) : [];
  const result = {
    ok: r.code === 0,
    chain,
    rpc,
    command: `forge ${forgeArgs.join(' ')}`,
    deployed,
    broadcast: existsSync(runLatest) ? runLatest : null,
    preflight: report,
    shipReport,
    stdout: r.stdout.slice(-6000),
    stderr: r.stderr.slice(-3000),
  };
  return r.code === 0 ? ok(result) : fail(`forge script exited ${r.code}`, result);
}

/** CREATE transactions from forge's broadcast record: what was deployed, where, in which tx. */
export function readDeployments(runLatest: string): Array<{ contractName: string | null; address: string; hash: string | null }> {
  if (!existsSync(runLatest)) return [];
  try {
    const record = JSON.parse(readFileSync(runLatest, 'utf8')) as { transactions?: Array<{ transactionType?: string; contractName?: string | null; contractAddress?: string | null; hash?: string | null }> };
    return (record.transactions ?? [])
      .filter((t) => t.transactionType === 'CREATE' || t.transactionType === 'CREATE2')
      .filter((t) => typeof t.contractAddress === 'string')
      .map((t) => ({ contractName: t.contractName ?? null, address: t.contractAddress as string, hash: t.hash ?? null }));
  } catch {
    return [];
  }
}

/** Routescan's Etherscan-style verifier base per chain (Routescan Information Center article 11992459, updated 2026-03-03, and api.routescan.io answering checkverifystatus for 153 on 2026-09-12). */
export function routescanVerifierUrl(chain: 151 | 153): string {
  return chain === 151 ? 'https://api.routescan.io/v2/network/mainnet/evm/151/etherscan' : 'https://api.routescan.io/v2/network/testnet/evm/153/etherscan';
}
export const ROUTESCAN_API_KEY_PLACEHOLDER = 'verifyContract';

export const verifyRoutescanInput = z.object({
  project: projectSchema,
  address: addressSchema.describe('The deployed contract address'),
  contract: z.string().regex(/^[A-Za-z0-9_./-]+\.sol:[A-Za-z0-9_]+$/, 'path/File.sol:Contract').describe('Contract identifier, path/File.sol:Name'),
  chain: chainSchema,
  constructorArgs: z.string().regex(/^0x([0-9a-fA-F]{2})*$/, 'ABI-encoded hex').optional().describe('ABI-encoded constructor arguments, from cast abi-encode'),
  profile: z.string().max(64).optional().describe('Foundry profile whose compiler settings to send'),
  dryRun: z.boolean().default(true).describe('true (default): print the standard JSON input forge would submit and make no network call. false: submit and watch.'),
}).strict();

export async function verifyRoutescan(args: z.infer<typeof verifyRoutescanInput>): Promise<CallToolResult> {
  const project = resolve(args.project);
  if (!existsSync(join(project, 'foundry.toml'))) return fail(`no foundry.toml in ${project}; this tool drives forge verify-contract`);
  const pins = projectPins(project, args.profile);
  const forgeArgs = [
    'verify-contract', args.address, args.contract,
    '--verifier', 'etherscan',
    '--verifier-url', routescanVerifierUrl(args.chain),
    '--etherscan-api-key', ROUTESCAN_API_KEY_PLACEHOLDER,
    '--chain', String(args.chain),
    '--compiler-version', pins.solc ?? '0.8.30',
    '--evm-version', pins.evm ?? 'prague',
  ];
  if (pins.runs !== null) forgeArgs.push('--num-of-optimizations', String(pins.runs));
  if (args.constructorArgs) forgeArgs.push('--constructor-args', args.constructorArgs);
  forgeArgs.push(args.dryRun ? '--show-standard-json-input' : '--watch');
  const r = await runProcess('forge', forgeArgs, { cwd: project, timeoutMs: 600_000 });
  if (r.spawnError) return fail(`forge is not installed or not on PATH (${r.spawnError})`);
  const base = {
    chain: args.chain,
    dryRun: args.dryRun,
    command: `forge ${forgeArgs.join(' ')}`,
    verifierUrl: routescanVerifierUrl(args.chain),
    apiKey: `${ROUTESCAN_API_KEY_PLACEHOLDER} (a fixed placeholder; Routescan does not issue keys for verification)`,
    compiler: { solc: pins.solc ?? '0.8.30', evmVersion: pins.evm ?? 'prague', optimizerRuns: pins.runs },
    explorer: args.chain === 151 ? `https://redbelly.routescan.io/address/${args.address}/contract/151/code` : `https://redbelly.testnet.routescan.io/address/${args.address}/contract/153/code`,
    recipeStatus: 'Recipe from Routescan\'s own Foundry article (2026-03-03) with the chain path from Vine\'s environments page; the endpoint answered a read-only status check for 153 on 2026-09-12. A full submission has not yet been made from this project (RESEARCH.md question 28).',
  };
  if (args.dryRun) {
    let input: { language?: string; sources?: Record<string, unknown>; settings?: { evmVersion?: string; optimizer?: { runs?: number } } } | null = null;
    try {
      input = JSON.parse(r.stdout);
    } catch {
      return fail(`forge did not print the standard JSON input (exit ${r.code})`, { ...base, stderr: r.stderr.slice(-3000) });
    }
    return ok({
      ...base,
      ok: r.code === 0,
      standardJsonInput: {
        language: input?.language ?? null,
        sources: Object.keys(input?.sources ?? {}),
        evmVersion: input?.settings?.evmVersion ?? null,
        optimizerRuns: input?.settings?.optimizer?.runs ?? null,
        bytes: r.stdout.length,
      },
      nothingSubmitted: true,
    });
  }
  const result = { ...base, ok: r.code === 0, stdout: r.stdout.slice(-6000), stderr: r.stderr.slice(-3000) };
  return r.code === 0 ? ok(result) : fail(`forge verify-contract exited ${r.code}`, result);
}
