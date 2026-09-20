// Builds ../chain-definitions if its dist is missing. The sync script and the tests read
// that package's built output; nothing at runtime does.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const chains = resolve(here, '..', '..', 'chain-definitions');
const dist = resolve(chains, 'dist', 'esm', 'index.js');

if (!existsSync(resolve(chains, 'node_modules'))) {
  console.error(`packages/chain-definitions has no node_modules. Run: npm ci --prefix ${chains}`);
  process.exit(1);
}
if (!existsSync(dist)) {
  console.log('building packages/chain-definitions');
  execSync('npm run build', { cwd: chains, stdio: 'inherit' });
}
