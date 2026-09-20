#!/usr/bin/env node
// From a fresh clone, the site does not build with `npm ci` alone. Before every build,
// check-samples type-checks three of the packages with their own tsconfig (so a sample on a page can
// never drift from code that compiles), and that needs those packages installed and built. On a
// working machine they always are, which is how this went unnoticed until the public copy was
// cloned into an empty folder on 20 September 2026. A host that builds the site from the repository
// runs this first:  npm ci && npm run setup && npm run build
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packagesDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages');
// Order matters: agent-rules and frontend-kit both build on chain-definitions.
const needed = ['chain-definitions', 'agent-rules', 'frontend-kit'];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

for (const name of needed) {
  const cwd = resolve(packagesDir, name);
  for (const args of [['ci', '--no-audit', '--no-fund'], ['run', 'build']]) {
    console.log(`setup: ${name}: npm ${args.join(' ')}`);
    const r = spawnSync(npm, args, { cwd, stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(`setup: ${name}: npm ${args[0]} failed; the site cannot type-check its samples without it`);
      process.exit(r.status ?? 1);
    }
  }
}
console.log('setup: the three packages the site type-checks are installed and built');
