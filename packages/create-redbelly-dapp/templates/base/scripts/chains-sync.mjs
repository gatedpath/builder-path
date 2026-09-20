// Regenerates contracts/script/Redbelly.sol from the vendored @gatedpath/chains
// package so the Solidity constants never drift from the verified addresses. The renderer
// itself is vendored beside the package by the scaffolder.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const chains = await import('@gatedpath/chains');
const { renderRedbellySol } = await import(resolve(root, 'vendor/redbelly-chains/render-sol.mjs'));
const out = resolve(root, 'contracts/script/Redbelly.sol');
writeFileSync(out, renderRedbellySol(chains));
console.log(`wrote ${out}`);
