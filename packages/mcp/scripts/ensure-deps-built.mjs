// Builds the sibling packages this server imports (chains, agent-rules, preflight) when their
// dist is missing. They are file: dependencies, so npm links them without building.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const packages = resolve(here, '..', '..');
for (const [name, entry] of [
  ['chain-definitions', 'dist/esm/index.js'],
  ['agent-rules', 'dist/esm/index.js'],
  ['preflight', 'dist/index.js'],
]) {
  const dir = resolve(packages, name);
  if (!existsSync(resolve(dir, 'node_modules'))) {
    console.error(`packages/${name} has no node_modules. Run: npm ci --prefix ${dir}`);
    process.exit(1);
  }
  if (!existsSync(resolve(dir, entry))) {
    console.log(`building packages/${name}`);
    execSync('npm run build', { cwd: dir, stdio: 'inherit' });
  }
}
