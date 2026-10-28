// Copying, for every copy button on the site. One file, used twice, like cast-player.js: the
// published site imports it as a module, and scripts/build-offline.mjs writes it into the offline
// copy as an ordinary script, because a browser will not load a module from a folder on disk.
//
// Two faults this fixes (the owner's report, 21 September 2026). Our own buttons tried only the
// modern clipboard route, which a browser refuses inside an embedded pane and on a page opened
// from disk, and said "Copy failed" when the older route would have worked. And in the offline
// copy the code blocks' buttons said nothing at all, because the code-block library's own script
// is a module and never loaded there.

/**
 * Put text on the clipboard. The modern route first; if the browser refuses it, the older one,
 * which needs no permission while a click is being handled.
 * @param {string} text @returns {Promise<boolean>} whether it worked
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* refused: try the older route */ }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
  document.body.appendChild(area);
  const selection = document.getSelection();
  const kept = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
  area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  area.remove();
  if (kept && selection) { selection.removeAllRanges(); selection.addRange(kept); }
  return ok;
}

/** The text one of our own buttons copies: an element's text, or a file it names. @param {HTMLElement} btn */
async function read(btn) {
  const id = btn.dataset.copyTarget;
  if (id) {
    const el = document.getElementById(id);
    if (el instanceof HTMLTemplateElement) return el.content.textContent ?? '';
    if (el) return el.textContent ?? '';
  }
  const url = btn.dataset.copyUrl;
  if (url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    return r.text();
  }
  return '';
}

/** Say what happened on the button itself, then put its words back. @param {HTMLElement} btn @param {string} text @param {boolean} ok */
function flash(btn, text, ok) {
  const label = btn.querySelector('[data-copy-label]');
  if (!label) return;
  btn.dataset.copyWas ??= label.textContent ?? '';
  label.textContent = text;
  btn.toggleAttribute('data-copied', ok);
  window.clearTimeout(Number(btn.dataset.copyTimer));
  btn.dataset.copyTimer = String(window.setTimeout(() => { label.textContent = btn.dataset.copyWas ?? ''; btn.removeAttribute('data-copied'); }, 1800));
}

// The code-block library keeps the code in data-code with its line ends written as the DEL
// character (code 127). Built from its number so that no invisible character sits in this file.
const LINE_END = new RegExp(String.fromCharCode(127), 'g');

/**
 * Wire the copy buttons. Runs once a page however many times it is called.
 * `codeBlocks` is for the offline copy only: on the published site the code-block library wires
 * its own buttons and says "Copied!" itself, and doing it twice would show the message twice.
 * @param {{ codeBlocks?: boolean }} [options]
 */
export function mountCopy(options = {}) {
  if (window.__rbCopyMounted) return;
  window.__rbCopyMounted = true;
  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const ours = target?.closest('[data-rb-copy]');
    if (ours instanceof HTMLElement) {
      let text = '';
      try { text = await read(ours); } catch { flash(ours, 'Could not read the file', false); return; }
      const ok = await copyText(text);
      flash(ours, ok ? 'Copied' : 'Copy failed', ok);
      return;
    }
    const theirs = options.codeBlocks ? target?.closest('.expressive-code .copy button') : null;
    if (theirs instanceof HTMLElement) {
      const ok = await copyText((theirs.dataset.code ?? '').replace(LINE_END, '\n'));
      const live = theirs.parentElement?.querySelector('[aria-live]');
      if (!live) return;
      live.textContent = '';
      const note = document.createElement('div');
      note.className = 'feedback';
      note.textContent = ok ? (theirs.dataset.copied ?? 'Copied!') : 'Copy failed';
      live.append(note);
      window.requestAnimationFrame(() => note.classList.add('show'));
      window.setTimeout(() => { note.classList.remove('show'); window.setTimeout(() => note.remove(), 300); }, 1800);
    }
  });
}
