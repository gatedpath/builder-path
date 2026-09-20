// Writes abi/GatedERC20.json from forge's build output so the scaffolder's web template, the
// frontend kit's demo page and the ops kit's subgraph read one ABI and cannot drift from the
// compiled contract. Run after `forge build`. `--check` only compares (CI and the tests use it).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const src = resolve(root, 'out/GatedERC20.sol/GatedERC20.json');
if (!existsSync(src)) {
  console.error(`${src} not found; run forge build first`);
  process.exit(1);
}
const abi = JSON.parse(readFileSync(src, 'utf8')).abi;
const dest = resolve(root, 'abi/GatedERC20.json');
const next = JSON.stringify(abi, null, 2) + '\n';
const same = existsSync(dest) && readFileSync(dest, 'utf8') === next;
if (process.argv.includes('--check')) {
  console.log(same ? `${dest} matches the build` : `${dest} differs from the build; run npm run abi:export`);
  process.exit(same ? 0 : 1);
}
if (same) console.log(`${dest} already matches`);
else {
  writeFileSync(dest, next);
  console.log(`wrote ${dest}`);
}
