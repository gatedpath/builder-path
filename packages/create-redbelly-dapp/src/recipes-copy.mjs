// The one copy routine for the eligibility recipes: data and prose only, each recipe's recipe.json
// and README, and the library's README. check.mjs stays behind; it validates the library, not a
// project. Used by the scaffolder (into a new project) and by `prepack` (into the package).
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Copies the recipes under `source` into `dest`; returns the paths written, relative to `dest`. */
export function copyRecipes(source, dest) {
  mkdirSync(dest, { recursive: true });
  const written = [];
  if (existsSync(join(source, 'README.md'))) { cpSync(join(source, 'README.md'), join(dest, 'README.md')); written.push('README.md'); }
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory() || !existsSync(join(source, entry.name, 'recipe.json'))) continue;
    mkdirSync(join(dest, entry.name), { recursive: true });
    for (const f of ['recipe.json', 'README.md']) {
      if (!existsSync(join(source, entry.name, f))) continue;
      cpSync(join(source, entry.name, f), join(dest, entry.name, f));
      written.push(`${entry.name}/${f}`);
    }
  }
  return written;
}
