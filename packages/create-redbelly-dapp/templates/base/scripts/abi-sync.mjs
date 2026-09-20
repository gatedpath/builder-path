// Copies the template contract's ABI from contracts/out into web/src/abi so the front end
// and the compiled contract cannot disagree. Run after `forge build`. `--check` only compares.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const name = '__CONTRACT_NAME__';
const src = resolve(root, `contracts/out/${name}.sol/${name}.json`);
if (!existsSync(src)) {
  console.error(`${src} not found; run forge build first`);
  process.exit(1);
}
const abi = JSON.parse(readFileSync(src, 'utf8')).abi;
const dest = resolve(root, `web/src/abi/${name}.json`);
const next = JSON.stringify(abi, null, 2) + '\n';
const same = existsSync(dest) && readFileSync(dest, 'utf8') === next;
if (process.argv.includes('--check')) {
  console.log(same ? `${dest} matches the build` : `${dest} differs from the build; run abi:sync`);
  process.exit(same ? 0 : 1);
}
if (same) console.log(`${dest} already matches`);
else {
  writeFileSync(dest, next);
  console.log(`wrote ${dest}`);
}
