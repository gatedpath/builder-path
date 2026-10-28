#!/usr/bin/env node
// Records one entry of casts.config.mjs: runs its commands inside a real terminal, one after the
// other, and writes what they printed, and when, in asciinema's version 2 format.
//
//   node scripts/record-cast.mjs <id> --root <an empty work folder>
//
// A real terminal matters: a program that finds none switches its colours, spinners and progress
// bars off. The terminal comes from Python's standard `pty` module, which macOS and Linux both
// have; nothing is installed for this. The commands run with no input attached, so anything that
// asks a question fails rather than waits.
//
// Two things are changed in what was printed, both by this script and both named in the file's
// header, never by hand afterwards: the work folder's path is written as ~/code and the home
// folder's as ~, so a recording does not carry the name of the machine's user. check-casts.mjs
// then refuses any recording that still holds a user path or anything shaped like a key.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync, existsSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { dirname, resolve } from 'node:path';
import { homedir, networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { casts } from '../casts.config.mjs';

// 80 by 24, the classic window. The page sizes its text so that exactly 80 columns fit the view
// (Cast.astro), so what a tool lays out for this width is what the reader sees, unwrapped.
const COLS = 80;
const ROWS = 24;
const siteDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoDir = resolve(siteDir, '..');

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const rootArg = args[args.indexOf('--root') + 1];
const entry = casts.find((c) => c.id === id);
if (!entry || !args.includes('--root') || !rootArg) {
  console.error(`usage: node scripts/record-cast.mjs <id> --root <work folder>\n  ids: ${casts.map((c) => c.id).join(', ')}`);
  process.exit(2);
}
mkdirSync(rootArg, { recursive: true });
const root = realpathSync(rootArg);
const cwd = resolve(root, entry.cwd);
// npm starts with an empty cache of its own beside the work folder, as it would on a machine that
// has never seen these packages. With this machine's warm cache the scaffold step took 0.3 s, which
// is true here and would mislead a reader about their own first run.
const npmCache = `${root}-npm-cache`;
mkdirSync(npmCache, { recursive: true });
if (!existsSync(cwd)) { console.error(`record-cast: ${cwd} does not exist; record the earlier steps first`); process.exit(2); }

// Longest first, so the work folder inside the home folder is not half replaced.
const home = realpathSync(homedir());
// This machine's addresses on its own network (a dev server prints one) say where it was recorded.
const ownAddresses = Object.values(networkInterfaces()).flat().filter((n) => n && !n.internal && n.family === 'IPv4').map((n) => [n.address, '<this machine>']);
const redactions = [...ownAddresses, [`${root}-npm-cache`, '~/.npm'], [root, '~/code'], [rootArg, '~/code'], [home, '~'], [homedir(), '~']]
  .filter(([from], i, all) => from && all.findIndex(([f]) => f === from) === i)
  .sort((a, b) => b[0].length - a[0].length);
const redact = (text) => redactions.reduce((t, [from, to]) => t.split(from).join(to), text);

const PTY = `
import os, pty, sys, fcntl, termios, struct, signal
cols, rows, cmd = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
pid, fd = pty.fork()
if pid == 0:
    fcntl.ioctl(1, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
    # Output is a terminal; input is nothing at all. A command that asks a question reads
    # end-of-file and carries on or fails. It can never sit waiting for an answer.
    null = os.open(os.devnull, os.O_RDONLY)
    os.dup2(null, 0)
    os.close(null)
    os.execvp('/bin/sh', ['/bin/sh', '-c', cmd])
# Ctrl-C, the way a person sends it: the character goes to the terminal, and the terminal
# interrupts whatever is running in it. The recorder asks for this with SIGINT (see "stop" below).
signal.signal(signal.SIGINT, lambda *_: os.write(fd, b'\x03'))
while True:
    try:
        data = os.read(fd, 65536)
    except OSError:
        break
    if not data:
        break
    os.write(1, data)
_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status))
`;

const started = Date.now();
const now = () => Number(((Date.now() - started) / 1000).toFixed(3));
const events = [];
const exits = [];
const stopped = [];

function run(command) {
  return new Promise((done) => {
    events.push([now(), 'm', command]);
    events.push([now(), 'o', `$ ${command}\r\n`]);
    const env = { PATH: process.env.PATH, HOME: homedir(), TERM: 'xterm-256color', LANG: 'en_US.UTF-8', COLUMNS: String(COLS), LINES: String(ROWS), NO_UPDATE_NOTIFIER: '1', npm_config_update_notifier: 'false', npm_config_cache: npmCache };
    const child = spawn('python3', ['-c', PTY, String(COLS), String(ROWS), command], { cwd, env, stdio: ['ignore', 'pipe', 'inherit'] });
    // No step here takes ten minutes. One that does has hung, and is stopped.
    const ceiling = setTimeout(() => { console.error(`\nrecord-cast: "${command}" ran past 10 minutes; stopping it`); child.kill('SIGKILL'); }, 600_000);
    child.on('close', () => clearTimeout(ceiling));
    const decoder = new StringDecoder('utf8');
    let held = '';
    // A command that runs until it is stopped (npm run dev). The entry says what to wait for and
    // how long to let it run after that; then Ctrl-C, as a person would, and the header says so.
    const stop = entry.stop && entry.stop.command === command ? entry.stop : null;
    let seen = '';
    let stopTimer;
    const emit = (text, final) => {
      held += text;
      // Only whole lines are let go (a line ends at a newline or a carriage return), so a path is
      // never cut in two with half of it already written out. The rest waits for its line end, or
      // for the moment of quiet below.
      const cut = final ? held.length : Math.max(held.lastIndexOf('\n'), held.lastIndexOf('\r')) + 1;
      const out = redact(held.slice(0, cut));
      held = held.slice(cut);
      if (out) { events.push([now(), 'o', out]); process.stdout.write(out); }
      if (stop && out && !stopTimer) {
        seen = (seen + out).slice(-2000);
        if (seen.includes(stop.when)) {
          stopTimer = setTimeout(() => { stopped.push({ command, when: stop.when, afterSeconds: stop.afterSeconds }); child.kill('SIGINT'); }, stop.afterSeconds * 1000);
        }
      }
    };
    // A line with no ending yet (a prompt, a progress bar) is let go after a moment of quiet, so it
    // is not shown late when a long wait follows it. The two halves of a path split between two
    // pieces arrive far closer together than this.
    let quiet;
    child.stdout.on('data', (chunk) => {
      clearTimeout(quiet);
      emit(decoder.write(chunk), false);
      quiet = setTimeout(() => emit('', true), 40);
    });
    child.on('close', (code) => { clearTimeout(quiet); clearTimeout(stopTimer); emit(decoder.end(), true); exits.push(code); done(code); });
  });
}

for (const command of entry.commands) {
  const code = await run(command);
  // A command we stopped with Ctrl-C may report 130 (interrupted); that is the expected ending.
  const wasStopped = stopped.some((x) => x.command === command);
  if (code !== 0 && !(wasStopped && code === 130)) { console.error(`\nrecord-cast: "${command}" exited ${code}; nothing written`); process.exit(1); }
}

const version = (cmd, argv) => { try { return execFileSync(cmd, argv, { encoding: 'utf8' }).split('\n')[0].trim(); } catch { return null; } };
const header = {
  version: 2, width: COLS, height: ROWS,
  timestamp: Math.floor(started / 1000),
  duration: now(),
  title: entry.title,
  env: { TERM: 'xterm-256color', SHELL: '/bin/sh' },
  'x-id': entry.id,
  'x-commands': entry.commands,
  'x-exit-codes': exits,
  ...(stopped.length ? { 'x-stopped': stopped.map((x) => `"${x.command}" was stopped with Ctrl-C ${x.afterSeconds} s after it printed "${x.when}"`) } : {}),
  'x-tools': { node: process.version, npm: version('npm', ['--version']), forge: version('forge', ['--version']) },
  'x-conditions': ['npm cache empty at the start of the first recording in this work folder'],
  'x-redactions': ['the work folder is written as ~/code', 'the home folder is written as ~', "this machine's address on its own network is written as <this machine>"],
  'x-recorder': 'site/scripts/record-cast.mjs',
};
const target = resolve(repoDir, entry.file);
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, [JSON.stringify(header), ...events.map((e) => JSON.stringify(e))].join('\n') + '\n');
console.error(`\nrecord-cast: ${entry.id}: ${entry.commands.length} command(s), ${events.length} events, ${header.duration} s -> ${entry.file}`);
