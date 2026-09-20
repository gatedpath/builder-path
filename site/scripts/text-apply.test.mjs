// The writer-back's decisions, as pure functions: what it refuses, where it puts markup back, and
// what it writes into a source line. Every case here passed silently before the audit of
// 19 September 2026 (findings R12, W1, W2, W3).
//   node --test scripts/text-apply.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { flatten, unflatten, parseAstro } from './text-lib.mjs';
import { factDiff, decideEdit, applyToLines } from './text-apply-lib.mjs';

const blockOf = (raw, extra = {}) => {
  const { text, protectedSpans } = flatten(raw, '.');
  return { marker: '1.1', kind: 'paragraph', raw, text: text.trim(), protectedSpans, indent: '', ...extra };
};

// ---- R12: a fact is not only a code span or a link

test('a number, a unit, a spelled number and a swapped pair are all refused', () => {
  const cases = [
    ['The faucet gives 500 RBNT per claim.', 'The faucet gives 900 RBNT per claim.'],
    ['On 151 the admin is a Safe. On 153 an EOA is allowed.', 'On 153 the admin is a Safe. On 151 an EOA is allowed.'],
    ['There are fourteen tools in the server.', 'There are fifteen tools in the server.'],
    ['The cooldown is 24 hours.', 'The cooldown is 24 days.'],
    ['The run took 8 min 33 s.', 'The run took 8 h 33 s.'],
    ['Due in September 2026.', 'Due in October 2026.'],
    ['The offset is -5 blocks.', 'The offset is 5 blocks.'],
    ['Thirty-two tests pass.', 'Thirty-three tests pass.'],
  ];
  for (const [before, after] of cases) {
    const d = decideEdit(blockOf(before), after);
    assert.equal(d.status, 'refused', `${before} -> ${after}`);
    assert.ok(d.facts.length > 0, 'the refusal names what moved');
  }
});

test('rewording that leaves every fact where it was is applied', () => {
  const d = decideEdit(blockOf('The faucet gives 500 RBNT per claim, once every 24 hours.'), 'Each claim from the faucet is 500 RBNT, and you may claim once every 24 hours.');
  assert.equal(d.status, 'apply');
  assert.deepEqual(factDiff('It took 43 s on 18 September 2026.', 'On my machine it took 43 s on 18 September 2026.'), []);
});

test('facts that only changed order are refused unless the owner has said the change is meant', () => {
  const b = blockOf('The install took 45 s and the tests 3 s.');
  const after = 'The tests took 3 s and the install 45 s.';
  assert.equal(decideEdit(b, after).status, 'refused');
  assert.equal(decideEdit(b, after, { allow: true }).status, 'apply', 'an explicit allow for that marker lets it through');
});

// ---- W1: markup goes back where it was, not on the first matching word

test('a code span keeps its place when the same word appears earlier in the sentence', () => {
  const raw = 'A compliance officer moves it to an eligible wallet, and can do nothing else: the check on `to` is not skipped.';
  const b = blockOf(raw);
  const d = decideEdit(b, b.text.replace('can do nothing else', 'cannot do anything else'));
  assert.equal(d.status, 'apply');
  assert.equal(d.md, raw.replace('can do nothing else', 'cannot do anything else'));
});

test('a link keeps its place too, and an untouched block round-trips exactly', () => {
  const raw = 'See the research log for the source, and the [research](/research/) page for the status.';
  const b = blockOf(raw);
  assert.equal(unflatten(b.text, b.protectedSpans).md, raw);
  const d = decideEdit(b, b.text.replace('See the', 'Read the'));
  assert.equal(d.md, raw.replace('See the', 'Read the'));
});

test('a link whose label is code survives, edited or not', () => {
  const raw = 'The revert is [`NotEligible`](/errors/#not-eligible), decoded for you.';
  const b = blockOf(raw);
  assert.equal(b.text, 'The revert is NotEligible, decoded for you.');
  assert.equal(unflatten(b.text, b.protectedSpans).md, raw);
  assert.equal(decideEdit(b, 'The revert is NotEligible, and it is decoded for you.').md, 'The revert is [`NotEligible`](/errors/#not-eligible), and it is decoded for you.');
});

// ---- W2: what she types is text, never markup and never a replacement pattern

test('characters that would break the page are refused, by name', () => {
  const para = blockOf('A plain sentence about the gate.');
  for (const bad of ['A sentence with {braces} in it.', 'Fewer than <2 cases.', 'export default the gate.']) {
    assert.equal(decideEdit(para, bad).status, 'refused', bad);
  }
  const prop = { marker: '1.9', kind: 'prop', prop: 'title', raw: 'Your first gated contract on testnet', text: 'Your first gated contract on testnet', protectedSpans: [] };
  const d = decideEdit(prop, 'Your first "gated" contract on testnet');
  assert.equal(d.status, 'refused');
  assert.match(d.reasons.join(' '), /double quote/);
});

test('a dollar sign in her text is written as a dollar sign', () => {
  const prop = { kind: 'prop', prop: 'text', raw: 'Costs little', startLine: 0, endLine: 0 };
  const lines = ['  <Card title="Gas" text="Costs little" />'];
  assert.equal(applyToLines(lines, prop, "Costs US$$ and $& and $' little").ok, true);
  assert.equal(lines[0], "  <Card title=\"Gas\" text=\"Costs US$$ and $& and $' little\" />");
});

// ---- W3: blocks that could never be applied

test('a one-line element keeps its tags when its words change', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rb-astro-'));
  try {
    const file = join(dir, 'Landing.astro');
    writeFileSync(file, '---\n---\n<ul>\n  <li class="x">You review before mainnet. Start at the gate.</li>\n  <li>{card.outcome}</li>\n</ul>\n');
    const blocks = parseAstro(file, dir);
    assert.equal(blocks.length, 1, 'a live expression such as {card.outcome} is not offered as text');
    const lines = ['---', '---', '<ul>', '  <li class="x">You review before mainnet. Start at the gate.</li>', '  <li>{card.outcome}</li>', '</ul>', ''];
    const r = applyToLines(lines, blocks[0], 'You review before mainnet. Begin at the gate.');
    assert.equal(r.ok, true, r.stale);
    assert.equal(lines[3], '  <li class="x">You review before mainnet. Begin at the gate.</li>');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- W4: an edit saved in the browser says which paragraph it was written for

test('the browser file\'s "# was:" line is never read as her words, and the set-aside section is ignored', async () => {
  const { readEdited, readOrigins } = await import('./text-merge.mjs');
  const file = ['WEBSITE TEXT EDITS, saved from the offline site', '', '[5.2]  TEXT', '# was: Each identity may link 5 wallets.', 'Each identity can link 5 wallets.', '',
    '====================================================================', 'SET ASIDE, NOT APPLIED: the paragraph each of these was written for has since changed.', '  was paragraph 5.9, which read: Old words.', '  your words: My words.', ''].join('\n');
  assert.deepEqual([...readEdited(file)], [['5.2', 'Each identity can link 5 wallets.']]);
  assert.deepEqual([...readOrigins(file)], [['5.2', 'Each identity may link 5 wallets.']]);
});

test('an edit written for a paragraph that [marker] no longer is, is refused', () => {
  const now = blockOf('Each identity may link 10 wallets.');
  const d = decideEdit(now, 'Verification is free, and takes a few minutes.', { was: 'Verification costs nothing and takes minutes.' });
  assert.equal(d.status, 'refused');
  assert.match(d.reasons.join(' '), /different paragraph/);
  // the same paragraph, smart quotes and all, goes through the ordinary checks
  const same = blockOf("It is the builder's side of the gate.");
  assert.equal(decideEdit(same, "It is the builder's half of the gate.", { was: 'It is the builder’s side of the gate.' }).status, 'apply');
});
