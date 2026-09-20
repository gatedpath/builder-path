// redbelly-doctor: the machine before the first command. Node 22 or later; forge, anvil and cast
// present, one version, and the real binaries rather than the @foundry-rs npm shim that exits 0
// whatever the binary returned; slither and aderyn optional; git; no .env tracked; and, in a
// scaffold, vendor/ matching the versions the scaffolder recorded. One line per check with the fix
// on the same line. The fix text comes from the failure table in @gatedpath/agent-rules, so
// explain_failure and doctor use the same words. Nothing here touches a network or a key.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, delimiter, dirname, join, resolve } from 'node:path';
import { failureByKind } from '@gatedpath/agent-rules/failures';
import { run } from './proc.js';

const require = createRequire(import.meta.url);
export const DOCTOR_VERSION: string = (require('../package.json') as { version: string }).version;

export type DoctorCheckId = 'node' | 'git' | 'forge' | 'anvil' | 'cast' | 'foundry-version' | 'foundry-exit-code' | 'slither' | 'aderyn' | 'env-tracked' | 'vendor';
export const DOCTOR_CHECK_IDS: readonly DoctorCheckId[] = ['node', 'git', 'forge', 'anvil', 'cast', 'foundry-version', 'foundry-exit-code', 'slither', 'aderyn', 'env-tracked', 'vendor'];

export type DoctorStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  readonly id: DoctorCheckId;
  /** A required check that fails makes the exit code 1. Optional checks warn at worst. */
  readonly required: boolean;
  readonly status: DoctorStatus;
  /** One sentence, printed after the status and the id. */
  readonly reason: string;
  /** The next command, printed on the same line. From the failure table where the table has the entry. */
  readonly fix: string | null;
  /** The failure-table kind the fix comes from, so explain_failure says the same thing. */
  readonly kind: string | null;
  readonly data?: Record<string, unknown>;
}

export interface DoctorOptions {
  /** Project directory: a scaffold root, its contracts/ folder, or any directory. Default: cwd. */
  project?: string;
  /** Environment to read PATH (and PATHEXT on Windows) from. Default: process.env. */
  env?: NodeJS.ProcessEnv;
  /** Node version to judge. Default: process.version. Tests hand in an older one. */
  nodeVersion?: string;
  platform?: NodeJS.Platform;
  arch?: string;
}

export interface DoctorReport {
  readonly tool: 'redbelly-doctor';
  readonly version: string;
  readonly generatedAt: string;
  readonly project: string;
  readonly scaffold: boolean;
  readonly checks: readonly DoctorCheck[];
  /** True when every required check passes. Warnings never clear or cause a fail. */
  readonly ok: boolean;
}

export const NODE_MIN_MAJOR = 22;
export const SLITHER_PIN = '0.11.6';
export const ADERYN_PIN = '0.6.8';
const FOUNDRY_TOOLS = ['forge', 'anvil', 'cast'] as const;
type FoundryTool = (typeof FOUNDRY_TOOLS)[number];
/** The flag no Foundry binary knows. clap exits 2 on it; the npm shim exits 0. */
const BOGUS_FLAG = '--this-flag-does-not-exist';

const fixFor = (kind: string): string | null => failureByKind(kind)?.fix.command ?? null;

/** First match for `name` on PATH, the way a shell finds it. Windows adds PATHEXT. */
export function whichOnPath(name: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | null {
  const dirs = (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean);
  const exts = platform === 'win32' ? ['', ...(env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase())] : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      try {
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        /* not here */
      }
    }
  }
  return null;
}

/** The semantic version a tool prints for --version, or null. */
export async function toolVersion(path: string): Promise<{ version: string | null; output: string }> {
  const r = await run(path, ['--version'], { timeoutMs: 20_000 });
  const output = (r.stdout + r.stderr).trim();
  if (r.spawnError) return { version: null, output: r.spawnError };
  const m = /(\d+\.\d+\.\d+)/.exec(output);
  return { version: m ? m[1]! : null, output };
}

/** Does the binary hand its exit code back? The npm shim spawns the real tool and always exits 0. */
export async function exitCodePropagates(path: string): Promise<boolean | null> {
  const r = await run(path, [BOGUS_FLAG], { timeoutMs: 20_000 });
  if (r.spawnError || r.code === null) return null;
  return r.code !== 0;
}

/** A Node script where a binary should be: a .mjs/.js/.cjs, a `#!…node` shebang, or a Windows .cmd calling node. */
export function looksLikeNodeShim(path: string): boolean {
  try {
    const real = realpathSync(path);
    if (/\.(mjs|cjs|js)$/i.test(real)) return true;
    const head = readFileSync(real).subarray(0, 512).toString('utf8');
    if (head.startsWith('#!') && /node/.test(head.split('\n')[0]!)) return true;
    if (/\.cmd$/i.test(real) && /node/.test(head)) return true;
    return false;
  } catch {
    return false;
  }
}

/** The platform binary the @foundry-rs shim would spawn, when it sits beside the shim. */
export function realBinaryNear(shimPath: string, tool: FoundryTool, platform: NodeJS.Platform = process.platform, arch: string = process.arch): string | null {
  let dir: string;
  try {
    dir = dirname(realpathSync(shimPath));
  } catch {
    return null;
  }
  const archName = arch === 'x64' ? 'amd64' : arch;
  const pkg = `${tool}-${platform}-${archName}`;
  const exe = platform === 'win32' ? '.exe' : '';
  const candidates = [join(dir, 'node_modules', '@foundry-rs', pkg, 'bin', tool + exe), join(dir, '..', pkg, 'bin', tool + exe), join(dir, '..', '..', '@foundry-rs', pkg, 'bin', tool + exe)];
  return candidates.find((c) => existsSync(c)) ?? null;
}

/** Scaffold root for a directory: itself, or its parent when the directory is a scaffold's contracts/. */
export function scaffoldRoot(project: string): string | null {
  const isScaffold = (dir: string) => existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'vendor')) && readdirSync(join(dir, 'vendor')).some((d) => d.startsWith('redbelly-'));
  if (isScaffold(project)) return project;
  const parent = resolve(project, '..');
  if (basename(project) === 'contracts' && isScaffold(parent)) return parent;
  return null;
}

const majorOf = (v: string): number => Number(/^v?(\d+)/.exec(v)?.[1] ?? 0);

export async function runDoctor(opts: DoctorOptions = {}): Promise<DoctorReport> {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  const project = resolve(opts.project ?? process.cwd());
  const root = scaffoldRoot(project);
  const checks: DoctorCheck[] = [];

  // node
  const nodeVersion = opts.nodeVersion ?? process.version;
  const major = majorOf(nodeVersion);
  checks.push(
    major >= NODE_MIN_MAJOR
      ? { id: 'node', required: true, status: 'pass', reason: `${nodeVersion} (${NODE_MIN_MAJOR} or later)`, fix: null, kind: null, data: { version: nodeVersion } }
      : { id: 'node', required: true, status: 'fail', reason: `${nodeVersion} is older than ${NODE_MIN_MAJOR}; the scaffold, the MCP server and the web app are built and tested on ${NODE_MIN_MAJOR}.`, fix: fixFor('node-too-old'), kind: 'node-too-old', data: { version: nodeVersion } },
  );

  // git
  const gitPath = whichOnPath('git', env, platform);
  const git = gitPath ? await toolVersion(gitPath) : null;
  checks.push(
    gitPath && git?.version
      ? { id: 'git', required: true, status: 'pass', reason: `${git.version} at ${gitPath}`, fix: null, kind: null, data: { path: gitPath, version: git.version } }
      : { id: 'git', required: true, status: 'fail', reason: 'not found on PATH.', fix: fixFor('git-not-found'), kind: 'git-not-found' },
  );

  // forge, anvil, cast
  const found: Partial<Record<FoundryTool, { path: string; version: string | null; propagates: boolean | null; shim: boolean; real: string | null }>> = {};
  for (const tool of FOUNDRY_TOOLS) {
    const path = whichOnPath(tool, env, platform);
    const kind = tool === 'anvil' ? 'anvil-not-found' : 'forge-not-found';
    if (!path) {
      checks.push({ id: tool, required: true, status: 'fail', reason: 'not found on PATH.', fix: fixFor(kind), kind });
      continue;
    }
    const v = await toolVersion(path);
    const propagates = await exitCodePropagates(path);
    const shim = propagates === false || looksLikeNodeShim(path);
    const real = shim ? realBinaryNear(path, tool, platform, arch) : null;
    found[tool] = { path, version: v.version, propagates, shim, real };
    if (!v.version) {
      checks.push({ id: tool, required: true, status: 'fail', reason: `${path} did not answer --version (${v.output.slice(0, 120) || 'no output'}).`, fix: fixFor(kind), kind, data: { path } });
      continue;
    }
    checks.push({ id: tool, required: true, status: 'pass', reason: `${v.version} at ${path}${shim ? ' (the npm shim; see foundry-exit-code)' : ''}`, fix: null, kind: null, data: { path, version: v.version, shim } });
  }

  // one version across the three
  const versions = FOUNDRY_TOOLS.map((t) => found[t]?.version ?? null);
  if (versions.some((v) => v === null)) {
    checks.push({ id: 'foundry-version', required: true, status: 'fail', reason: `cannot compare: ${FOUNDRY_TOOLS.filter((t) => !found[t]?.version).join(', ')} missing (above).`, fix: fixFor('foundry-version-mismatch'), kind: 'foundry-version-mismatch', data: { versions } });
  } else if (new Set(versions).size === 1) {
    checks.push({ id: 'foundry-version', required: true, status: 'pass', reason: `forge, anvil and cast are all ${versions[0]}.`, fix: null, kind: null, data: { version: versions[0] } });
  } else {
    checks.push({ id: 'foundry-version', required: true, status: 'fail', reason: FOUNDRY_TOOLS.map((t) => `${t} ${found[t]!.version}`).join(', ') + '; Foundry ships and tests the three together.', fix: fixFor('foundry-version-mismatch'), kind: 'foundry-version-mismatch', data: { versions } });
  }

  // the shim that drops exit codes
  const present = FOUNDRY_TOOLS.filter((t) => found[t]);
  const shims = present.filter((t) => found[t]!.shim);
  if (present.length === 0) {
    checks.push({ id: 'foundry-exit-code', required: true, status: 'fail', reason: 'nothing to probe: forge, anvil and cast are missing (above).', fix: null, kind: 'foundry-exit-code-shim' });
  } else if (shims.length === 0) {
    checks.push({ id: 'foundry-exit-code', required: true, status: 'pass', reason: `${present.join(', ')} hand back their exit codes (${BOGUS_FLAG} exits ${present.map((t) => found[t]!.propagates === null ? '?' : 'non-zero').join(', ')}).`, fix: null, kind: null });
  } else {
    const detail = shims.map((t) => `${t} at ${found[t]!.path} is the @foundry-rs npm shim (${BOGUS_FLAG} exited 0; the real binary exits 2)${found[t]!.real ? `, real binary ${found[t]!.real}` : ''}`).join('; ');
    const concrete = shims.map((t) => (found[t]!.real ? `ln -sf ${found[t]!.real} ${found[t]!.path}` : null)).filter(Boolean).join(' && ');
    checks.push({ id: 'foundry-exit-code', required: true, status: 'fail', reason: `${detail}. A failed forge build or test reports success through it.`, fix: concrete || fixFor('foundry-exit-code-shim'), kind: 'foundry-exit-code-shim', data: { shims: shims.map((t) => ({ tool: t, path: found[t]!.path, real: found[t]!.real })) } });
  }

  // slither, aderyn (optional)
  for (const [tool, pin, kind] of [['slither', SLITHER_PIN, 'slither-not-found'], ['aderyn', ADERYN_PIN, 'aderyn-not-found']] as const) {
    const path = whichOnPath(tool, env, platform);
    if (!path) {
      checks.push({ id: tool, required: false, status: 'warn', reason: `not found on PATH (optional${tool === 'slither' ? '; pre-flight wants its report before a deploy' : ''}).`, fix: fixFor(kind), kind });
      continue;
    }
    const v = await toolVersion(path);
    if (!v.version) checks.push({ id: tool, required: false, status: 'warn', reason: `${path} did not answer --version (optional).`, fix: fixFor(kind), kind, data: { path } });
    else if (v.version !== pin) checks.push({ id: tool, required: false, status: 'warn', reason: `${v.version} at ${path}; CI pins ${pin}, so findings may differ.`, fix: null, kind: null, data: { path, version: v.version, pin } });
    else checks.push({ id: tool, required: false, status: 'pass', reason: `${v.version} at ${path}`, fix: null, kind: null, data: { path, version: v.version } });
  }

  // no .env tracked
  if (!gitPath) {
    checks.push({ id: 'env-tracked', required: true, status: 'fail', reason: 'cannot check without git (above).', fix: null, kind: 'git-not-found' });
  } else {
    const inRepo = await run(gitPath, ['rev-parse', '--is-inside-work-tree'], { cwd: root ?? project, timeoutMs: 10_000 });
    if (inRepo.code !== 0 || inRepo.stdout.trim() !== 'true') {
      checks.push({ id: 'env-tracked', required: true, status: 'pass', reason: 'not a git repository, so nothing is tracked.', fix: null, kind: null, data: { repository: false } });
    } else {
      const ls = await run(gitPath, ['ls-files'], { cwd: root ?? project, timeoutMs: 30_000 });
      const files = ls.stdout.split('\n').filter(Boolean);
      const tracked = files.filter((f) => /^\.env(\..+)?$/.test(basename(f)) && !/\.(example|sample)$/.test(f));
      if (tracked.length === 0) checks.push({ id: 'env-tracked', required: true, status: 'pass', reason: `no .env among ${files.length} tracked file${files.length === 1 ? '' : 's'}.`, fix: null, kind: null, data: { repository: true, tracked: files.length } });
      else checks.push({ id: 'env-tracked', required: true, status: 'fail', reason: `${tracked.join(', ')} ${tracked.length === 1 ? 'is' : 'are'} tracked by git.`, fix: fixFor('env-tracked'), kind: 'env-tracked', data: { tracked } });
    }
  }

  // vendor/ against the scaffolder's record
  if (!root) {
    checks.push({ id: 'vendor', required: true, status: 'pass', reason: 'not a scaffold (no vendor/redbelly-*), so nothing to compare.', fix: null, kind: null, data: { scaffold: false } });
  } else {
    const pkg = readJson(join(root, 'package.json')) as { redbelly?: { scaffolder?: string; vendor?: Record<string, string> } } | null;
    const record = pkg?.redbelly?.vendor;
    const vendored: Record<string, string | null> = {};
    for (const dir of readdirSync(join(root, 'vendor')).filter((d) => d.startsWith('redbelly-')).sort()) {
      const v = readJson(join(root, 'vendor', dir, 'package.json')) as { version?: string } | null;
      vendored[dir] = v?.version ?? null;
    }
    if (!record) {
      checks.push({ id: 'vendor', required: true, status: 'warn', reason: `${Object.keys(vendored).length} vendored package${Object.keys(vendored).length === 1 ? '' : 's'} (${Object.entries(vendored).map(([d, v]) => `${d} ${v ?? '?'}`).join(', ')}); this scaffold predates the version record in package.json, so nothing to compare against.`, fix: null, kind: null, data: { vendored, record: null } });
    } else {
      const drift = Object.entries(record).filter(([dir, want]) => vendored[dir] !== want).map(([dir, want]) => `vendor/${dir} is ${vendored[dir] ?? 'missing'}, the record says ${want}`);
      if (drift.length === 0) checks.push({ id: 'vendor', required: true, status: 'pass', reason: `vendor/ matches the record: ${Object.entries(record).map(([d, v]) => `${d} ${v}`).join(', ')}.`, fix: null, kind: null, data: { vendored, record, scaffolder: pkg?.redbelly?.scaffolder ?? null } });
      else checks.push({ id: 'vendor', required: true, status: 'fail', reason: `${drift.join('; ')}.`, fix: fixFor('vendor-drift'), kind: 'vendor-drift', data: { vendored, record, scaffolder: pkg?.redbelly?.scaffolder ?? null } });
    }
  }

  return {
    tool: 'redbelly-doctor',
    version: DOCTOR_VERSION,
    generatedAt: new Date().toISOString(),
    project,
    scaffold: root !== null,
    checks,
    ok: checks.every((c) => !(c.required && c.status === 'fail')),
  };
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function renderDoctorText(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(`redbelly-doctor ${report.version}  project ${report.project}${report.scaffold ? '  (scaffold)' : ''}`);
  lines.push('');
  for (const c of report.checks) lines.push(`${c.status.padEnd(5)} ${c.id.padEnd(18)} ${c.reason}${c.fix && c.status !== 'pass' ? `  Fix: ${c.fix}` : ''}`);
  lines.push('');
  const fails = report.checks.filter((c) => c.required && c.status === 'fail').length;
  const warns = report.checks.filter((c) => c.status === 'warn').length;
  lines.push(
    report.ok
      ? `ok: every required check passed${warns ? ` (${warns} warning${warns === 1 ? '' : 's'}, optional)` : ''}. Next: npm run dev in a scaffold, or create-redbelly-dapp my-app --yes to make one.`
      : `not ok: ${fails} required check${fails === 1 ? '' : 's'} failed. Run each Fix above, then redbelly-doctor again.`,
  );
  return lines.join('\n') + '\n';
}
