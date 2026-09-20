#!/usr/bin/env node
// Copies the repository's recipes/ into this package before it is packed, so a scaffolder installed
// from npm can still vendor them. In the repository the scaffolder reads ../../recipes directly and
// this copy is never used (and never committed; see .gitignore). Run by `prepack`.
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyRecipes } from '../src/recipes-copy.mjs';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(pkg, '..', '..', 'recipes');
const dest = join(pkg, 'recipes');
if (!existsSync(join(source, 'over-18', 'recipe.json'))) {
  console.error(`sync-recipes: no recipes at ${source}; refusing to pack a scaffolder that cannot vendor them`);
  process.exit(1);
}
rmSync(dest, { recursive: true, force: true });
const written = copyRecipes(source, dest);
const n = written.filter((f) => f.endsWith('/recipe.json')).length;
console.log(`sync-recipes: ${n} recipes copied into the package`);
