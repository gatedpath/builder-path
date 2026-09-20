// RESEARCH.md question 30: anvil's default accounts pass permission.isAllowed on both real
// networks, so nothing this kit ships may suggest them, even in an example. This test reads
// every source, built and documentation file and refuses the ten well-known addresses, any
// 64-hex value that could be a key, and any twelve-word run from the BIP-39 list would be
// overkill here: the preflight package's scanner covers git history for scaffolds.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

// The first two are the ones RESEARCH.md records as allowed on 151 and 153; the rest are the
// same derivation path. Lower-cased so the comparison is case-insensitive.
const ANVIL_DEFAULT_ACCOUNTS = [
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
  '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
  '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65',
  '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
  '0x976ea74026e726554db657fa54763abd0c3a0aa9',
  '0x14dc79964da2c08b23698b3d3cc7ca32193d9955',
  '0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f',
  '0xa0ee7a142d267c1f36714e4a8f75612f20a79720',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|css|md|json)$/.test(entry)) out.push(p);
  }
  return out;
}

describe('hygiene', () => {
  const files = walk(root);

  it('scans something', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    const rel = file.slice(root.length + 1);
    it(`${rel} names no anvil default account and no key-shaped value`, () => {
      const text = readFileSync(file, 'utf8');
      const lower = text.toLowerCase();
      // This file is the one place the addresses are allowed to appear.
      if (!rel.endsWith('hygiene.test.ts')) {
        for (const a of ANVIL_DEFAULT_ACCOUNTS) expect(lower.includes(a), `${rel} mentions ${a}`).toBe(false);
      }
      expect(/(^|[^0-9a-f])0x[0-9a-f]{64}([^0-9a-f]|$)/i.test(text), `${rel} has a 64-hex value`).toBe(false);
      expect(/private_key\s*=\s*\S/i.test(text), `${rel} sets a private key`).toBe(false);
    });
  }
});
