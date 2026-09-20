// Programmatic API the scaffolder will call: write every rules file into a directory,
// or check that what is on disk matches what would be generated.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { formats, render, targetPath } from './render.js';
import type { Format } from './render.js';
import { rulesSource } from './source.js';
import type { RulesSource } from './source.js';

export interface WriteOptions {
  /** Subset of formats to write. Default: all. */
  only?: readonly Format[];
  /** Compute everything, touch nothing. */
  dryRun?: boolean;
  /** Compare with disk instead of writing. `drifted` lists files that differ or are missing. */
  check?: boolean;
  /** Override the source (tests do). */
  source?: RulesSource;
}

export interface WriteResult {
  /** Files written or, in dry-run and check modes, files that would be written. */
  written: string[];
  /** Files already identical on disk. */
  unchanged: string[];
  /** Check mode only: files that differ from the render, or are missing. */
  drifted: string[];
  /** Rendered content by relative path, for callers that want to write it themselves. */
  files: Record<string, string>;
}

export function writeRulesFiles(dir: string, options: WriteOptions = {}): WriteResult {
  const chosen = options.only ?? formats;
  const source = options.source ?? rulesSource;
  const result: WriteResult = { written: [], unchanged: [], drifted: [], files: {} };
  for (const format of chosen) {
    const rel = targetPath[format];
    const abs = join(dir, rel);
    const content = render(format, source);
    result.files[rel] = content;
    const onDisk = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
    if (onDisk === content) {
      result.unchanged.push(rel);
      continue;
    }
    if (options.check) {
      result.drifted.push(rel);
      continue;
    }
    if (options.dryRun) {
      result.written.push(rel);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    result.written.push(rel);
  }
  return result;
}
