// Does a Slither report exist, and does it describe the sources as they are now? Two ways to
// answer. Preferred: a sidecar `slither.sources.sha256` next to the report holding the hash
// of every .sol file under the source directory at the time Slither ran (the scaffold's
// `npm run lint:slither` writes it); the check recomputes the hash and compares. Fallback,
// when there is no sidecar: times. Checked-out files all share one mtime, so inside a git
// repository "when" means the commit time of the last change, with the working-tree mtime
// taken instead for files that are modified or untracked; outside git, plain mtimes. The
// time rule cannot be satisfied by re-running Slither on a clean project, because a report
// with no findings is byte-identical and git records no new change for it (found on
// 2026-09-12 running the prompt cards), which is why the hash sidecar exists.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { run } from '../proc.js';
import type { CheckResult } from '../types.js';

export const DEFAULT_REPORT_PATHS = ['reports/slither.json', 'reports/slither.md', 'slither.json', 'slither-report.json', 'slither.md'];
/** Sidecar written next to the report: the hash of the sources Slither saw. */
export const SOURCES_HASH_FILE = 'slither.sources.sha256';

/**
 * SHA-256 over every `.sol` file under `dir`, in sorted order of its POSIX relative path:
 * for each file, `<relative path>\n`, the file's bytes, then a NUL byte. The scaffold's
 * `scripts/slither.mjs` computes the same value with the same recipe; keep them in step.
 */
export function hashSources(dir: string): string {
  const files = listFiles(dir)
    .filter((f) => f.endsWith('.sol'))
    .map((f) => ({ rel: relative(dir, f).split(sep).join('/'), abs: f }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const h = createHash('sha256');
  for (const f of files) {
    h.update(`${f.rel}\n`);
    h.update(readFileSync(f.abs));
    h.update('\0');
  }
  return h.digest('hex');
}

export async function checkSlitherReport(project: string, sourceDir: string, reportPath?: string): Promise<CheckResult> {
  const candidates = reportPath ? [reportPath] : DEFAULT_REPORT_PATHS;
  const found = candidates.map((p) => join(project, p)).find((p) => existsSync(p));
  if (!found) {
    return { id: 'slither-report', status: 'fail', reason: `No Slither report at ${candidates.join(', ')}; run slither and commit the report before deploying.`, data: { looked: candidates } };
  }
  const srcAbs = join(project, sourceDir);
  if (!existsSync(srcAbs)) return { id: 'slither-report', status: 'fail', reason: `Source directory ${sourceDir} does not exist under ${project}.`, data: { report: found } };
  const sources = listFiles(srcAbs).filter((f) => f.endsWith('.sol'));
  if (sources.length === 0) return { id: 'slither-report', status: 'fail', reason: `No .sol files under ${sourceDir}.`, data: { report: found } };
  const sidecar = join(dirname(found), SOURCES_HASH_FILE);
  if (existsSync(sidecar)) {
    const recorded = readFileSync(sidecar, 'utf8').trim().toLowerCase();
    const current = hashSources(srcAbs);
    const data = { report: relative(project, found), sidecar: relative(project, sidecar), recordedHash: recorded, currentHash: current, sources: sources.length };
    if (recorded === current) return { id: 'slither-report', status: 'pass', reason: `${data.report} describes the current sources: ${data.sidecar} matches the hash of ${sources.length} .sol file(s) under ${sourceDir}.`, data };
    return { id: 'slither-report', status: 'fail', reason: `${data.report} is stale: the sources under ${sourceDir} no longer match ${data.sidecar}; re-run slither.`, data };
  }
  const times = await fileTimes(project, [found, ...sources]);
  const reportTime = times.get(found) ?? 0;
  let newestSource = '';
  let newestTime = 0;
  for (const s of sources) {
    const t = times.get(s) ?? 0;
    if (t > newestTime) {
      newestTime = t;
      newestSource = s;
    }
  }
  const data = { report: relative(project, found), reportTime: iso(reportTime), newestSource: relative(project, newestSource), newestSourceTime: iso(newestTime), sources: sources.length };
  if (reportTime >= newestTime) return { id: 'slither-report', status: 'pass', reason: `${data.report} (${data.reportTime}) is newer than the newest source ${data.newestSource} (${data.newestSourceTime}).`, data };
  return { id: 'slither-report', status: 'fail', reason: `${data.report} (${data.reportTime}) is older than ${data.newestSource} (${data.newestSourceTime}); re-run slither and write ${SOURCES_HASH_FILE} beside the report (the scaffold's npm run lint:slither does both).`, data };
}

function iso(t: number): string {
  return t ? new Date(t * 1000).toISOString() : 'unknown';
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

/** Unix seconds per file: git commit time, or mtime for dirty, untracked or non-git files. */
async function fileTimes(project: string, files: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const mtime = (f: string) => Math.floor(statSync(f).mtimeMs / 1000);
  const inRepo = await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: project, timeoutMs: 10_000 });
  if (inRepo.code !== 0 || inRepo.stdout.trim() !== 'true') {
    for (const f of files) out.set(f, mtime(f));
    return out;
  }
  // `-z`: NUL-separated and unquoted, so a path with a space is not wrapped in quotes. Both sides are
  // resolved to real paths: git prints the repository's real root, while `project` may have been
  // reached through a symlink (`/tmp` on macOS). Compared as plain strings, an edited source was
  // never seen and a stale report passed (audit of 2026-09-19).
  const status = await run('git', ['status', '--porcelain', '-z', '--untracked-files=all', '--', ...files], { cwd: project, timeoutMs: 30_000 });
  const real = (f: string) => { try { return realpathSync(f); } catch { return f; } };
  const root = repoRoot(project);
  const dirty = new Set(status.stdout.split('\0').filter(Boolean).map((l) => real(join(root, l.slice(3)))));
  for (const f of files) {
    if (dirty.has(real(f))) {
      out.set(f, mtime(f));
      continue;
    }
    const log = await run('git', ['log', '-1', '--format=%ct', '--', f], { cwd: project, timeoutMs: 30_000 });
    const t = Number(log.stdout.trim());
    out.set(f, Number.isFinite(t) && t > 0 ? t : mtime(f));
  }
  return out;
}

let rootCache: { project: string; root: string } | null = null;
/** git status prints paths relative to the repository root, which may be above `project`. */
function repoRoot(project: string): string {
  if (rootCache && rootCache.project === project) return rootCache.root;
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: project, encoding: 'utf8' }).trim();
  rootCache = { project, root };
  return root;
}
