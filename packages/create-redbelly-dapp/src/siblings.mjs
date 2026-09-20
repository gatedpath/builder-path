// Finds the packages the scaffolder consumes. Until they are published they live beside
// this package in the repository; when they are, an installed dependency wins.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packagesDir = resolve(here, '..', '..');
const require = createRequire(import.meta.url);

export const SIBLINGS = Object.freeze({
  chains: { name: '@gatedpath/chains', dir: 'chain-definitions', entry: 'dist/esm/index.js' },
  agentRules: { name: '@gatedpath/agent-rules', dir: 'agent-rules', entry: 'dist/esm/index.js' },
  receptorMock: { name: '@gatedpath/receptor-mock', dir: 'receptor-mock', entry: null },
  contractKit: { name: '@gatedpath/contract-kit', dir: 'contract-kit', entry: null },
  frontendKit: { name: '@gatedpath/frontend-kit', dir: 'frontend-kit', entry: 'dist/index.js' },
  preflight: { name: '@gatedpath/preflight', dir: 'preflight', entry: 'dist/doctor-cli.js' },
});

/** Climbs from a file inside a package to the folder whose package.json carries `name`; null if none. */
export function packageRootFrom(file, name) {
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    const manifest = resolve(dir, 'package.json');
    if (existsSync(manifest)) {
      try { if (JSON.parse(readFileSync(manifest, 'utf8')).name === name) return dir; } catch { /* keep climbing */ }
    }
    if (dirname(dir) === dir) return null;
  }
}

/** Root directory of a sibling package, or null when it is neither installed nor beside us. */
export function siblingRoot(key) {
  const s = SIBLINGS[key];
  // Look the folder up on disk, never through `require.resolve('<name>/package.json')`: a package
  // whose `exports` map does not list ./package.json refuses that, and 0.1.0 on npm failed on it.
  for (const dir of require.resolve.paths(s.name) ?? []) {
    const installed = resolve(dir, s.name);
    if (existsSync(resolve(installed, 'package.json'))) return installed;
  }
  // No node_modules folder to walk (Yarn Plug'n'Play): ask the resolver, first for package.json
  // where the exports map allows it, then for the entry point, climbing to the package's root.
  // Three ways to ask, because a package may export only some of them: its package.json, a CommonJS
  // entry, or (frontend-kit) an ES module entry alone, which only `import.meta.resolve` will find.
  const asks = [
    () => require.resolve(`${s.name}/package.json`),
    () => require.resolve(s.name),
    () => fileURLToPath(import.meta.resolve(s.name)),
  ];
  for (const ask of asks) {
    try {
      const root = packageRootFrom(ask(), s.name);
      if (root) return root;
    } catch { /* not exported that way, or not installed: try the next */ }
  }
  const local = resolve(packagesDir, s.dir);
  return existsSync(resolve(local, 'package.json')) ? local : null;
}

/** Root directory of a built sibling; throws with the build command when dist is missing. */
export function builtSibling(key) {
  const s = SIBLINGS[key];
  const root = siblingRoot(key);
  if (!root) throw new Error(`${s.name} not found: expected it installed or at ${resolve(packagesDir, s.dir)}`);
  if (s.entry && !existsSync(resolve(root, s.entry))) {
    throw new Error(`${s.name} is not built. Run: npm ci --prefix ${root} && npm run build --prefix ${root}`);
  }
  return root;
}

export async function loadSibling(key) {
  const root = builtSibling(key);
  return import(resolve(root, SIBLINGS[key].entry));
}

export function siblingVersion(key) {
  const root = builtSibling(key);
  return JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;
}
