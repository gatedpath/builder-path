// What the writer-back decides, as pure functions, so every decision has a test.
//
// A rewrite of the site's words may change wording. It may not change a fact: a number, a unit, a
// date, a version, a chain id, an address, a command, a path, or the order two of them come in.
// Until 19 September 2026 only code spans and links were protected; a number in plain prose could be
// rewritten and written into the site, and the separate fact check ignored order, spelled numbers
// and units, and never read the browser editor's file (audit findings R12, W1, W2, W3).
import { unflatten, renderBlock } from './text-lib.mjs';

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const UNITS = '%|ms|s|h|min|KB|kB|MB|GB|RBNT|gas|gwei|wei|px|hours?|minutes?|seconds?|days?|weeks?|months?|years?|blocks?|tests?|suites?|runs?|calls?|pages?|files?|wallets?|bytes?|owners?|checks?|tools?|packages?|entries|cents?';
const TEENS = 'two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen';
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';

const PATTERNS = [
  new RegExp(`(?<![\\w.])-?\\d[\\d,]*(?:\\.\\d+)?\\s?(?:${UNITS})(?![A-Za-z])`, 'g'),     // a number with its unit: 24 hours, 8 min, 500 RBNT
  /US\$\s?[\d.,]+/g,                                                                       // money
  /\b0x[0-9a-fA-F]{6,}\b/g,                                                                // addresses and hashes
  new RegExp(`\\b\\d{1,2}\\s(?:${MONTHS})\\s\\d{4}\\b`, 'g'),                               // 18 September 2026
  new RegExp(`\\b(?:${MONTHS})\\s\\d{4}\\b`, 'g'),                                          // September 2026
  /\b\d{4}-\d{2}-\d{2}\b/g,                                                                // ISO dates
  /\bv?\d+\.\d+(?:\.\d+)?\b/g,                                                             // versions
  /\bchain(?:\sid)?\s\d+\b/gi,                                                             // chain 151
  /\bnpm\s(?:run|install|ci|create|pack|publish)(?:\s[\w:@./-]+)?/g,                       // npm commands
  /\b(?:npx|forge|cast|anvil|node|python3)\s[\w:@./-]*[./:@-][\w:@./-]*/g,                // a tool and a path-like argument
  /\b(?:forge|cast)\s(?:build|test|script|fmt|install|verify-contract|call|wallet|send)\b/g,
  /--[a-z][\w-]*/g,                                                                        // flags
  /\b[\w-]+\.(?:mjs|js|ts|tsx|json|md|mdx|sol|toml|yaml|yml|astro|txt|png|pdf)\b/g,        // file names
  /\b[a-zA-Z_][\w]*\([^)]{0,40}\)/g,                                                       // function calls
  new RegExp(`\\b(?:(?:${TENS})(?:-(?:one|${TEENS.split('|').slice(0, 8).join('|')}))?|${TEENS}|hundred|thousand|million)\\b`, 'gi'), // spelled numbers ("one" alone is too common a word)
  /(?<![\w.])-?\d[\d,]*(?:\.\d+)?/g,                                                       // any number, with its sign, last
];

/** Every fact token in a text, in the order it appears. Number words are compared without case. */
export function factTokens(text) {
  const found = [];
  PATTERNS.forEach((re, rank) => {
    for (const m of text.matchAll(re)) found.push({ at: m.index, rank, tok: rank === 14 ? m[0].toLowerCase() : m[0] });
  });
  return found.sort((a, b) => a.at - b.at || a.rank - b.rank).map((f) => f.tok);
}

/** What moved between two versions of a block: [] when every fact is where it was. */
export function factDiff(before, after) {
  const a = factTokens(before);
  const b = factTokens(after);
  if (a.length === b.length && a.every((t, i) => t === b[i])) return [];
  const count = (list) => list.reduce((m, t) => m.set(t, (m.get(t) ?? 0) + 1), new Map());
  const ca = count(a);
  const cb = count(b);
  const out = [];
  for (const [tok, n] of ca) if ((cb.get(tok) ?? 0) < n) out.push({ kind: 'lost', token: tok, was: n, now: cb.get(tok) ?? 0 });
  for (const [tok, n] of cb) if ((ca.get(tok) ?? 0) < n) out.push({ kind: 'added', token: tok, was: ca.get(tok) ?? 0, now: n });
  if (!out.length) {
    const at = a.findIndex((t, i) => t !== b[i]);
    out.push({ kind: 'reordered', token: a[at], with: b[at] });
  }
  return out;
}

const squash = (s) => s.replace(/\s+/g, ' ').trim();
/** As the offline editor compares: the page shows curly quotes and dashes where the source has plain ones. */
const plain = (s) => squash(s.replace(/[‘’‚‛]/g, "'").replace(/[“”„]/g, '"').replace(/[–—]/g, '-').replace(/\u00a0/g, ' '));
const count = (s, ch) => s.split(ch).length - 1;

/**
 * One edited block: leave it, apply it, or refuse it and say why.
 * `allow` is the owner saying, for this marker, that a fact is meant to change; it lifts the fact
 * check and nothing else.
 */
export function decideEdit(block, editedText, { allow = false, was = null } = {}) {
  const before = squash(block.text);
  const text = squash(editedText);
  if (text === before) return { status: 'unchanged' };

  // An edit saved in the browser carries the paragraph it was written for. Markers are paragraph
  // numbers and a rebuild can renumber them; if [marker] is now a different paragraph, her words
  // belong somewhere else and must not land here.
  if (was !== null && plain(was) !== plain(before)) {
    return { status: 'refused', reasons: [`this was written for a different paragraph, which read: "${squash(was).slice(0, 90)}"; [${block.marker}] now reads: "${before.slice(0, 90)}"`], facts: [], text };
  }

  const reasons = [];
  // Characters the page's source reads as code. They may stay where they already were.
  for (const [ch, name] of [['{', 'an opening brace {'], ['}', 'a closing brace }'], ['<', 'a less-than sign <'], ['\\', 'a backslash']]) {
    if (count(text, ch) > count(before, ch)) reasons.push(`${name} would be read as code, not text`);
  }
  if (block.kind === 'prop' && text.includes('"')) reasons.push('a double quote ends the title early in the page source; use single or curly quotes');
  if (/^(import|export)\s/.test(text) && !/^(import|export)\s/.test(before)) reasons.push('a paragraph that starts with "import" or "export" is read as code; start it with another word');

  const { ok, md, missing } = unflatten(text, block.protectedSpans ?? []);
  if (!ok) for (const s of missing) reasons.push(`missing ${s.kind === 'link' ? 'link' : s.kind} "${s.text}"`);

  const facts = allow ? [] : factDiff(before, text);
  if (reasons.length || facts.length) return { status: 'refused', reasons, facts, text };
  return { status: 'apply', md };
}

/** Write one decided block into its file's lines. { ok } or { ok: false, stale: what the line says now }. */
export function applyToLines(lines, block, md) {
  if (block.kind === 'prop') {
    const line = lines[block.startLine] ?? '';
    const was = `${block.prop}="${block.raw}"`;
    if (!line.includes(was)) return { ok: false, stale: line.trim().slice(0, 80) };
    // A function, so `$&`, `$$` and `$'` in her words are written as she typed them.
    lines[block.startLine] = line.replace(was, () => `${block.prop}="${md}"`);
    return { ok: true };
  }
  const current = lines.slice(block.startLine, block.endLine + 1).join('\n');
  const expected = renderBlock(block, block.raw)?.join('\n');
  // Compared without regard to line breaks and indentation: a paragraph wrapped over several lines
  // in the source is one line in the block.
  if (expected !== undefined && expected !== null && squash(current) !== squash(expected)) {
    return { ok: false, stale: current.trim().slice(0, 80) };
  }
  lines.splice(block.startLine, block.endLine - block.startLine + 1, ...renderBlock(block, md));
  return { ok: true };
}
