// Builds ../chain-definitions and ../agent-rules if their dist is missing. The CLI imports both at
// runtime (chain helpers, and the failure table for doctor's fix text) and the tests read the built output.
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
for (const [dir, entry] of [['chain-definitions', 'dist/esm/index.js'], ['agent-rules', 'dist/esm/index.js']]) {
  const pkg = resolve(here, '..', '..', dir);
  if (!existsSync(resolve(pkg, 'node_modules'))) {
    console.error(`packages/${dir} has no node_modules. Run: npm ci --prefix ${pkg}`);
    process.exit(1);
  }
  if (!existsSync(resolve(pkg, entry))) {
    console.log(`building packages/${dir}`);
    execSync('npm run build', { cwd: pkg, stdio: 'inherit' });
  }
}
