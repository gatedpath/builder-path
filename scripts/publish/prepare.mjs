#!/usr/bin/env node
// Before `npm publish`: point a package's `file:../<sibling>` dependencies at the sibling's published
// version. In the repository the nine packages link to each other by path (each has its own lockfile
// and `npm ci`); on npm they depend on each other by version. The workflow runs this after `npm ci`
// and before `npm publish`, so the lockfile is untouched and the tarball carries versions.
//
//   node scripts/publish/prepare.mjs <package dir> [--check]
//
// --check only reports what would change (used by the tests and by a dry run). Exit 2 when a
// sibling cannot be found or its version is missing; nothing is written then.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const check = args.includes('--check');
const target = resolve(args.find((a) => !a.startsWith('--')) ?? process.cwd());
const pkgPath = join(target, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const changes = [];
let failed = false;

for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
  for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
    const m = /^file:(.+)$/.exec(spec);
    if (!m) continue;
    const siblingPath = join(target, m[1], 'package.json');
    let sibling;
    try {
      sibling = JSON.parse(readFileSync(siblingPath, 'utf8'));
    } catch {
      console.error(`${pkg.name}: ${field}.${name} points at ${siblingPath}, which cannot be read`);
      failed = true;
      continue;
    }
    if (sibling.name !== name || !/^\d+\.\d+\.\d+/.test(sibling.version ?? '')) {
      console.error(`${pkg.name}: ${field}.${name} resolves to ${sibling.name}@${sibling.version}, not a versioned ${name}`);
      failed = true;
      continue;
    }
    // Exact version: the nine ship together from one tag, and a scaffold's vendor record compares exact versions.
    changes.push({ field, name, from: spec, to: sibling.version });
    pkg[field][name] = sibling.version;
  }
}

if (failed) process.exit(2);
for (const c of changes) console.log(`${pkg.name}: ${c.field}.${c.name} ${c.from} -> ${c.to}`);
if (changes.length === 0) console.log(`${pkg.name}: no file: dependencies`);
if (!check) writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
else console.log(check && changes.length ? '(check only, nothing written)' : '');
