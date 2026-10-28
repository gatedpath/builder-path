// Where a tooltip goes in the owner's text files.
//
// Tooltips are written once, in src/data/tips.ts, and hung on a pill with tipKey="...". Until
// 20 September 2026 all of them were handed to her inside the Start page's file, labelled
// "DESCRIPTION", whichever page they were really on. Her request: a tooltip belongs in the file of
// the page it is on, and should say what it is. So each one is placed straight after the paragraph
// that holds its pill, labelled with the pill's words, the way a reader meets them.
//
// A tooltip used on two pages is placed once, on the first page that uses it, and its label names
// the others: two copies of the same words in two files would drift apart.
//
// Pure functions, no file access, so the tests can drive them with strings.

/** key -> the 0-based line of its `tip:` field, read from the text of tips.ts. */
export function readTooltipKeys(tipsSource) {
  const lines = tipsSource.split('\n');
  const out = new Map();
  let key = null;
  for (let i = 0; i < lines.length; i += 1) {
    const k = /^\s*key:\s*'([^']+)'/.exec(lines[i]);
    if (k) { key = k[1]; continue; }
    if (key && /^\s*tip:\s*'/.test(lines[i])) { out.set(key, i); key = null; }
  }
  return out;
}

/** Every tipKey in a page source, in reading order: [{ key, line, label }]. `label` is the pill's words. */
export function findTooltipUses(source) {
  const uses = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const tag = /<[A-Z][\w.]*\b[^>]*\btipKey="[^"]+"[^>]*>/g;
    let m;
    while ((m = tag.exec(lines[i])) !== null) {
      const key = /\btipKey="([^"]+)"/.exec(m[0])[1];
      const label = /\blabel="([^"]*)"/.exec(m[0]);
      uses.push({ key, line: i, label: label ? label[1] : '' });
    }
  }
  return uses;
}

/**
 * Put the tooltip blocks of one source file among that file's blocks.
 *
 *   blocks     the source's own blocks, in order, each with startLine and endLine
 *   uses       findTooltipUses() of the same source
 *   tipBlocks  key -> the tooltip's block (from tips.ts)
 *   placed     key -> title of the page that already carries it (shared across pages; updated here)
 *   pageTitle  this page's title
 *
 * Returns { blocks, alsoOn } where alsoOn lists { key, pageTitle } for uses of a tooltip that an
 * earlier page already carries, so the caller can name this page in that block's label.
 */
export function placeTooltips({ blocks, uses, tipBlocks, placed, pageTitle }) {
  const out = blocks.map((b) => ({ ...b }));
  const alsoOn = [];
  const seenHere = new Set();
  const inserts = [];
  for (const use of uses) {
    if (seenHere.has(use.key)) continue; // the same pill twice on one page: one tooltip block
    seenHere.add(use.key);
    const tip = tipBlocks.get(use.key);
    if (!tip) continue; // a key with no tooltip text: check-tips reports it, nothing to edit
    if (placed.has(use.key)) { if (placed.get(use.key) !== pageTitle) alsoOn.push({ key: use.key, pageTitle }); continue; }
    placed.set(use.key, pageTitle);
    // The paragraph holding the pill: the last block that starts at or before the pill's line.
    let at = -1;
    for (let i = 0; i < out.length; i += 1) if (out[i].startLine <= use.line) at = i;
    inserts.push({ at, block: { ...tip, tipKey: use.key, label: tooltipLabel(use.label) } });
  }
  // Group by the paragraph they follow, in reading order, then splice from the bottom up so that
  // earlier positions stay valid.
  const grouped = new Map();
  for (const ins of inserts) { if (!grouped.has(ins.at)) grouped.set(ins.at, []); grouped.get(ins.at).push(ins.block); }
  for (const at of [...grouped.keys()].sort((x, y) => y - x)) out.splice(at + 1, 0, ...grouped.get(at));
  return { blocks: out, alsoOn };
}

export function tooltipLabel(words, otherPages = [], thing = 'pill') {
  const on = words ? `TOOLTIP  (appears when a reader points at the ${thing} "${words}")` : 'TOOLTIP';
  return otherPages.length ? `${on}  Also shown on: ${otherPages.join(', ')}.` : on;
}

/**
 * The chips on a project card (scope and recipe) carry tooltips too, written in src/data/cards.ts as
 * `labelTips`. They are already in the right file (the projects page); this gives each one a label
 * that says which chip it belongs to. Returns the 0-based line of each `tip:` -> the chip's words.
 */
export function chipTooltipLabels(cardsSource) {
  const words = new Map();
  for (const name of ['scopeLabels', 'recipeLabels']) {
    const decl = new RegExp(`export const ${name}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\};`).exec(cardsSource);
    if (!decl) continue;
    for (const m of decl[1].matchAll(/(?:'([\w-]+)'|([A-Za-z][\w-]*))\s*:\s*'([^']+)'/g)) words.set(m[1] ?? m[2], m[3]);
  }
  const out = new Map();
  const start = cardsSource.indexOf('export const labelTips');
  if (start < 0) return out;
  const offset = cardsSource.slice(0, start).split('\n').length - 1;
  const end = cardsSource.indexOf('];', start);
  for (const [key, line] of readTooltipKeys(cardsSource.slice(start, end < 0 ? undefined : end))) {
    out.set(line + offset, tooltipLabel(words.get(key) ?? key, [], 'chip'));
  }
  return out;
}
