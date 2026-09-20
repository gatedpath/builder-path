// Where the sibling packages' binaries live, resolved through their package.json so a
// relocated install still finds them. No shell: everything is spawned as argv arrays.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

export function preflightCli(): string {
  const pkg = require.resolve('@gatedpath/preflight/package.json');
  return join(dirname(pkg), 'dist', 'cli.js');
}
