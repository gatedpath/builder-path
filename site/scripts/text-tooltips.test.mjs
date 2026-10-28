import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipTooltipLabels, findTooltipUses, placeTooltips, readTooltipKeys, tooltipLabel } from './text-tooltips.mjs';

const TIPS = `export const tips = [
  {
    key: 'deploy-real',
    tip: 'Rehearse it first.',
  },
  {
    key: 'ship-real',
    tip: 'Yours to run.',
  },
];`;

test('tips.ts is read as key -> the line of its tip', () => {
  const keys = readTooltipKeys(TIPS);
  assert.deepEqual([...keys], [['deploy-real', 3], ['ship-real', 7]]);
});

test('uses are found in reading order, with the pill\'s words, whichever way round the attributes are', () => {
  const src = [
    'Intro.',
    '<StatusPill variant="pending" label="Not run yet" tipKey="deploy-real" /> words',
    'More.',
    '<StatusPill tipKey="ship-real" label="Your step" variant="neutral" /> and <StatusPill label="No tip" />',
  ].join('\n');
  assert.deepEqual(findTooltipUses(src), [
    { key: 'deploy-real', line: 1, label: 'Not run yet' },
    { key: 'ship-real', line: 3, label: 'Your step' },
  ]);
});

const block = (startLine, text) => ({ startLine, endLine: startLine, text, kind: 'paragraph' });
const tipBlocks = new Map([
  ['deploy-real', { kind: 'dataField', text: 'Rehearse it first.', startLine: 3 }],
  ['ship-real', { kind: 'dataField', text: 'Yours to run.', startLine: 7 }],
]);

test('a tooltip lands straight after the paragraph that holds its pill, labelled with the pill', () => {
  const { blocks } = placeTooltips({
    blocks: [block(0, 'Intro.'), block(1, 'Not run yet words'), block(2, 'More.')],
    uses: [{ key: 'deploy-real', line: 1, label: 'Not run yet' }],
    tipBlocks, placed: new Map(), pageTitle: 'Start',
  });
  assert.deepEqual(blocks.map((b) => b.text), ['Intro.', 'Not run yet words', 'Rehearse it first.', 'More.']);
  assert.match(blocks[2].label, /^TOOLTIP .*"Not run yet"/);
  assert.equal(blocks[2].tipKey, 'deploy-real');
});

test('two pills in one paragraph keep their reading order, and a pill used twice gives one block', () => {
  const { blocks } = placeTooltips({
    blocks: [block(0, 'Both pills here.'), block(5, 'Later.')],
    uses: [
      { key: 'deploy-real', line: 0, label: 'A' },
      { key: 'ship-real', line: 0, label: 'B' },
      { key: 'deploy-real', line: 5, label: 'A again' },
    ],
    tipBlocks, placed: new Map(), pageTitle: 'Start',
  });
  assert.deepEqual(blocks.map((b) => b.text), ['Both pills here.', 'Rehearse it first.', 'Yours to run.', 'Later.']);
});

test('a tooltip shared by two pages is placed once, and the second page is reported, not duplicated', () => {
  const placed = new Map();
  placeTooltips({ blocks: [block(0, 'x')], uses: [{ key: 'ship-real', line: 0, label: 'B' }], tipBlocks, placed, pageTitle: 'Start' });
  const second = placeTooltips({ blocks: [block(0, 'y')], uses: [{ key: 'ship-real', line: 0, label: 'B' }], tipBlocks, placed, pageTitle: 'Review' });
  assert.deepEqual(second.blocks.map((b) => b.text), ['y']);
  assert.deepEqual(second.alsoOn, [{ key: 'ship-real', pageTitle: 'Review' }]);
  assert.match(tooltipLabel('B', ['Review']), /Also shown on: Review\.$/);
});

test('a pill above every block still gets its tooltip, at the top; an unknown key is ignored', () => {
  const { blocks } = placeTooltips({
    blocks: [block(10, 'Only block.')],
    uses: [{ key: 'deploy-real', line: 2, label: 'Early' }, { key: 'no-such-key', line: 3, label: '?' }],
    tipBlocks, placed: new Map(), pageTitle: 'Start',
  });
  assert.deepEqual(blocks.map((b) => b.text), ['Rehearse it first.', 'Only block.']);
});

test('chip tooltips in cards.ts are labelled with the words on the chip', () => {
  const src = [
    "export const scopeLabels: Record<Scope, string> = { scaffold: 'On the scaffold', 'one-contract': 'One contract' };",
    "export const recipeLabels: Record<Recipe, string> = {",
    "  'over-18': 'Over 18',",
    "  none: 'No recipe change',",
    "};",
    "export const labelTips: { key: Level | Recipe; tip: string }[] = [",
    "  {",
    "    key: 'scaffold',",
    "    tip: 'Change one thing.',",
    "  },",
    "  {",
    "    key: 'none',",
    "    tip: 'Nothing to change.',",
    "  },",
    "];",
    "export const cards = [{ key: 'not-a-chip', tip: 'ignored' }];",
  ].join('\n');
  const labels = chipTooltipLabels(src);
  assert.deepEqual([...labels.keys()], [8, 12]);
  assert.match(labels.get(8), /the chip "On the scaffold"/);
  assert.match(labels.get(12), /the chip "No recipe change"/);
});
