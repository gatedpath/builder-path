// Splices the rendered CLAUDE.md into README.md between the sample markers. The tests
// assert the README block equals the render, so run this after changing the source.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderClaude } from '../dist/esm/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const readme = resolve(here, '..', 'README.md');
const START = '<!-- sample:start -->';
const END = '<!-- sample:end -->';
const text = readFileSync(readme, 'utf8');
const a = text.indexOf(START);
const b = text.indexOf(END);
if (a < 0 || b < 0 || b < a) throw new Error('README.md is missing the sample markers');
const block = `${START}\n\`\`\`\`markdown\n${renderClaude()}\`\`\`\`\n${END}`;
writeFileSync(readme, text.slice(0, a) + block + text.slice(b + END.length));
console.log('README.md sample updated');
