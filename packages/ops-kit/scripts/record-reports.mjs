#!/usr/bin/env node
// Runs the three Routescan scripts read-only against a live token on mainnet and writes their
// output under reports/ with the date, so the README can point at a run that happened. WRBNT
// (0x6ed1…6076) is used because it is the busiest ERC-20 on 151 on the day this was written;
// nothing of ours is deployed yet. Keyless, paced; about six API calls.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const reports = resolve(here, '..', 'reports');
mkdirSync(reports, { recursive: true });
const token = process.argv[2] ?? '0x6ed1f491e2d31536d6561f6bdb2adc8f092a6076';
const network = process.argv[3] ?? 'mainnet';
const date = new Date().toISOString().slice(0, 10);

const runs = [
  ['routescan-transfers', ['scripts/routescan-transfers.mjs', token, '--network', network, '--limit', '10']],
  ['routescan-holders', ['scripts/routescan-holders.mjs', token, '--network', network, '--limit', '10']],
  ['routescan-verified', ['scripts/routescan-verified.mjs', token, '--network', network]],
];
let md = `# Routescan script runs, ${date}\n\nRead-only, keyless, against ${network} for token ${token}. Each block is the exact output of the command above it.\n`;
for (const [name, args] of runs) {
  const r = spawnSync(process.execPath, args, { cwd: resolve(here, '..'), encoding: 'utf8' });
  md += `\n## ${name}\n\n\`\`\`\n$ node ${args.join(' ')}\n${(r.stdout + r.stderr).trim()}\n(exit ${r.status})\n\`\`\`\n`;
  console.log(`${name}: exit ${r.status}`);
}
const file = resolve(reports, `routescan-${network}-${date}.md`);
writeFileSync(file, md);
console.log(`wrote ${file}`);
