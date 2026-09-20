#!/usr/bin/env node
// Structural check for every recipes/*/recipe.json: required sections present, every verify
// marker carries a reason, every source carries a date, the request id is a uint64, and the
// README mentions the recipe id. Run: node recipes/check.mjs
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const required = ['id', 'title', 'status', 'criterion', 'credential', 'query', 'onChain', 'fiveStates', 'privacy', 'verify', 'sources', 'open'];
const states = ['NeverIssued', 'Valid', 'Expired', 'Revoked', 'WrongJurisdiction'];
let problems = 0;
const say = (m) => { problems++; console.error(`  ${m}`); };

for (const dir of readdirSync(here, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const file = join(here, dir, 'recipe.json');
  if (!existsSync(file)) { console.error(`${dir}: no recipe.json`); problems++; continue; }
  const r = JSON.parse(readFileSync(file, 'utf8'));
  console.log(`${dir}: ${r.title ?? '?'} [${r.status ?? '?'}]`);
  for (const k of required) if (!(k in r)) say(`missing "${k}"`);
  if (r.id !== dir) say(`id "${r.id}" does not match folder "${dir}"`);
  if (!['draft', 'tested-on-testnet', 'tested-on-mainnet'].includes(r.status)) say(`status "${r.status}" is not draft, tested-on-testnet or tested-on-mainnet`);
  for (const s of states) if (!r.fiveStates?.[s]) say(`fiveStates.${s} missing`);
  for (const v of r.verify ?? []) if (!v.what || !v.why) say(`verify marker needs what and why: ${JSON.stringify(v)}`);
  for (const s of r.sources ?? []) if (!/^\d{4}-\d{2}-\d{2}$/.test(s.checked ?? '')) say(`source without a checked date: ${s.what ?? JSON.stringify(s)}`);
  const rid = r.onChain?.requestId;
  if (!(Number.isInteger(rid) && rid >= 0 && rid <= 2 ** 53)) say(`onChain.requestId must be a small non-negative integer, got ${JSON.stringify(rid)}`);
  if (r.query?.mechanism === 'iden3' && r.query?.request?.id !== rid) say(`query.request.id (${r.query?.request?.id}) must equal onChain.requestId (${rid})`);
  for (const k of ['leavesWallet', 'landsOnChain', 'neverOnChain']) if (!Array.isArray(r.privacy?.[k]) || r.privacy[k].length === 0) say(`privacy.${k} must be a non-empty list`);
  const readme = join(here, dir, 'README.md');
  if (!existsSync(readme)) say('no README.md');
  else if (!readFileSync(readme, 'utf8').includes(r.title)) say('README.md does not carry the recipe title');
  const verifyCount = (r.verify ?? []).length;
  console.log(`  ${verifyCount} verify marker${verifyCount === 1 ? '' : 's'}, ${(r.sources ?? []).length} sources, ${(r.open ?? []).length} open question refs`);
}
if (problems) { console.error(`\n${problems} problem${problems === 1 ? '' : 's'}`); process.exit(1); }
console.log('\nall recipes carry every section');
