// Reads KEY=VALUE lines from a project's .env without executing it, for the names the
// scaffolder's templates use (DEPLOYER, ADMIN_SAFE, CHAIN_ID). Values already in the
// process environment win. Nothing here is written back and secrets are not looked for; the
// git-secrets check covers what should never be in that file.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ENV_NAMES = { deployer: 'DEPLOYER', admin: 'ADMIN_SAFE', chain: 'CHAIN_ID', legacyAdmin: 'PREFLIGHT_ADMIN' } as const;

export function readDotEnv(project: string, env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  const file = join(project, '.env');
  if (existsSync(file)) {
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      out[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, '$2').trim();
    }
  }
  for (const name of Object.values(ENV_NAMES)) {
    const v = env[name];
    if (v !== undefined && v !== '') out[name] = v;
  }
  return out;
}
