// Before this server runs forge in a project: is the project allowed to reach outside itself?
//
// Several tools run `forge build` and `forge test` in a folder the AGENT chooses, and `status` is
// called every turn. Foundry's `ffi = true` lets a test run any shell command, and a wide
// `fs_permissions` entry lets one read or write the user's files. A cloned project could carry
// either, so a tool that looked read-only ran arbitrary code with no prompt (audit of 2026-09-19).
// The answer here is a refusal with no override: an agent must not be able to grant this to itself.
// The user can always run forge by hand after reading the tests.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseToml } from '@gatedpath/preflight';

/** Why forge must not be run here, or null when nothing in the project's Foundry config reaches outside it. */
export function forgeRefusal(project: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (/^(1|true)$/i.test(env['FOUNDRY_FFI'] ?? '')) return 'FOUNDRY_FFI is set in this server\'s environment, which lets a project\'s tests run shell commands. Unset it.';
  const root = resolve(project);
  for (const dir of [root, join(root, 'contracts')]) {
    const file = join(dir, 'foundry.toml');
    if (!existsSync(file)) continue;
    let toml: Record<string, unknown>;
    try {
      toml = parseToml(readFileSync(file, 'utf8')) as Record<string, unknown>;
    } catch {
      return `${file} could not be parsed, so this server cannot tell what forge would be allowed to do. Fix the file first.`;
    }
    // The parser returns one flat key per table (`profile.default`) and leaves an inline table as its
    // text, so the path of each fs_permissions entry is read out of that text.
    for (const [key, table] of Object.entries(toml)) {
      if (key !== 'profile' && !key.startsWith('profile.')) continue;
      const profile = (table ?? {}) as Record<string, unknown>;
      const name = key.slice('profile.'.length) || 'default';
      if (profile['ffi'] === true) {
        return `${file} sets ffi = true (profile ${name}), which lets this project's tests run shell commands on your machine. This server will not run forge there. Remove the line, or run forge yourself after reading the tests.`;
      }
      const perms = profile['fs_permissions'];
      const text = Array.isArray(perms) ? perms.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ') : '';
      for (const m of text.matchAll(/path\\?"?\s*[=:]\s*\\?"([^"\\]*)\\?"/g)) {
        const path = m[1]!;
        const rel = relative(dir, resolve(dir, path));
        if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
          return `${file} gives forge file access to "${path}" (profile ${name}), which is the whole project or somewhere outside it. This server will not run forge there. Narrow it to a folder such as ./deployments.`;
        }
      }
    }
  }
  return null;
}
