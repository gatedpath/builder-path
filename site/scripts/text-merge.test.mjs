// The decision the text exporter makes about a file that already exists. Pure functions, no disk.
//   node --test scripts/text-merge.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readEdited, planFile } from './text-merge.mjs';

const file = (blocks) => ['====================', '  PAGE', '====================', '', ...blocks.flatMap(([marker, text]) => ['', `[${marker}]  TEXT`, text]), '', '===================='].join('\n');

const OLD = [
  { marker: '5.1', text: 'Finality is deterministic.' },
  { marker: '5.2', text: 'Ordering inside a super block is not documented.' },
  { marker: '5.3', text: 'There is no priority auction.' },
];

test('readEdited joins wrapped lines and ignores the bars', () => {
  const found = readEdited(file([['5.1', 'Finality is\n  deterministic.'], ['5.2', 'Second.']]));
  assert.deepEqual([...found], [['5.1', 'Finality is deterministic.'], ['5.2', 'Second.']]);
});

test('a file she never touched is refreshed when the page has moved on: this was the trap', () => {
  // A session corrected block 5.2 in the source. Her file still holds the old wording, which is
  // exactly what she was last given, so it is out of date, not edited.
  const next = [OLD[0], { marker: '5.2', text: 'The 2021 paper documents a rule, and it changes in Q4 2026.' }, OLD[2]];
  const plan = planFile({ oldBlocks: OLD, newBlocks: next, onDisk: file(OLD.map((b) => [b.marker, b.text])) });
  assert.equal(plan.action, 'refresh');
  assert.deepEqual(plan.carried, []);
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.blocks.map((b) => b.text), next.map((b) => b.text));
});

test('an untouched file with an unchanged page is simply current', () => {
  const plan = planFile({ oldBlocks: OLD, newBlocks: OLD, onDisk: file(OLD.map((b) => [b.marker, b.text])) });
  assert.equal(plan.action, 'current');
});

test('her edits are kept when the page has not changed', () => {
  const hers = [['5.1', 'A receipt is final, full stop.'], ['5.2', OLD[1].text], ['5.3', OLD[2].text]];
  const plan = planFile({ oldBlocks: OLD, newBlocks: OLD, onDisk: file(hers) });
  assert.equal(plan.action, 'keep');
  assert.deepEqual(plan.carried.map((c) => c.marker), ['5.1']);
});

test('her edit and a session edit to different blocks both survive, even when the markers shift', () => {
  // The session corrected 5.2 and inserted a new block before it, so her block 5.3 is now 5.4.
  const next = [
    { marker: '5.1', text: OLD[0].text },
    { marker: '5.2', text: 'A new paragraph the session added.' },
    { marker: '5.3', text: 'The 2021 paper documents a rule.' },
    { marker: '5.4', text: OLD[2].text },
  ];
  const hers = [['5.1', OLD[0].text], ['5.2', OLD[1].text], ['5.3', 'Nobody can buy their way to the front here.']];
  const plan = planFile({ oldBlocks: OLD, newBlocks: next, onDisk: file(hers) });
  assert.equal(plan.action, 'merge');
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.carried, [{ marker: '5.3', newMarker: '5.4', text: 'Nobody can buy their way to the front here.' }]);
  assert.deepEqual(plan.blocks.map((b) => b.text), [OLD[0].text, 'A new paragraph the session added.', 'The 2021 paper documents a rule.', 'Nobody can buy their way to the front here.']);
  // The manifest must keep the page's own text for 5.4, or the writer-back would see no edit.
  assert.equal(plan.blocks[3].sourceText, OLD[2].text);
});

test('when both changed the same block the page wins in the file and her wording is reported, not dropped', () => {
  const next = [OLD[0], { marker: '5.2', text: 'The 2021 paper documents a rule.' }, OLD[2]];
  const hers = [['5.1', OLD[0].text], ['5.2', 'Nobody has written the ordering down.'], ['5.3', 'No auction for position.']];
  const plan = planFile({ oldBlocks: OLD, newBlocks: next, onDisk: file(hers) });
  assert.equal(plan.action, 'merge');
  assert.deepEqual(plan.carried.map((c) => c.marker), ['5.3']);
  assert.deepEqual(plan.conflicts, [{ marker: '5.2', was: OLD[1].text, hers: 'Nobody has written the ordering down.' }]);
  assert.equal(plan.blocks[1].text, 'The 2021 paper documents a rule.');
  assert.equal(plan.blocks[2].text, 'No auction for position.');
});

test('two identical paragraphs on one page are matched in order, each once', () => {
  const old = [{ marker: '2.1', text: 'Run it.' }, { marker: '2.2', text: 'Run it.' }];
  const next = [{ marker: '2.1', text: 'Before you start.' }, { marker: '2.2', text: 'Run it.' }, { marker: '2.3', text: 'Run it.' }];
  const plan = planFile({ oldBlocks: old, newBlocks: next, onDisk: file([['2.1', 'Run it now.'], ['2.2', 'Run it again.']]) });
  assert.deepEqual(plan.carried.map((c) => [c.marker, c.newMarker]), [['2.1', '2.2'], ['2.2', '2.3']]);
});

test('with no earlier manifest there is nothing to compare with, so a differing file is left alone as before', () => {
  const plan = planFile({ oldBlocks: null, newBlocks: OLD, onDisk: file([['5.1', 'Something else.']]) });
  assert.equal(plan.action, 'keep');
});

test('a marker she deleted or mangled does not crash the run', () => {
  const plan = planFile({ oldBlocks: OLD, newBlocks: OLD, onDisk: file([['5.1', OLD[0].text], ['9.9', 'Stray.']]) });
  assert.equal(plan.action, 'current');
  assert.deepEqual(plan.unknown, ['9.9']);
});
