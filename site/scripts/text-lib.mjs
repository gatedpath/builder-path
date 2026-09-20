// Shared between extract-text.mjs, apply-text.mjs and build-offline.mjs.
//
// One job: find the prose a reader sees, in the files that hold it, and give each block a
// stable id so the same block can be shown in a plain text file, marked in the offline HTML,
// and written back to its source afterwards.
//
// What counts as prose: headings, paragraphs, list items, the frontmatter description, and the
// words inside an Aside or a VineAside. What does not: code fences, tables, sample blocks, the
// facts arrays that are written for agents rather than readers, and anything inside a component
// this file does not list. Commands, addresses, times and network facts therefore stay in the
// sources untouched, which is the rule the reports and the site both rest on.
//
// Inline markup (links, code spans, bold) is flattened to its words in the draft and recorded as
// a "protected" span. Writing back finds each protected span verbatim in the edited text and
// puts its markup back. If a protected span is gone, the block is refused and reported rather
// than written, so a reworded link can never become plain text by accident.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { relative } from 'node:path';

/** Components whose children are prose a reader reads. Anything else is skipped whole. */
const PROSE_CHILDREN = new Set(['Aside', 'VineAside', 'TabItem', 'Tabs', 'ProjectSteps', 'StepCard', 'StepPart']);

/**
 * A StatusPill renders its label and nothing else, so a pill inside a sentence is part of the
 * sentence a reader reads. Its default labels are read out of the component rather than copied,
 * so this cannot drift from what the page actually shows.
 */
let PILL_DEFAULTS = null;
function pillDefaults(siteRoot) {
  if (PILL_DEFAULTS) return PILL_DEFAULTS;
  PILL_DEFAULTS = {};
  try {
    const src = readFileSync(`${siteRoot}/src/components/StatusPill.astro`, 'utf8');
    const block = /const defaults[^=]*=\s*\{([\s\S]*?)\};/.exec(src);
    if (block) {
      for (const m of block[1].matchAll(/(\w+)\s*:\s*'([^']*)'/g)) PILL_DEFAULTS[m[1]] = m[2];
    }
  } catch { /* no component, no defaults: pills then read as unsafe and their block is skipped */ }
  return PILL_DEFAULTS;
}

/**
 * Find where a JSX tag that opens on `startLine` ends, scanning characters rather than guessing
 * from the end of a line. Props hold arrays, braces and apostrophes (`the dApp\'s own`), so the
 * scan tracks string literals with their escapes and brace depth, and stops at the first `>`
 * that is outside both. Getting this wrong silently swallows the rest of a page, which is what
 * it did before: identity.mdx and errors.mdx came out with one block each.
 */
function findTagEnd(lines, startLine) {
  let brace = 0;
  let str = null;
  for (let li = startLine; li < lines.length; li += 1) {
    const line = lines[li];
    const from = li === startLine ? line.indexOf('<') : 0;
    for (let c = from; c < line.length; c += 1) {
      const ch = line[c];
      if (str) {
        if (ch === '\\') { c += 1; continue; }
        if (ch === str) str = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { str = ch; continue; }
      if (ch === '{') { brace += 1; continue; }
      if (ch === '}') { brace -= 1; continue; }
      if (ch === '>' && brace === 0) {
        return { endLine: li, selfClosing: c > 0 && line[c - 1] === '/' };
      }
    }
  }
  return { endLine: lines.length - 1, selfClosing: true };
}

/** A block id is stable across runs: the source path plus the block's position and its text. */
function blockId(file, ordinal, text) {
  const h = createHash('sha1').update(`${file}::${ordinal}::${text}`).digest('hex').slice(0, 8);
  return `${ordinal}-${h}`;
}

// ---------------------------------------------------------------- inline markup

/**
 * Flatten one block's markdown to the words a reader sees, recording what has to be put back.
 * Order matters: links first (their label can hold code), then code, then bold and italic.
 */
export function flatten(md, siteRoot) {
  const protectedSpans = [];
  let unsafe = false;
  let out = md;

  // Each span is wrapped in private-use marks as it is found, so that once every pass has run its
  // position in the flat text is known. Putting markup back on "the first place these words occur"
  // moved a code span onto an ordinary word whenever the word appeared twice (audit 2026-09-19, W1).
  const S = '\uE000', M = '\uE001', E = '\uE002';
  const bare = (t) => t.replace(/\uE000\d+\uE001|\uE002/g, '');
  const mark = (span, inner) => {
    const at = protectedSpans.push(span) - 1;
    return `${S}${at}${M}${inner}${E}`;
  };

  // A self-closing component inside a sentence. A StatusPill becomes the words it shows; anything
  // else has no text a reader could edit, so the block that holds it is left out altogether.
  out = out.replace(/<([A-Z][\w.]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\/>/g, (whole, name, attrs) => {
    if (name !== 'StatusPill') { unsafe = true; return whole; }
    const label = /label="([^"]*)"/.exec(attrs);
    let text = label ? label[1] : '';
    if (!text) {
      const variant = /variant="([^"]*)"/.exec(attrs);
      text = variant ? (pillDefaults(siteRoot)[variant[1]] ?? '') : '';
    }
    if (!text) { unsafe = true; return whole; }
    return mark({ kind: 'jsx', jsx: whole, text }, text);
  });

  // Inline HTML the .astro components use: <a href={...}>label</a>, <strong>x</strong>, <code>x</code>.
  // The whole opening tag is kept so an href or a class survives a rewrite untouched.
  // Ext is this site's link component (src/components/Ext.astro); to her it is a link like any other.
  out = out.replace(/<(a|Ext|strong|em|b|i|code|span)(\s[^>]*)?>([^<]*)<\/\1>/g, (_m, tag, attrs, inner) =>
    mark({ kind: 'html', tag, open: `<${tag}${attrs ?? ''}>`, text: bare(inner) }, inner));

  // {expression}: code that prints words. It stays in her text exactly as written and must survive
  // word for word. (Braces inside a tag's attributes are already gone with the tag, above.)
  out = out.replace(/\{[^{}\n]*\}/g, (whole) => mark({ kind: 'raw', raw: whole, text: whole }, whole));

  // [label](url). A label that is itself code, [`NotEligible`](...), is kept whole: as a link with a
  // code span inside it, the link's text never matched the flat text and the block was refused even
  // when nobody had touched it.
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (whole, label, url) => {
    if (label.includes('`')) {
      const text = bare(label).replace(/`/g, '');
      return mark({ kind: 'raw', raw: bare(whole), text }, text);
    }
    return mark({ kind: 'link', text: bare(label), url }, label);
  });

  // `code`
  out = out.replace(/`([^`]+)`/g, (_m, code) => mark({ kind: 'code', text: bare(code) }, code));

  // **bold** and __bold__
  out = out.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_m, a, b) => mark({ kind: 'strong', text: bare(a ?? b) }, a ?? b));

  // *italic* and _italic_, but not a lone underscore inside a word
  out = out.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, (_m, text) => mark({ kind: 'em', text: bare(text) }, text));

  // Strip the marks, noting where each span landed: the words either side of it, and which
  // occurrence of its own words it is. unflatten uses both to find the same place again.
  let text = '';
  const open = [];
  for (let k = 0; k < out.length;) {
    if (out[k] === S) {
      const m = out.indexOf(M, k);
      open.push({ at: Number(out.slice(k + 1, m)), start: text.length });
      k = m + 1;
    } else if (out[k] === E) {
      const o = open.pop();
      if (o) Object.assign(protectedSpans[o.at], { _start: o.start, _end: text.length });
      k += 1;
    } else {
      text += out[k];
      k += 1;
    }
  }
  for (const span of protectedSpans) {
    const { _start: start, _end: end } = span;
    delete span._start; delete span._end;
    if (start === undefined) continue;
    span.before = text.slice(Math.max(0, start - CONTEXT), start);
    span.after = text.slice(end, end + CONTEXT);
    let nth = 0;
    for (let at = text.indexOf(span.text); at !== -1 && at < start; at = text.indexOf(span.text, at + 1)) nth += 1;
    span.nth = nth;
  }

  return { text, protectedSpans, unsafe };
}

/** How many characters either side of a span are remembered, to find its place again. */
const CONTEXT = 24;

/**
 * Put the markup back into an edited block. Returns { ok, md, missing }.
 * Every protected span must still be present verbatim; otherwise nothing is written.
 */
export function unflatten(editedText, protectedSpans) {
  const missing = [];
  const claimed = [];   // { start, end, span }

  // Containers first, so a span inside another (**`x`**) is placed inside the one that holds it.
  const order = protectedSpans
    .map((span, at) => ({ span, at }))
    .sort((a, b) => b.span.text.length - a.span.text.length || CONTAINER.indexOf(b.span.kind) - CONTAINER.indexOf(a.span.kind) || a.at - b.at);

  for (const { span } of order) {
    const len = span.text.length;
    const candidates = [];
    for (let at = len ? editedText.indexOf(span.text) : -1; at !== -1; at = editedText.indexOf(span.text, at + 1)) {
      const fits = claimed.every((c) => {
        if (at + len <= c.start || at >= c.end) return true;                       // beside it
        const inside = at >= c.start && at + len <= c.end;
        const sameRange = at === c.start && at + len === c.end;
        return inside && CONTAINER.includes(c.span.kind) && !(sameRange && c.span.kind === span.kind);
      });
      if (fits) candidates.push(at);
    }
    if (!candidates.length) { missing.push(span); continue; }

    // The same words may occur more than once. Choose the occurrence whose neighbours look most like
    // the ones the span had; failing that, the same occurrence number; failing that, the first.
    let best = candidates[0];
    let bestScore = -1;
    const all = [];
    for (let at = editedText.indexOf(span.text); at !== -1; at = editedText.indexOf(span.text, at + 1)) all.push(at);
    for (const at of candidates) {
      const score = 2 * (commonSuffix(editedText.slice(0, at), span.before ?? '') + commonPrefix(editedText.slice(at + len), span.after ?? ''))
        + (all.indexOf(at) === span.nth ? 1 : 0);
      if (score > bestScore) { best = at; bestScore = score; }
    }
    claimed.push({ start: best, end: best + len, span });
  }

  claimed.sort((a, b) => a.start - b.start || b.end - a.end || CONTAINER.indexOf(b.span.kind) - CONTAINER.indexOf(a.span.kind));
  const render = (from, to, items) => {
    let md = '';
    let at = from;
    for (let k = 0; k < items.length;) {
      const outer = items[k];
      const inner = [];
      let n = k + 1;
      while (n < items.length && items[n].start >= outer.start && items[n].end <= outer.end) { inner.push(items[n]); n += 1; }
      md += editedText.slice(at, outer.start) + wrap(outer.span, render(outer.start, outer.end, inner));
      at = outer.end;
      k = n;
    }
    return md + editedText.slice(at, to);
  };
  return { ok: missing.length === 0, md: render(0, editedText.length, claimed), missing };
}

/** Kinds that may hold another span inside them. */
const CONTAINER = ['em', 'strong', 'link', 'html'];

function wrap(span, inner) {
  if (span.kind === 'jsx') return span.jsx;
  if (span.kind === 'raw') return span.raw;
  if (span.kind === 'html') return `${span.open}${inner}</${span.tag}>`;
  if (span.kind === 'link') return `[${inner}](${span.url})`;
  if (span.kind === 'code') return `\`${span.text}\``;
  if (span.kind === 'strong') return `**${inner}**`;
  return `*${inner}*`;
}

function commonPrefix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return n;
}

function commonSuffix(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n += 1;
  return n;
}

// ---------------------------------------------------------------- mdx pages

/**
 * Parse one .mdx page into blocks. Line-based on purpose: the writer-back replaces exact line
 * ranges, so a block always knows the lines it came from and nothing else in the file moves.
 */
export function parseMdx(absPath, repoRoot) {
  const file = relative(repoRoot, absPath);
  const src = readFileSync(absPath, 'utf8');
  const lines = src.split('\n');
  const blocks = [];
  let ordinal = 0;

  const push = (kind, startLine, endLine, raw, indent = '', extra = {}) => {
    const { text, protectedSpans, unsafe } = flatten(raw, repoRoot);
    // A block holding a component with no readable text is not offered for editing at all.
    if (unsafe || !text.trim()) return;
    ordinal += 1;
    blocks.push({
      id: blockId(file, ordinal, raw),
      file, kind, startLine, endLine, raw, indent, protectedSpans,
      text: text.trim(),
      ...extra,
    });
  };

  let i = 0;

  // --- frontmatter: only `description:` is prose a reader meets (in search results and tabs)
  if (lines[0] === '---') {
    let end = 1;
    while (end < lines.length && lines[end] !== '---') end += 1;
    for (let k = 1; k < end; k += 1) {
      const m = /^description:\s*(.*)$/.exec(lines[k]);
      if (!m) continue;
      let value = m[1].trim();
      // Only a single-line scalar; a folded block is left alone.
      if (!value || value === '>' || value === '|') continue;
      const quote = value[0] === '"' || value[0] === "'" ? value[0] : '';
      if (quote) value = value.slice(1, value.endsWith(quote) ? -1 : undefined);
      // Inside single quotes YAML writes an apostrophe twice. She must see "builder's", not "builder''s",
      // and the block's raw text must be what renderBlock would write back, or it reads as stale for ever.
      const shown = quote === "'" ? value.replace(/''/g, "'") : value;
      push('description', k, k, shown, '', { quote });
    }
    i = end + 1;
  }

  let inFence = false;
  let fenceMark = '';
  /** Stack of open prose components; their children are parsed as markdown. */
  const openProse = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // code fences
    const fence = /^(\s*)(```+|~~~+)/.exec(line);
    if (fence) {
      if (!inFence) { inFence = true; fenceMark = fence[2][0].repeat(3); }
      else if (trimmed.startsWith(fenceMark)) { inFence = false; }
      i += 1; continue;
    }
    if (inFence) { i += 1; continue; }

    if (!trimmed) { i += 1; continue; }
    if (/^import\s/.test(trimmed) || /^export\s/.test(trimmed)) { i += 1; continue; }

    // a <style> block: CSS, never prose. Skip to its close, which may be the same line.
    if (/^<style\b/.test(trimmed)) {
      let k = i;
      while (k < lines.length && !/<\/style>/.test(lines[k])) k += 1;
      i = k + 1; continue;
    }
    if (trimmed.startsWith('|')) { i += 1; continue; }            // table row
    if (/^<!--/.test(trimmed)) { i += 1; continue; }               // comment
    if (/^(:::|<\/?(Tabs|CardGrid|StepList|div|section|figure)\b)/.test(trimmed)) { i += 1; continue; }

    // a JSX expression container: {tools.map((t) => ( ... ))}. Not prose; skip it brace-balanced.
    if (trimmed.startsWith('{')) {
      let depth = 0;
      let str = null;
      let k = i;
      let closed = false;
      for (; k < lines.length && !closed; k += 1) {
        const l = lines[k];
        for (let c = 0; c < l.length; c += 1) {
          const ch = l[c];
          if (str) {
            if (ch === '\\') { c += 1; continue; }
            if (ch === str) str = null;
            continue;
          }
          if (ch === '"' || ch === "'" || ch === '`') { str = ch; continue; }
          if (ch === '{') depth += 1;
          else if (ch === '}') { depth -= 1; if (depth === 0) { closed = true; break; } }
        }
      }
      i = closed ? k : i + 1;
      continue;
    }

    // closing tag of a prose component
    const close = /^<\/([A-Z][\w.]*)>/.exec(trimmed);
    if (close && openProse.at(-1) === close[1]) { openProse.pop(); i += 1; continue; }

    // an opening JSX component
    const open = /^<([A-Z][\w.]*)/.exec(trimmed);
    if (open) {
      const name = open[1];
      const { endLine, selfClosing } = findTagEnd(lines, i);
      if (selfClosing) { i = endLine + 1; continue; }
      if (!PROSE_CHILDREN.has(name)) {
        // a container whose children are not prose: skip past its matching close
        let depth = 1;
        let k = endLine + 1;
        for (; k < lines.length && depth > 0; k += 1) {
          if (new RegExp(`<${name}\\b`).test(lines[k])) depth += 1;
          if (new RegExp(`</${name}>`).test(lines[k])) depth -= 1;
        }
        i = k; continue;
      }
      openProse.push(name);
      i = endLine + 1; continue;
    }

    // --- markdown prose

    // heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      push('heading', i, i, heading[2].trim(), '', { level: heading[1].length });
      i += 1; continue;
    }

    // list item, possibly wrapping over following indented lines
    const li = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      const start = i;
      const parts = [li[3]];
      let k = i + 1;
      while (k < lines.length) {
        const nxt = lines[k];
        if (!nxt.trim()) break;
        if (/^(\s*)([-*+]|\d+\.)\s+/.test(nxt)) break;
        if (/^(#{1,6})\s/.test(nxt.trim()) || nxt.trim().startsWith('<') || nxt.trim().startsWith('|')) break;
        parts.push(nxt.trim());
        k += 1;
      }
      const itemText = parts.join(' ');
      const itemHeading = /^(#{1,6})\s+(.*)$/.exec(itemText);
      if (itemHeading) {
        // "1. ### Verify your wallet" inside a StepList: the page renders a heading, so treat it
        // as one, or its text never matches what the reader sees.
        push('heading', start, k - 1, itemHeading[2].trim(), `${li[1]}${li[2]} `, { level: itemHeading[1].length });
      } else {
        push('listItem', start, k - 1, itemText, `${li[1]}${li[2]} `, { bullet: li[2] });
      }
      i = k; continue;
    }

    // paragraph: run to the next blank line or structural line
    const start = i;
    const parts = [];
    let k = i;
    while (k < lines.length) {
      const nxt = lines[k];
      if (!nxt.trim()) break;
      const t = nxt.trim();
      if (/^(#{1,6})\s/.test(t) || t.startsWith('|') || t.startsWith('<') || t.startsWith(':::')) break;
      if (/^(\s*)([-*+]|\d+\.)\s+/.test(nxt) && k > start) break;
      if (/^(```+|~~~+)/.test(t)) break;
      parts.push(t);
      k += 1;
    }
    // Keep the first line's indent: a paragraph inside a numbered step is indented, and writing
    // it back at column zero would break the step it belongs to.
    if (parts.length) push('paragraph', start, k - 1, parts.join(' '), /^\s*/.exec(lines[start])[0]);
    i = Math.max(k, i + 1);
  }

  return blocks;
}

// ---------------------------------------------------------------- astro components

/**
 * Prose inside an .astro component: the text of a <p>, an <h1>/<h2>, and the title/text/eyebrow
 * props of the landing doors. Only single-line prop strings and simple element bodies, so the
 * writer-back stays exact. Styles and scripts are never touched.
 */
export function parseAstro(absPath, repoRoot) {
  const file = relative(repoRoot, absPath);
  const src = readFileSync(absPath, 'utf8');
  const lines = src.split('\n');
  const blocks = [];
  let ordinal = 0;

  const push = (kind, startLine, endLine, raw, indent, extra = {}) => {
    const { text, protectedSpans, unsafe } = flatten(raw, repoRoot);
    if (unsafe || !text.trim()) return;
    // A block that is nothing but `{card.outcome}` is code that prints words, not words: there is
    // nothing in it to edit, and deleting it blanks the line on every page that uses the component.
    const words = protectedSpans.filter((sp) => sp.kind === 'raw' && sp.text.startsWith('{')).reduce((t, sp) => t.replace(sp.text, ''), text);
    if (!words.trim()) return;
    ordinal += 1;
    blocks.push({ id: blockId(file, ordinal, raw), file, kind, startLine, endLine, raw, indent, protectedSpans, text: text.trim(), ...extra });
  };

  let inStyle = false;
  let inScript = false;
  let inFrontmatter = lines[0] === '---';
  let seenFrontmatterEnd = !inFrontmatter;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const t = line.trim();
    if (inFrontmatter) {
      if (i > 0 && t === '---') { inFrontmatter = false; seenFrontmatterEnd = true; }
      continue;
    }
    if (!seenFrontmatterEnd) continue;
    if (/^<style/.test(t)) inStyle = true;
    if (/^<\/style>/.test(t)) { inStyle = false; continue; }
    if (/^<script/.test(t)) inScript = true;
    if (/^<\/script>/.test(t)) { inScript = false; continue; }
    if (inStyle || inScript) continue;

    // <p>one line</p> or <h1 ...>one line</h1>
    const oneLine = /^(\s*)(<(p|h1|h2|h3|li)\b[^>]*>)(.+)(<\/\3>)\s*$/.exec(line);
    if (oneLine && !oneLine[4].includes('<' + oneLine[3])) {
      // The tags are kept with the block. Without them the writer-back compared the words alone with
      // the whole line, never matched, and called 38 blocks stale for ever (audit 2026-09-19, W3).
      push('element', i, i, oneLine[4], oneLine[1], { tag: oneLine[3], open: oneLine[2], close: oneLine[5] });
      continue;
    }

    // <p ...> on its own line, text on the next, </p> after
    const openTag = /^(\s*)<(p|h1|h2|h3|li)\b[^>]*>\s*$/.exec(line);
    if (openTag) {
      const body = [];
      let k = i + 1;
      while (k < lines.length && !new RegExp(`^\\s*</${openTag[2]}>`).test(lines[k])) {
        body.push(lines[k].trim());
        k += 1;
      }
      if (k < lines.length && body.length && !body.some((b) => b.startsWith('<'))) {
        push('element', i + 1, k - 1, body.join(' '), `${openTag[1]}  `, { tag: openTag[2] });
        i = k;
        continue;
      }
    }

    // prop strings on a component line: title="..." text="..." eyebrow="..." label="..."
    if (/^\s*<[A-Z]/.test(line)) {
      for (const prop of ['eyebrow', 'title', 'text', 'label']) {
        const re = new RegExp(`${prop}="([^"]+)"`);
        const m = re.exec(line);
        if (m) push('prop', i, i, m[1], '', { prop });
      }
    }
  }

  return blocks;
}

// ---------------------------------------------------------------- data files

/**
 * Prose fields in a .ts data file: single-quoted, single-line string literals on a named field.
 * Only the fields a reader meets on a page.
 */
const DATA_FIELDS = {
  'src/data/tools.ts': ['summary', 'statusLabel'],
  'src/data/cards.ts': ['outcome', 'learn', 'tip'],
  'src/data/rules.ts': ['summary', 'what'],
  'src/data/tips.ts': ['tip'],
};

export function parseData(absPath, repoRoot) {
  const file = relative(repoRoot, absPath);
  const fields = DATA_FIELDS[file.split('/').slice(-3).join('/')] ?? DATA_FIELDS[file] ?? null;
  if (!fields) return [];
  const src = readFileSync(absPath, 'utf8');
  const lines = src.split('\n');
  const blocks = [];
  let ordinal = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const field of fields) {
      const m = new RegExp(`^(\\s*)${field}:\\s*'(.*)',?\\s*$`).exec(line);
      if (!m) continue;
      const raw = m[2].replace(/\\'/g, "'");
      if (!raw.trim()) continue;
      const { text, protectedSpans, unsafe } = flatten(raw, repoRoot);
      if (unsafe) continue;
      ordinal += 1;
      blocks.push({
        id: blockId(file, ordinal, raw),
        file, kind: 'dataField', startLine: i, endLine: i, raw, indent: m[1],
        protectedSpans, text: text.trim(), field,
      });
    }
  }
  return blocks;
}

/** Rebuild the source lines for a block from its edited markdown. */
export function renderBlock(block, md) {
  if (block.kind === 'description') {
    // A frontmatter description is a YAML scalar. A rewrite can introduce a colon, a quote or a
    // leading special character that an unquoted scalar cannot carry, so quote whenever the value
    // needs it rather than trusting the quoting the block happened to arrive with. Getting this
    // wrong fails the whole content build with "bad indentation of a mapping entry".
    const needsQuoting = /: |:$|^[\s>|&*!%@`#[\]{},"']|#\s|\s$/.test(md);
    if (!needsQuoting && !block.quote) return [`description: ${md}`];
    return [`description: '${md.replace(/'/g, "''")}'`];
  }
  if (block.kind === 'heading') return [`${block.indent ?? ''}${'#'.repeat(block.level)} ${md}`];
  if (block.kind === 'listItem') return [`${block.indent}${md}`];
  if (block.kind === 'paragraph') return [`${block.indent ?? ''}${md}`];
  if (block.kind === 'element') return [`${block.indent}${block.open ?? ''}${md}${block.close ?? ''}`];
  if (block.kind === 'prop') return null;   // handled in place by apply-text
  if (block.kind === 'dataField') return [`${block.indent}${block.field}: '${md.replace(/'/g, "\\'")}',`];
  return [md];
}
