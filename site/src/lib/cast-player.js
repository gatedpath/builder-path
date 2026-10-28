// The Play button on a terminal recording (src/components/Cast.astro). One file, used twice: the
// published site imports it as a module, and scripts/build-offline.mjs writes it into the offline
// copy as an ordinary script, because a browser will not load a module from a folder on disk.
// So it imports only cast-term.js, and build-offline joins the two files together.
//
// Replay is not the recording's timing, and the caption says so. Three things are changed so that a
// person can follow it, all here and none in the recording file:
//   - a wait longer than `gap` seconds is shortened to `gap`, whether it is silence or a spinner;
//   - a piece of output that lands many lines at once (forge prints a whole suite in one go) is
//     let out a line at a time over a fraction of a second, so it scrolls and does not jump;
//   - the command is typed out before it runs.
// The first version redrew the whole screen for every piece, 683 times for one npm install, and
// let the box collapse to one line when Play was pressed, so the page jumped and the replay
// stuttered (the owner's report, 21 September 2026). Now it draws at most once a frame, and the
// box keeps its height while it plays.
import { createScreen, feed, toHtml } from './cast-term.js';

const BURST_LINES = 6;        // a piece with more lines than this is spread out
const LINE_SECONDS = 0.012;   // how long each of its lines takes
const BURST_SECONDS = 0.4;    // and the most any one piece may take
const KEY_SECONDS = 0.028;    // typing speed for the command
const AFTER_TYPING = 0.25;    // the pause between the command and its output

/**
 * The recording's pieces, re-timed for a person to watch.
 * @param {[number, string][]} events @param {number} gap
 * @returns {[number, string][]}
 */
export function schedule(events, gap) {
  /** @type {[number, string][]} */
  const out = [];
  let at = 0;
  // How long nothing but one line has been changing. A spinner redraws its own line many times a
  // second, so an npm install is 37 seconds with no silence in it at all; to a reader it is one
  // long wait. Time stops counting once a stretch like that has had `gap` seconds, and the frames
  // after that are drawn together, until a piece arrives that ends a line.
  let still = 0;
  for (let i = 0; i < events.length; i += 1) {
    const [time, data] = events[i];
    if (i > 0) {
      const wait = Math.min(Math.max(0, time - events[i - 1][0]), gap);
      const allowed = Math.max(0, gap - still);
      at += Math.min(wait, allowed);
      still += wait;
    }
    if (data.includes('\n')) still = 0;
    if (/^\$ .*\r\n$/.test(data) && !data.includes('\x1b')) {
      // The prompt line the recorder wrote: type it.
      out.push([at, '$ ']);
      for (const ch of data.slice(2, -2)) { at += KEY_SECONDS; out.push([at, ch]); }
      at += AFTER_TYPING;
      out.push([at, '\r\n']);
      continue;
    }
    // An instruction never contains a newline, so cutting after one never cuts an instruction.
    const lines = data.split(/(?<=\n)/);
    if (lines.length <= BURST_LINES) { out.push([at, data]); continue; }
    const each = Math.min(LINE_SECONDS, BURST_SECONDS / lines.length);
    for (const line of lines) { out.push([at, line]); at += each; }
  }
  return out;
}

/**
 * A recording's replay data, fetched the first time it is asked for. It arrives as a script that
 * calls window.__rbCast (see src/pages/casts/[id].js.ts for why it is not JSON).
 * @param {string} id @param {string} src
 * @returns {Promise<{ gap: number, events: [number, string][] }>}
 */
const waiting = new Map();
function loadData(id, src) {
  window.__rbCast ??= (/** @type {string} */ gotId, /** @type {any} */ data) => { waiting.get(gotId)?.(data); waiting.delete(gotId); };
  return new Promise((resolve, reject) => {
    waiting.set(id, resolve);
    const tag = document.createElement('script');
    tag.src = src;
    tag.onerror = () => { waiting.delete(id); tag.remove(); reject(new Error('not loaded')); };
    document.head.appendChild(tag);
  });
}

/**
 * Wire every recording on the page. Safe to call once per page load.
 *
 * The box is a terminal window, not a scrolling region: 80 columns by about 24 rows, long lines wrapped to the
 * width of the view, no scrollbar either way (the owner's request, 21 September 2026). At rest it
 * shows the end of the run, where the result is. A run longer than the window gets a second
 * button that opens all of it in place, so the page grows and nothing scrolls inside it. With
 * scripts off none of this runs and the whole output is simply shown.
 */
export function mountCasts() {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const figure of document.querySelectorAll('.rb-cast')) {
    const button = figure.querySelector('.rb-cast__play');
    const all = figure.querySelector('.rb-cast__all');
    const pre = figure.querySelector('.rb-cast__screen');
    const code = pre?.querySelector('code');
    const id = figure.dataset.cast;
    const src = figure.dataset.src;
    if (!button || !all || !pre || !code || !id || !src || figure.dataset.mounted) continue;
    figure.dataset.mounted = '';
    const everything = code.innerHTML;
    const lineCount = (code.textContent ?? '').split('\n').length;
    /** @type {[number, string][] | undefined} */
    let plan;
    let frame = 0;
    let playing = false;

    // The window: clipped to its rows, looking at the end. overflow is hidden, and a hidden box
    // can still be moved by script, which is how a terminal follows its output.
    const toEnd = () => { pre.scrollTop = pre.scrollHeight; };
    const window_ = (/** @type {boolean} */ on) => {
      figure.classList.toggle('rb-cast--window', on);
      all.textContent = on ? `Show all ${lineCount} lines` : 'Show the end only';
      all.setAttribute('aria-expanded', String(!on));
      if (on) toEnd();
    };
    window_(true);
    // A run that fits, or nearly fits, is shown whole and gets no button: cutting the top off a
    // twenty-line run to save five rows would hide the command for nothing.
    const fits = pre.scrollHeight <= pre.clientHeight * 1.5;
    if (fits) window_(false);
    all.hidden = fits;
    all.addEventListener('click', () => { if (!playing) window_(!figure.classList.contains('rb-cast--window')); });
    // A narrower view wraps more lines, so the end moves.
    window.addEventListener('resize', () => { if (!playing && figure.classList.contains('rb-cast--window')) toEnd(); });

    // Reduced motion: nothing moves, and nothing is taken away either. Until 22 September 2026 the
    // player stopped here with the box still clipped to its last screen and no button, so a reader
    // with that setting saw a dead terminal and no sign a recording existed. Now the whole run is
    // opened out, the clipping toggle goes (there is nothing left to expand) and a line says why
    // there is nothing to press.
    if (still) {
      window_(false);
      all.hidden = true;
      const note = document.createElement('p');
      note.className = 'rb-cast__note';
      note.textContent = 'Your system asks for less motion, so this run is shown in full here rather than played.';
      figure.append(note);
      continue;
    }

    const stop = (/** @type {string} */ label) => {
      window.cancelAnimationFrame(frame);
      playing = false;
      code.innerHTML = everything;
      pre.style.height = '';
      all.disabled = false;
      toEnd();
      button.textContent = label;
    };
    const play = async () => {
      if (!plan) {
        // The first press fetches the recording. Nothing of it was in the page until now.
        button.disabled = true;
        button.textContent = 'Loading…';
        try { const { gap, events } = await loadData(id, src); plan = schedule(events, gap); }
        catch { button.textContent = 'Could not load the recording'; button.disabled = false; return; }
        button.disabled = false;
      }
      playing = true;
      button.textContent = 'Stop';
      all.disabled = true;
      if (!fits) window_(true);
      // Keep the box the size it is now. Without this it shrinks to one line and everything under
      // it on the page jumps up, then is pushed back down as the lines arrive.
      pre.style.height = `${pre.offsetHeight}px`;
      const screen = createScreen();
      const began = performance.now();
      let next = 0;
      const tick = (/** @type {number} */ now) => {
        const elapsed = (now - began) / 1000;
        let fed = false;
        while (next < plan.length && plan[next][0] <= elapsed) { feed(screen, plan[next][1]); next += 1; fed = true; }
        if (fed) { code.innerHTML = toHtml(screen); toEnd(); }
        if (next >= plan.length) { stop('Play it again'); return; }
        frame = window.requestAnimationFrame(tick);
      };
      code.innerHTML = '';
      frame = window.requestAnimationFrame(tick);
    };
    button.addEventListener('click', () => (playing ? stop('Play the recording') : play()));
    button.hidden = false;
  }
}
