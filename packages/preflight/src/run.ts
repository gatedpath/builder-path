// Orchestration: pick the chain and RPC, resolve the deployer, run every check, build the
// report. Nothing here signs, and the only network traffic is JSON-RPC to the chosen RPC.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chainById, toCaller } from '@gatedpath/chains';
import { readProjectConfig } from './config.js';
import { ENV_NAMES, readDotEnv } from './dotenv.js';
import { checkAdminSafe } from './checks/admin.js';
import { checkBalance } from './checks/balance.js';
import { checkChainId } from './checks/chain-id.js';
import { checkCompilerPins } from './checks/compiler.js';
import { checkDeployerVerified, resolveDeployer } from './checks/deployer.js';
import { checkGitSecrets } from './checks/git-secrets.js';
import { checkSlitherReport } from './checks/slither.js';
import type { CheckId, CheckResult, PreflightOptions, PreflightReport } from './types.js';

const require = createRequire(import.meta.url);
export const VERSION: string = (require('../package.json') as { version: string }).version;

export const CHECK_IDS: readonly CheckId[] = ['chain-id', 'deployer-verified', 'admin-safe', 'compiler-pins', 'git-secrets', 'balance', 'slither-report'];
export const DEFAULT_GAS = 3_000_000n;

export interface RunOptions extends PreflightOptions {
  passwordFile?: string;
}

export async function runPreflight(opts: RunOptions = {}): Promise<PreflightReport> {
  const env = opts.env ?? process.env;
  const project = resolve(opts.project ?? process.cwd());
  const config = readProjectConfig(project, opts.profile, env);
  const skip = new Set(opts.skip ?? []);
  // The scaffolder's .env names (DEPLOYER, ADMIN_SAFE, CHAIN_ID) fill in what the flags leave out.
  const dotenv = readDotEnv(project, env);
  const envChain = dotenv[ENV_NAMES.chain] !== undefined ? Number(dotenv[ENV_NAMES.chain]) : null;

  // Chain and RPC. --chain wins, then the config's chain id, then CHAIN_ID, then whatever the RPC reports.
  let expected: number | null = opts.chain ?? config.chainId ?? (envChain === 151 || envChain === 153 ? envChain : null);
  let expectedSource = opts.chain ? '--chain' : config.chainId !== null ? (config.kind === 'hardhat' ? `${config.file} network ${config.profile}` : `${config.file}`) : `${ENV_NAMES.chain}`;
  let rpc = opts.rpc ?? config.rpcUrl ?? pickRpcFromConfig(config.rpcEndpoints, expected) ?? defaultRpc(expected);
  if (!opts.rpc && !config.rpcUrl && expected === null && Object.keys(config.rpcEndpoints).length === 0) {
    // nothing said which chain; testnet is the safe default and the chain-id check will say so
    expectedSource = 'nothing';
  }
  let reported: number | null = null;
  try {
    reported = Number(BigInt((await toCaller(rpc)('eth_chainId')) as string));
  } catch {
    reported = null;
  }
  const network = reported === 151 ? 'mainnet' : reported === 153 ? 'testnet' : 'unknown';

  const address = opts.address ?? (opts.account ? undefined : dotenv[ENV_NAMES.deployer]);
  const deployer = await resolveDeployer({ account: opts.account, address, passwordFile: opts.passwordFile, cwd: project, env });
  if (deployer.how === '--address' && !opts.address) deployer.how = ENV_NAMES.deployer;
  const admin = opts.admin ?? dotenv[ENV_NAMES.admin] ?? dotenv[ENV_NAMES.legacyAdmin] ?? null;
  const gas = BigInt(opts.gas ?? DEFAULT_GAS);

  const checks: CheckResult[] = [];
  const push = async (id: CheckId, fn: () => Promise<CheckResult> | CheckResult) => {
    if (skip.has(id)) checks.push({ id, status: 'skip', reason: 'Skipped on request.' });
    else checks.push(await fn());
  };
  await push('chain-id', () => checkChainId(expected, reported, expectedSource, rpc));
  await push('deployer-verified', () => checkDeployerVerified(deployer.address, deployer.how, deployer.error, rpc, reported));
  await push('admin-safe', () => checkAdminSafe(admin, rpc, reported));
  await push('compiler-pins', () => checkCompilerPins(config));
  await push('git-secrets', () => checkGitSecrets(project));
  await push('balance', () => checkBalance(deployer.address, gas, rpc, reported));
  await push('slither-report', () => checkSlitherReport(project, config.sourceDir, opts.slitherReport));

  return {
    tool: 'redbelly-preflight',
    version: VERSION,
    generatedAt: new Date().toISOString(),
    project,
    config: { kind: config.kind, file: config.file, profile: config.profile },
    chain: { expected, reported, rpc, network },
    deployer: deployer.address,
    admin,
    checks,
    ok: checks.every((c) => c.status !== 'fail') && !skipsForbidOk(skip, reported ?? expected),
    skippedOnRequest: skip.size,
  };
}

/** A requested skip that "ok" cannot survive: anything on mainnet, the chain check anywhere, or everything. */
function skipsForbidOk(skip: ReadonlySet<CheckId>, chain: number | null): boolean {
  if (skip.size === 0) return false;
  return chain === 151 || skip.has('chain-id') || skip.size >= ALL_CHECKS;
}
const ALL_CHECKS = 7;

function defaultRpc(chain: number | null): string {
  const c = chainById(chain === 151 ? 151 : 153);
  if (!c) throw new Error('chain definitions missing');
  return c.rpcUrls.default.http[0]!;
}

function pickRpcFromConfig(endpoints: Record<string, string>, chain: number | null): string | null {
  const entries = Object.entries(endpoints);
  if (entries.length === 0) return null;
  const want = chain === 151 ? /mainnet/i : chain === 153 ? /testnet/i : null;
  if (want) {
    const hit = entries.find(([name, url]) => want.test(name) || want.test(url));
    if (hit) return hit[1];
  }
  return entries.length === 1 ? entries[0]![1] : null;
}

export function renderText(report: PreflightReport): string {
  const lines: string[] = [];
  lines.push(`redbelly-preflight ${report.version}  project ${report.project}`);
  lines.push(`chain ${report.chain.reported ?? '?'} (${report.chain.network}) via ${report.chain.rpc}${report.deployer ? `  deployer ${report.deployer}` : ''}${report.admin ? `  admin ${report.admin}` : ''}`);
  lines.push('');
  for (const c of report.checks) lines.push(`${c.status.padEnd(5)} ${c.id.padEnd(18)} ${c.reason}`);
  lines.push('');
  const fails = report.checks.filter((c) => c.status === 'fail').length;
  const warns = report.checks.filter((c) => c.status === 'warn').length;
  const skipped = report.skippedOnRequest;
  if (report.ok) {
    const notes = [warns ? `${warns} warning${warns === 1 ? '' : 's'}` : '', skipped ? `${skipped} skipped on request, so not checked` : ''].filter(Boolean);
    lines.push(`ok: no check failed${notes.length ? ` (${notes.join('; ')})` : ''}.`);
  } else if (fails > 0) {
    lines.push(`not ok: ${fails} check${fails === 1 ? '' : 's'} failed. Do not deploy.`);
  } else if (skipped >= ALL_CHECKS) {
    lines.push('not ok: every check was skipped, so nothing was checked.');
  } else if (report.chain.reported === 151 || report.chain.expected === 151) {
    lines.push(`not ok: ${skipped} check${skipped === 1 ? ' was' : 's were'} skipped on request, and chain 151 accepts no skipped check.`);
  } else {
    lines.push('not ok: the chain check was skipped, so nothing says which network this is.');
  }
  return lines.join('\n') + '\n';
}
