// Scans every added line in the whole git history for secret-shaped text. Streams
// `git log -p --all --unified=0` so nothing is held in memory and a large history still
// finishes in seconds. Only `+` lines count: a deleted secret was added earlier, and that
// addition is what gets flagged. Reports file, commit and kind; never the text.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { scanLine } from '../secrets.js';
import type { CheckResult } from '../types.js';

export interface SecretFinding {
  commit: string;
  file: string;
  kind: string;
  why: string;
}

// Vendor and build roots only, where a project keeps them: the repository root, `contracts/` or
// `hardhat/`. `node_modules` is vendor at any depth. A folder that merely shares a name, such as
// `src/lib/wallet.ts`, is the builder's own code and is scanned (audit of 2026-09-19). The Slither
// sidecar is a bare hash by design.
const IGNORED_PATHS = /(^|\/)node_modules\/|^((contracts|hardhat)\/)?(lib|out|cache|artifacts|typechain(-types)?)\/|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|\.gas-snapshot)$|\.(min\.js|map|svg|png|jpg|pdf|sha256)$/;

/** True when the history scan leaves this path alone. Exported for the tests. */
export function ignoredPath(file: string): boolean {
  return IGNORED_PATHS.test(file);
}
const MAX_FINDINGS = 25;

export async function scanGitHistory(project: string): Promise<{ findings: SecretFinding[]; commits: number; isRepo: boolean; trackedEnv: string[] }> {
  const isRepo = await run('git', ['rev-parse', '--is-inside-work-tree'], project).then((r) => r.code === 0 && r.stdout.trim() === 'true');
  if (!isRepo) return { findings: [], commits: 0, isRepo: false, trackedEnv: [] };

  const tracked = await run('git', ['ls-files', '--', '.env', '.env.*', '**/.env', '**/.env.*'], project);
  const trackedEnv = tracked.stdout.split('\n').map((s) => s.trim()).filter((f) => f && !/\.env\.(example|sample|template)$/.test(f));

  const findings: SecretFinding[] = [];
  const seen = new Set<string>();
  let commits = 0;
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', ['log', '-p', '--all', '--no-color', '--unified=0', '--no-renames', '--format=commit %H', '--', '.'], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
    let commit = '';
    let file = '';
    let skipFile = false;
    const rl = createInterface({ input: child.stdout });
    rl.on('line', (line) => {
      if (line.startsWith('commit ')) {
        commit = line.slice(7, 47);
        commits++;
        return;
      }
      if (line.startsWith('+++ ')) {
        file = line.slice(4).replace(/^b\//, '');
        skipFile = IGNORED_PATHS.test(file);
        return;
      }
      if (line.startsWith('--- ') || line.startsWith('diff ') || line.startsWith('@@') || skipFile) return;
      if (line.startsWith('+')) {
        for (const m of scanLine(line.slice(1))) {
          const key = `${file}:${m.kind}`;
          if (seen.has(key)) continue;
          seen.add(key);
          if (findings.length < MAX_FINDINGS) findings.push({ commit, file, kind: m.kind, why: m.why });
        }
      }
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 || code === null ? resolve() : reject(new Error(`git log exited ${code}: ${stderr.trim()}`))));
  });
  return { findings, commits, isRepo: true, trackedEnv };
}

export async function checkGitSecrets(project: string): Promise<CheckResult> {
  let scan: Awaited<ReturnType<typeof scanGitHistory>>;
  try {
    scan = await scanGitHistory(project);
  } catch (e) {
    return { id: 'git-secrets', status: 'fail', reason: `Could not scan git history: ${(e as Error).message}.` };
  }
  if (!scan.isRepo) return { id: 'git-secrets', status: 'skip', reason: 'Not a git repository, so there is no history to scan.' };
  const data = { commits: scan.commits, findings: scan.findings, trackedEnvFiles: scan.trackedEnv };
  if (scan.findings.length > 0) {
    const first = scan.findings[0]!;
    return {
      id: 'git-secrets',
      status: 'fail',
      reason: `${scan.findings.length} secret-shaped addition${scan.findings.length === 1 ? '' : 's'} in ${scan.commits} commits, first in ${first.file} at ${first.commit.slice(0, 10)} (${first.why}); rotate the key, then rewrite history or start a new repository.`,
      data,
    };
  }
  if (scan.trackedEnv.length > 0) {
    return { id: 'git-secrets', status: 'fail', reason: `${scan.trackedEnv.join(', ')} is tracked by git; a .env file belongs in .gitignore even when it holds no key today.`, data };
  }
  return { id: 'git-secrets', status: 'pass', reason: `No secret-shaped line added in ${scan.commits} commits, and no .env file is tracked.`, data };
}

function run(cmd: string, args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => resolve({ code: null, stdout, stderr: e.message }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
