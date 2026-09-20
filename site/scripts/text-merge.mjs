// What the text exporter does with a file that already exists in "Website Text Edits/".
//
// The question is "did she edit this block?", and the only honest way to answer it is to compare
// her file with what she was last GIVEN, which is the previous manifest. Comparing with the page
// source as it is today gets it wrong the moment a session edits a page: her untouched file looks
// edited, it is left alone while the manifest moves on, and the writer-back then reads her stale
// text as an edit and puts the old wording back over the correction (met on 17 September 2026).

/**
 * Pull `[marker] LABEL\n text...` blocks out of one text file: marker -> the words, on one line.
 * The same reading apply-text.mjs does, so "unchanged" means the same thing in both.
 */
export function readEdited(text) {
  const out = new Map();
  let marker = null;
  let buf = [];
  const flush = () => {
    if (!marker) return;
    const body = buf.join('\n').replace(/^\s+|\s+$/g, '');
    if (body) out.set(marker, body.split('\n').map((l) => l.trim()).filter(Boolean).join(' '));
    marker = null; buf = [];
  };
  for (const line of text.split('\n')) {
    const m = /^\[(\d+\.\d+)\]\s/.exec(line);
    if (m) { flush(); marker = m[1]; continue; }
    if (/^={10,}$/.test(line.trim())) { flush(); continue; }
    // `# was: ...` is the offline editor's note of the paragraph an edit was written for, not her words.
    if (marker && !/^# was: /.test(line)) buf.push(line);
  }
  flush();
  return out;
}

/** marker -> the paragraph an edit was written for, from the `# was:` lines a browser export carries. */
export function readOrigins(text) {
  const out = new Map();
  let marker = null;
  for (const line of text.split('\n')) {
    const m = /^\[(\d+\.\d+)\]\s/.exec(line);
    if (m) { marker = m[1]; continue; }
    if (/^={10,}$/.test(line.trim())) { marker = null; continue; }
    const was = /^# was: (.*)$/.exec(line);
    if (marker && was) out.set(marker, was[1].trim());
  }
  return out;
}

const norm = (s) => String(s).split('\n').map((l) => l.trim()).filter(Boolean).join(' ');

/**
 * Decide what to write for one page.
 *
 *   oldBlocks  the page's blocks in the previous manifest ([{ marker, text }]), or null if none
 *   newBlocks  the page's blocks as just read from the source
 *   onDisk     the text file as it is now
 *
 * Returns { action, blocks, carried, conflicts, unknown }:
 *   current   nothing of hers, nothing moved                 -> rewrite (a no-op)
 *   refresh   nothing of hers, the page moved on             -> rewrite from the source
 *   keep      her edits, the page did not move               -> leave her file exactly as it is
 *   merge     her edits and the page moved                   -> rewrite, her wording carried over
 * `blocks` is newBlocks with `text` set to what goes in the file and `sourceText` to what the page
 * says; the manifest must record sourceText, or the writer-back could not see her edit.
 * `conflicts` are blocks both sides changed: the page's text goes in the file and her wording is
 * handed back to the caller to save, never dropped.
 */
export function planFile({ oldBlocks, newBlocks, onDisk }) {
  const plain = newBlocks.map((b) => ({ ...b, sourceText: b.text }));
  if (!oldBlocks) return { action: 'keep', blocks: plain, carried: [], conflicts: [], unknown: [] };

  const hers = readEdited(onDisk);
  const oldByMarker = new Map(oldBlocks.map((b) => [b.marker, norm(b.text)]));
  const unknown = [...hers.keys()].filter((m) => !oldByMarker.has(m));

  const edits = [];
  for (const [marker, was] of oldByMarker) {
    const now = hers.get(marker);
    if (now !== undefined && now !== was) edits.push({ marker, was, hers: now });
  }

  const moved = oldBlocks.length !== newBlocks.length || oldBlocks.some((b, i) => norm(b.text) !== norm(newBlocks[i].text));
  if (!edits.length) return { action: moved ? 'refresh' : 'current', blocks: plain, carried: [], conflicts: [], unknown };
  if (!moved) return { action: 'keep', blocks: plain, carried: edits.map((e) => ({ marker: e.marker, newMarker: e.marker, text: e.hers })), conflicts: [], unknown };

  // Her block is found again by the words it had when she was given it, not by its marker: a
  // paragraph added above it shifts every marker below. Each new block is claimed once, in order,
  // so two identical paragraphs on a page pair up first with first.
  const claimed = new Set();
  const carried = [];
  const conflicts = [];
  for (const edit of edits) {
    const at = plain.findIndex((b, i) => !claimed.has(i) && norm(b.sourceText) === edit.was);
    if (at < 0) { conflicts.push(edit); continue; }
    claimed.add(at);
    plain[at].text = edit.hers;
    carried.push({ marker: edit.marker, newMarker: plain[at].marker, text: edit.hers });
  }
  return { action: 'merge', blocks: plain, carried, conflicts, unknown };
}
