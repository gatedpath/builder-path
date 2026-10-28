// Reads a recording from the run's folder at build. Used by the Cast component (for the text a
// reader sees before pressing Play) and by the page that serves each recording's replay data as a
// file of its own (src/pages/casts/[id].js.ts). Never imported by anything that runs in a browser.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { casts, MAX_GAP_SECONDS } from '../../casts.config.mjs';
import { parseCast } from './cast-term.js';

/** @param {string} id */
export function loadCast(id) {
  const entry = casts.find((c) => c.id === id);
  if (!entry) throw new Error(`cast "${id}": not in casts.config.mjs`);
  const { header, events } = parseCast(readFileSync(resolve(process.cwd(), '..', entry.file), 'utf8'));
  const output = events.filter((e) => e[1] === 'o');
  return { entry, header, output, gap: MAX_GAP_SECONDS };
}
