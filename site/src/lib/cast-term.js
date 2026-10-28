// A very small terminal, for replaying our own recordings (PLAN.md 20.4, option B of
// research/recorder-player-check-2026-09-21-draft.md).
//
// It understands the handful of instructions that forge, npm and our own tools print: colour and
// bold, return to the start of the line, erase, and moving the cursor a few lines or columns. It
// is not a terminal emulator and does not try to be. Anything it does not know it records in
// `screen.unknown` and otherwise skips, and scripts/check-casts.mjs fails the build on a recording
// that has any. So the player, the transcript a reader sees with scripts off, and the gate all
// read a recording through this one file and cannot disagree about what is drawable.
//
// Plain JavaScript with JSDoc types, not TypeScript, because three things import it: the Astro
// component at build, the page's script, and a Node script.

/** @typedef {{ fg: string, bg: string, bold: boolean, dim: boolean, italic: boolean, underline: boolean }} Style */
/** @typedef {[string, string]} Cell  a character and the class list it is drawn with */
/** @typedef {{ lines: Cell[][], row: number, col: number, style: Style, saved: [number, number], pending: string, unknown: string[] }} Screen */

/** @returns {Style} */
const plain = () => ({ fg: '', bg: '', bold: false, dim: false, italic: false, underline: false });

/** @returns {Screen} */
export function createScreen() {
  return { lines: [[]], row: 0, col: 0, style: plain(), saved: [0, 0], pending: '', unknown: [] };
}

/** @param {Style} s */
function classes(s) {
  const c = [];
  if (s.fg) c.push(s.fg);
  if (s.bg) c.push(s.bg);
  if (s.bold) c.push('b');
  if (s.dim) c.push('d');
  if (s.italic) c.push('i');
  if (s.underline) c.push('u');
  return c.join(' ');
}

/** @param {Screen} screen @param {string} ch */
function put(screen, ch) {
  while (screen.lines.length <= screen.row) screen.lines.push([]);
  const line = screen.lines[screen.row];
  while (line.length < screen.col) line.push([' ', '']);
  line[screen.col] = [ch, classes(screen.style)];
  screen.col += 1;
}

/** The xterm 256-colour cube and grey ramp, as a CSS colour. @param {number} n */
function colour256(n) {
  if (n >= 232) { const v = 8 + (n - 232) * 10; return `rgb(${v},${v},${v})`; }
  const i = n - 16;
  const step = (/** @type {number} */ k) => (k === 0 ? 0 : 55 + k * 40);
  return `rgb(${step(Math.floor(i / 36))},${step(Math.floor(i / 6) % 6)},${step(i % 6)})`;
}

/** Select Graphic Rendition: colour and weight. @param {Screen} screen @param {number[]} p */
function sgr(screen, p) {
  const s = screen.style;
  if (p.length === 0) p = [0];
  for (let i = 0; i < p.length; i += 1) {
    const n = p[i];
    if (n === 0) Object.assign(s, plain());
    else if (n === 1) s.bold = true;
    else if (n === 2) s.dim = true;
    else if (n === 3) s.italic = true;
    else if (n === 4) s.underline = true;
    else if (n === 22) { s.bold = false; s.dim = false; }
    else if (n === 23) s.italic = false;
    else if (n === 24) s.underline = false;
    else if (n >= 30 && n <= 37) s.fg = `f${n - 30}`;
    else if (n >= 90 && n <= 97) s.fg = `f${n - 90 + 8}`;
    else if (n === 39) s.fg = '';
    else if (n >= 40 && n <= 47) s.bg = `g${n - 40}`;
    else if (n >= 100 && n <= 107) s.bg = `g${n - 100 + 8}`;
    else if (n === 49) s.bg = '';
    else if ((n === 38 || n === 48) && p[i + 1] === 5 && p[i + 2] !== undefined) {
      const c = p[i + 2];
      const value = c < 16 ? `${n === 38 ? 'f' : 'g'}${c}` : `${n === 38 ? 'fx' : 'gx'}:${colour256(c)}`;
      if (n === 38) s.fg = value; else s.bg = value;
      i += 2;
    } else if ((n === 38 || n === 48) && p[i + 1] === 2 && p[i + 4] !== undefined) {
      const value = `${n === 38 ? 'fx' : 'gx'}:rgb(${p[i + 2]},${p[i + 3]},${p[i + 4]})`;
      if (n === 38) s.fg = value; else s.bg = value;
      i += 4;
    } else screen.unknown.push(`SGR ${n}`);
  }
}

/** @param {Screen} screen @param {string} params @param {string} final */
function csi(screen, params, final) {
  // Private modes (cursor visibility, bracketed paste, and the like) change nothing we draw.
  if (params.startsWith('?') && (final === 'h' || final === 'l')) return;
  const p = params === '' ? [] : params.split(/[;:]/).map((x) => Number(x) || 0);
  const n = p[0] || 1;
  const line = () => { while (screen.lines.length <= screen.row) screen.lines.push([]); return screen.lines[screen.row]; };
  switch (final) {
    case 'm': sgr(screen, p); break;
    case 'A': screen.row = Math.max(0, screen.row - n); break;
    case 'B': screen.row += n; break;
    case 'C': screen.col += n; break;
    case 'D': screen.col = Math.max(0, screen.col - n); break;
    case 'G': screen.col = Math.max(0, n - 1); break;
    case 'K': {
      const mode = p[0] || 0;
      const l = line();
      if (mode === 0) l.length = Math.min(l.length, screen.col);
      else if (mode === 1) for (let i = 0; i <= screen.col && i < l.length; i += 1) l[i] = [' ', ''];
      else l.length = 0;
      break;
    }
    case 'J': {
      // Erase below the cursor. "Erase everything" is how a tool clears the screen; we have no
      // screen, only a scroll of lines, so it starts a fresh line and keeps what was printed.
      const mode = p[0] || 0;
      if (mode === 0) { line().length = Math.min(line().length, screen.col); screen.lines.length = screen.row + 1; }
      else screen.unknown.push(`CSI ${params}J`);
      break;
    }
    case 's': screen.saved = [screen.row, screen.col]; break;
    case 'u': [screen.row, screen.col] = screen.saved; break;
    default: screen.unknown.push(`CSI ${params}${final}`);
  }
}

/**
 * Feed a piece of output to the screen. Pieces may end in the middle of an instruction; the
 * remainder is kept and joined to the next piece.
 * @param {Screen} screen @param {string} data
 */
export function feed(screen, data) {
  const text = screen.pending + data;
  screen.pending = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\x1b') {
      const rest = text.slice(i);
      let m;
      if ((m = /^\x1b\[([0-9;:?<=>!]*)([ -/]*)([@-~])/.exec(rest))) { if (m[2]) screen.unknown.push(`CSI ${m[1]}${m[2]}${m[3]}`); else csi(screen, m[1], m[3]); i += m[0].length; continue; }
      if ((m = /^\x1b\][^\x07\x1b]*(\x07|\x1b\\)/.exec(rest))) { i += m[0].length; continue; }          // window title, hyperlinks
      if ((m = /^\x1b[()][0-9A-Za-z]/.exec(rest))) { i += m[0].length; continue; }                      // character set
      if ((m = /^\x1b[=>]/.exec(rest))) { i += m[0].length; continue; }                                 // keypad mode
      if (rest.startsWith('\x1b7')) { screen.saved = [screen.row, screen.col]; i += 2; continue; }
      if (rest.startsWith('\x1b8')) { [screen.row, screen.col] = screen.saved; i += 2; continue; }
      // Not finished yet? Keep it for the next piece. An instruction is never this long.
      if (rest.length < 64 && /^\x1b(\[[0-9;:?<=>!]*[ -/]*|\][^\x07\x1b]*\x1b?|[()])?$/.test(rest)) { screen.pending = rest; return; }
      screen.unknown.push(`ESC ${JSON.stringify(rest.slice(1, 4))}`);
      i += 1;
      continue;
    }
    if (ch === '\r') screen.col = 0;
    else if (ch === '\n') screen.row += 1;
    else if (ch === '\b') screen.col = Math.max(0, screen.col - 1);
    else if (ch === '\t') { const to = (Math.floor(screen.col / 8) + 1) * 8; while (screen.col < to) put(screen, ' '); }
    else if (ch === '\x07' || ch === '\x00') { /* bell, padding */ }
    else if (ch < ' ') screen.unknown.push(`control ${ch.charCodeAt(0)}`);
    else {
      // Keep a surrogate pair together so an emoji is one cell.
      const code = text.codePointAt(i) ?? 0;
      const whole = code > 0xffff ? text.slice(i, i + 2) : ch;
      put(screen, whole);
      i += whole.length;
      continue;
    }
    i += 1;
  }
}

const escapeHtml = (/** @type {string} */ s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Lines with trailing blanks removed, and no blank lines at the end. @param {Screen} screen */
function trimmed(screen) {
  const lines = screen.lines.map((l) => { let end = l.length; while (end > 0 && l[end - 1][0] === ' ' && !l[end - 1][1].includes('g')) end -= 1; return l.slice(0, end); });
  while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return lines;
}

/** What is on the screen, as text. @param {Screen} screen */
export function toText(screen) {
  return trimmed(screen).map((l) => l.map((c) => c[0]).join('')).join('\n');
}

/** What is on the screen, as HTML: one span per run of the same style. @param {Screen} screen */
export function toHtml(screen) {
  return trimmed(screen).map((l) => {
    let out = '';
    let run = '';
    let style = '';
    const flush = () => {
      if (!run) return;
      if (!style) { out += escapeHtml(run); run = ''; return; }
      const cls = [];
      const css = [];
      for (const part of style.split(' ')) {
        if (part.startsWith('fx:')) css.push(`color:${part.slice(3)}`);
        else if (part.startsWith('gx:')) css.push(`background:${part.slice(3)}`);
        else cls.push(`rb-t-${part}`);
      }
      out += `<span${cls.length ? ` class="${cls.join(' ')}"` : ''}${css.length ? ` style="${css.join(';')}"` : ''}>${escapeHtml(run)}</span>`;
      run = '';
    };
    for (const [ch, s] of l) { if (s !== style) { flush(); style = s; } run += ch; }
    flush();
    return out;
  }).join('\n');
}

/**
 * Read a recording in asciinema's version 2 format: a header line, then one event per line.
 * @param {string} source
 * @returns {{ header: Record<string, any>, events: [number, string, string][] }}
 */
export function parseCast(source) {
  const rows = source.split('\n').filter((l) => l.trim() !== '');
  const header = JSON.parse(rows[0]);
  if (header.version !== 2) throw new Error(`cast: version ${header.version}, expected 2`);
  return { header, events: rows.slice(1).map((l) => JSON.parse(l)) };
}
