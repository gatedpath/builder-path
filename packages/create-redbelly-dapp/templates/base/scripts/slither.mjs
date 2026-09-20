#!/usr/bin/env node
// Runs Slither on contracts/ the way CI does and writes what pre-flight reads: the JSON report
// and, beside it, `slither.sources.sha256`, the hash of every .sol under contracts/src at the
// moment Slither ran. Pre-flight compares that hash with the sources as they are, so a report
// is "fresh" when it describes the current code and stale the moment a source changes, whatever
// git or the file system says about times. A report with no findings is byte-identical from
// run to run, so times alone can never prove it was re-run; the hash can.
//
// The recipe matches `hashSources` in @gatedpath/preflight: for each .sol file under
// src/, sorted by its POSIX relative path, feed `<path>\n`, then the file's bytes, then a NUL.
//
//   __PM_RUN__ lint:slither
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const contracts = resolve(fileURLToPath(new URL('../contracts', import.meta.url)));
const reports = join(contracts, 'reports');
const report = join(reports, 'slither.json');
const sidecar = join(reports, 'slither.sources.sha256');

mkdirSync(reports, { recursive: true });
// Slither refuses to overwrite an existing JSON report.
rmSync(report, { force: true });
rmSync(sidecar, { force: true });

let status = 0;
try {
  execFileSync('slither', ['.', '--config-file', 'slither.config.json', '--json', 'reports/slither.json'], { cwd: contracts, stdio: 'inherit' });
} catch (error) {
  // Slither exits non-zero when it finds anything at or above fail_on; the report is still written.
  status = typeof error.status === 'number' ? error.status : 1;
}
if (!existsSync(report)) {
  console.error('slither wrote no report; is slither 0.11.6 installed (pip install slither-analyzer==0.11.6)?');
  process.exit(status || 1);
}
writeFileSync(sidecar, hashSources(join(contracts, 'src')) + '\n');
console.log(`wrote ${relative(process.cwd(), report)} and ${relative(process.cwd(), sidecar)}`);
process.exit(status);

function hashSources(dir) {
  const files = listFiles(dir)
    .filter((f) => f.endsWith('.sol'))
    .map((f) => ({ rel: relative(dir, f).split(sep).join('/'), abs: f }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const h = createHash('sha256');
  for (const f of files) {
    h.update(`${f.rel}\n`);
    h.update(readFileSync(f.abs));
    h.update('\0');
  }
  return h.digest('hex');
}

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}
