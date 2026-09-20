// Spots secret-shaped text. Used by the git-history check here and by the MCP server's
// argument guard. It reports the kind of match and where, never the matched text.
import { keccak256Hex } from '@gatedpath/chains';
import { BIP39_ENGLISH } from './bip39-words.js';

export type SecretKind = 'hex64' | 'hex64-keyword' | 'key-assignment' | 'mnemonic' | 'keystore-json';

export interface SecretMatch {
  readonly kind: SecretKind;
  /** Why this counts. One sentence, no secret material. */
  readonly why: string;
}

const HEX64 = /(?<![0-9a-fA-F])(0x)?[0-9a-fA-F]{64}(?![0-9a-fA-F])/g;
// Word edges that treat `_` as an edge. `\b` does not: `_` is a word character, so `\bPRIVATE_KEY\b`
// never fired inside REDBELLY_PRIVATE_KEY, and that shape passed the scan (audit of 2026-09-19).
const L = '(?<![A-Za-z0-9])';
const R = '(?![A-Za-z0-9])';
/** Words that make a 0x 64-hex value a key whatever else the line says. */
const KEY_WORDS = new RegExp(`${L}(private[_ -]?key|priv[_ -]?key|privkey|pk|secret|signer[_ -]?key|deployer[_ -]?key|wallet[_ -]?key|mnemonic|seed|startBroadcast|privateKeyToAccount)${R}`, 'i');
/** Weaker signs: a key is likely, unless the line is plainly about a hash. A Hardhat `accounts` array is the commonest leak there is. */
const KEYISH_WORDS = new RegExp(`${L}(accounts?|wallet|signer|key)${R}|new Wallet\\(`, 'i');
/** Lines that are plainly about hashes stay quiet even without the 0x prefix. */
const HASH_WORDS = /"id"\s*:|\b(sha-?256|sha-?512|sha-?3|keccak|blake2?b?|integrity|checksum|digest|codehash|code hash|tx ?hash|transactionHash|blockHash|merkle|root|slot|topic|salt)\b|hash/i;
const KEY_ASSIGNMENT = new RegExp(`${L}((?:[A-Z0-9]+_)*(?:PRIVATE_KEY|PRIV_KEY|DEPLOYER_KEY|DEPLOYER_PRIVATE_KEY|WALLET_KEY|SIGNER_KEY|MNEMONIC|SEED_PHRASE|SEED|PK))${R}\\s*[=:]\\s*["'\`]?([^\\s"'\`#]+(?:\\s+[a-z]+)*)`);
const PLACEHOLDER = /^(<|\$|\{\{|your|xxx+|\.\.\.|changeme|replace|example|0x0+$|todo|none|null|undefined|""|'')/i;
const KEYSTORE = /"(ciphertext|kdfparams|mac)"\s*:/;

/**
 * Hashes a line proves about itself: `keccak256("X")` beside a value that really is keccak256 of X,
 * where X is shaped like a role name. A key cannot be dressed up that way without its preimage.
 */
export function provenHashes(line: string): Set<string> {
  const proven = new Set<string>();
  for (const m of line.matchAll(/keccak256\(\\?"([A-Z][A-Z0-9_]*)\\?"\)/g)) {
    proven.add(keccak256Hex(new TextEncoder().encode(m[1]!)).toLowerCase());
  }
  return proven;
}

/** Every secret-shaped thing on one line of text. */
export function scanLine(line: string): SecretMatch[] {
  const out: SecretMatch[] = [];
  if (line.length > 20_000) return out; // minified bundles; a key there is not a key someone typed
  for (const m of line.matchAll(HEX64)) {
    const prefixed = m[1] === '0x';
    if (prefixed) {
      const proven = provenHashes(line);
      if (proven.has(m[0].toLowerCase())) continue;
      if (proven.size > 0) {
        // The line names a preimage, and this value is not its hash: whatever it is, it is not what it says.
        out.push({ kind: 'hex64-keyword', why: 'a 0x-prefixed 64-hex value beside a keccak256("...") that does not hash to it' });
        continue;
      }
      if (KEY_WORDS.test(line) || (KEYISH_WORDS.test(line) && !HASH_WORDS.test(line))) {
        out.push({ kind: 'hex64-keyword', why: 'a 0x-prefixed 64-hex value on a line that talks about a key' });
      }
    } else if (!HASH_WORDS.test(line)) {
      out.push({ kind: 'hex64', why: 'a bare 64-hex value, the shape of a private key in a .env or keystore export' });
    }
  }
  const assign = KEY_ASSIGNMENT.exec(line);
  if (assign) {
    const value = assign[2]!.trim();
    const isMnemonicVar = /MNEMONIC|SEED/.test(assign[1]!);
    if (!PLACEHOLDER.test(value) && (isMnemonicVar ? value.split(/\s+/).length >= 3 : value.length >= 16)) {
      out.push({ kind: 'key-assignment', why: `${assign[1]} is assigned a non-placeholder value` });
    }
  }
  if (mnemonicRun(line)) out.push({ kind: 'mnemonic', why: 'twelve or more consecutive BIP-39 words' });
  if (KEYSTORE.test(line)) out.push({ kind: 'keystore-json', why: 'an encrypted keystore JSON committed to the repository' });
  return out;
}

/** True when the line holds 12+ consecutive BIP-39 words separated by single spaces. */
export function mnemonicRun(line: string): boolean {
  const words = line.trim().split(/[\s"'`=,;:()[\]{}]+/);
  let run = 0;
  for (const w of words) {
    if (w && BIP39_ENGLISH.has(w)) {
      run++;
      if (run >= 12) return true;
    } else run = 0;
  }
  return false;
}

/** Scan a whole string; returns matches with 1-based line numbers. */
export function scanText(text: string): Array<SecretMatch & { line: number }> {
  const out: Array<SecretMatch & { line: number }> = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) for (const m of scanLine(lines[i]!)) out.push({ ...m, line: i + 1 });
  return out;
}

/** Walks any JSON-like value (tool arguments, config) and reports secret-shaped strings by path. */
export function scanValue(value: unknown, path = '$'): Array<SecretMatch & { path: string }> {
  const out: Array<SecretMatch & { path: string }> = [];
  if (typeof value === 'string') {
    for (const m of scanLine(value)) out.push({ ...m, path });
    // a bare 64-hex string is a key even without context words; a 0x one alone is ambiguous but
    // no tool here takes a hash, so treat it as a key too
    if (/^(0x)?[0-9a-fA-F]{64}$/.test(value.trim()) && !out.some((m) => m.kind.startsWith('hex64'))) {
      out.push({ kind: 'hex64', path, why: 'the whole value is 64 hex characters, the shape of a private key' });
    }
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => out.push(...scanValue(v, `${path}[${i}]`)));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/^(private_?key|privkey|mnemonic|seed(_phrase)?|secret|password)$/i.test(k)) {
        out.push({ kind: 'key-assignment', path: `${path}.${k}`, why: `an argument named ${k}` });
      }
      out.push(...scanValue(v, `${path}.${k}`));
    }
  }
  return out;
}
