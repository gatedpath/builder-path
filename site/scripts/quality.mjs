// Runs every quality gate in order: build, astro check, bundle budget, axe, the tooltip
// geometry check, Lighthouse, screenshots. Any failure stops the run with a non-zero exit.
import { spawnSync } from 'node:child_process';
import { siteDir } from './serve.mjs';

const steps = [
  ['npm', ['run', 'build']],
  [process.execPath, ['scripts/check-errors.mjs']],
  ['npx', ['astro', 'check']],
  [process.execPath, ['scripts/budget.mjs']],
  [process.execPath, ['scripts/axe.mjs']],
  [process.execPath, ['scripts/check-tips.mjs']],
  [process.execPath, ['scripts/lighthouse.mjs']],
  [process.execPath, ['scripts/screenshots.mjs']],
];
for (const [cmd, args] of steps) {
  console.log(`\n== ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: siteDir, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
