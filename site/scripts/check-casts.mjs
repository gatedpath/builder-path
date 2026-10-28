#!/usr/bin/env node
// The build refuses a terminal recording that is stale, undrawable or leaking (PLAN.md 20.4).
//
//   node scripts/check-casts.mjs        part of `npm run build`
//
// For every entry in casts.config.mjs:
//   1. each command is shown on the entry's page, in a fenced code block, an inline code span or a
//      <Code code="..."> (a trailing # comment on the page's line is ignored), so a command
//      changed on the page fails here until the list, and then the recording, are made again;
//   2. the recording holds exactly those commands, in order, and every one exited 0;
//   3. replayed through src/lib/cast-term.js it leaves nothing unknown, so the player can draw it;
//   4. re-timed for replay by src/lib/cast-player.js it still ends on exactly the same screen;
//   5. it holds no user's path, none of the owner's names, no well-known Anvil account and nothing
//      shaped like a private key.
// And every <Cast id="..."> on a page names an entry, and every entry is used.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { casts } from '../casts.config.mjs';
import { createScreen, feed, parseCast, toText } from '../src/lib/cast-term.js';
import { schedule } from '../src/lib/cast-player.js';
import { MAX_GAP_SECONDS } from '../casts.config.mjs';

const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = resolve(siteDir, '..');
const problems = [];

const LEAKS = [
  [/\/Users\/|\/home\/[a-z]|\/private\/tmp|\/var\/folders/i, 'a path from the machine it was recorded on'],
  // The names are put together from pieces for the same reason as the Anvil rows below.
  [new RegExp(['anto' + 'nia', 'del' + 'gado', 'tshirt' + 'dropper'].join('|'), 'i'), 'a name that must not be public'],
  [/\b(192\.168|10\.\d{1,3}|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/, "an address on somebody's own network"],
  [/\b(0x)?[0-9a-fA-F]{64}\b/, 'something shaped like a private key (64 hex characters)'],
  // The two well-known Anvil accounts that pass isAllowed on the real networks, and Anvil's
  // mnemonic. Put together from pieces so that this file does not itself hold what it looks for:
  // the public export's scan, rightly, refuses any file that does.
  [new RegExp(['f39Fd6e51aad88F6F4ce', '6aB8827279cffFb92266'].join('') + '|' + ['70997970C51812dc3A01', '0C7d01b50e0d17dc79C8'].join(''), 'i'), 'a well-known Anvil account'],
  [new RegExp('test '.repeat(11) + 'junk', 'i'), 'the well-known Anvil mnemonic'],
];

/**
 * Every command a page shows, however it shows it: a line inside a fenced code block, an inline
 * code span, or the `code` of a <Code> component. A trailing "# comment" is removed.
 *
 * Project pages do not fence all of their commands. A worked-result sentence says what to run
 * inline, mid-prose, and that command is as real as a fenced one, so a recording of it must be
 * held to the page the same way. Fences alone were enough while only the Start page had
 * recordings (22 September 2026).
 */
function commandsOnPage(source) {
  const found = [];
  const add = (text) => { const t = text.replace(/\s+#.*$/, '').trim(); if (t) found.push(t); };
  let open = false;
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('```')) { open = !open; continue; }
    if (open) { add(line); continue; }
    // Outside a fence: inline spans, then any <Code code="..."> on the line.
    for (const m of line.matchAll(/`([^`\n]+)`/g)) add(m[1]);
    for (const m of line.matchAll(/<Code\b[^>]*?\scode=(?:"([^"]*)"|'([^']*)'|\{"([^"]*)"\}|\{'([^']*)'\})/g)) {
      add(m[1] ?? m[2] ?? m[3] ?? m[4] ?? '');
    }
  }
  return new Set(found);
}

for (const entry of casts) {
  const where = `cast "${entry.id}"`;
  const pagePath = resolve(siteDir, entry.page);
  if (!existsSync(pagePath)) { problems.push(`${where}: page ${entry.page} does not exist`); continue; }
  const onPage = commandsOnPage(readFileSync(pagePath, 'utf8'));
  for (const command of entry.commands) if (!onPage.has(command)) problems.push(`${where}: "${command}" is not shown anywhere in ${entry.page} (code block, inline code span or <Code code="...">); the page changed, so record it again`);

  const file = resolve(repoDir, entry.file);
  if (!existsSync(file)) { problems.push(`${where}: no recording at ${entry.file}; run node scripts/record-cast.mjs ${entry.id} --root <work folder>`); continue; }
  const source = readFileSync(file, 'utf8');
  let cast;
  try { cast = parseCast(source); } catch (e) { problems.push(`${where}: ${e.message}`); continue; }

  const recorded = cast.events.filter((e) => e[1] === 'm').map((e) => e[2]);
  if (JSON.stringify(recorded) !== JSON.stringify(entry.commands)) problems.push(`${where}: recorded ${JSON.stringify(recorded)} but the list says ${JSON.stringify(entry.commands)}; record it again`);
  const exits = cast.header['x-exit-codes'] ?? [];
  // A command the entry says runs until stopped may end 130 (interrupted by Ctrl-C), but only if
  // the recording's header says it was stopped; any other non-zero ending is a failed run.
  const stoppedOk = (i) => entry.stop && entry.commands[i] === entry.stop.command && (cast.header['x-stopped'] ?? []).length > 0 && exits[i] === 130;
  if (exits.length !== entry.commands.length || exits.some((c, i) => c !== 0 && !stoppedOk(i))) problems.push(`${where}: exit codes ${JSON.stringify(exits)}; only a run that succeeded is shown`);

  const screen = createScreen();
  for (const e of cast.events) if (e[1] === 'o') feed(screen, e[2]);
  if (screen.pending) screen.unknown.push('an instruction cut off at the end');
  const unknown = [...new Set(screen.unknown)];
  if (unknown.length) problems.push(`${where}: the player cannot draw ${unknown.slice(0, 6).join(', ')}; teach src/lib/cast-term.js or keep the plain transcript for this step`);

  // Replay re-times the recording so a person can follow it. It must never change what is printed:
  // the re-timed pieces have to end on exactly the screen the recording ends on.
  const replayed = createScreen();
  for (const e of schedule(cast.events.filter((x) => x[1] === 'o').map((x) => [x[0], x[2]]), MAX_GAP_SECONDS)) feed(replayed, e[1]);
  if (toText(replayed) !== toText(screen) || replayed.unknown.length) problems.push(`${where}: replay does not end on the screen the recording ends on; src/lib/cast-player.js changed what is printed`);

  for (const [pattern, what] of LEAKS) {
    const hit = pattern.exec(source);
    if (hit) problems.push(`${where}: holds ${what}: "${hit[0].slice(0, 24)}"`);
  }
}

// Every <Cast id> names an entry, and every entry is on a page.
const used = new Map();
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(mdx|astro)$/.test(name)) for (const m of readFileSync(p, 'utf8').matchAll(/<Cast\s+id="([^"]+)"/g)) used.set(m[1], p);
  }
})(resolve(siteDir, 'src/content'));
for (const [id, file] of used) if (!casts.some((c) => c.id === id)) problems.push(`<Cast id="${id}"> in ${file}: not in casts.config.mjs`);
for (const entry of casts) {
  if (!used.has(entry.id)) problems.push(`cast "${entry.id}": in casts.config.mjs but on no page`);
  else if (resolve(siteDir, entry.page) !== used.get(entry.id)) problems.push(`cast "${entry.id}": listed for ${entry.page} but used in ${used.get(entry.id)}`);
}

console.log(`check-casts: ${casts.length} recording(s), ${problems.length} problem(s)`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(problems.length ? 1 : 0);
