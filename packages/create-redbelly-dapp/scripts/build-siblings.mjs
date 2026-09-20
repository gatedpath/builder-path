// Builds chain-definitions, agent-rules, the frontend kit and preflight when their dist is missing, so the tests and
// the scaffolder can load them. Nothing here runs at scaffold time for an end user.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { siblingRoot, SIBLINGS } from '../src/siblings.mjs';

for (const key of ['chains', 'agentRules', 'frontendKit', 'preflight']) {
  const root = siblingRoot(key);
  if (!root) throw new Error(`${SIBLINGS[key].name} not found`);
  if (!existsSync(resolve(root, 'node_modules'))) {
    console.log(`npm ci in ${root}`);
    execSync('npm ci --no-audit --no-fund', { cwd: root, stdio: 'inherit' });
  }
  if (!existsSync(resolve(root, SIBLINGS[key].entry))) {
    console.log(`building ${SIBLINGS[key].name}`);
    execSync('npm run build', { cwd: root, stdio: 'inherit' });
  }
}
