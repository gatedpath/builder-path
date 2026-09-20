// Writes src/samples/generated/* and the published copies under public/ from the sources
// named in samples.config.mjs. Run with `npm run samples` after a package changes, then
// commit the result. The build runs check-samples.mjs, which fails on drift.
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { computeExpected, manifestFor, generatedDir, publicDir } from './samples-lib.mjs';

const expected = computeExpected();
mkdirSync(generatedDir, { recursive: true });
for (const f of readdirSync(generatedDir)) rmSync(resolve(generatedDir, f));
for (const s of expected) {
  writeFileSync(resolve(generatedDir, s.file), s.content);
  if (s.publish) {
    const target = resolve(publicDir, s.publish);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, s.fullText);
  }
}
writeFileSync(resolve(generatedDir, 'manifest.json'), JSON.stringify(manifestFor(expected), null, 2) + '\n');
console.log(`extracted ${expected.length} samples into src/samples/generated/`);
