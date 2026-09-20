/* The offline site's text editor.
 *
 * Runs only in "Website Offline", from a folder on disk with no server and no internet, so:
 *   - nothing is fetched (fetch on a file:// URL is blocked); each page carries its own blocks
 *     inline as window.RB_PAGE, written by build-offline.mjs;
 *   - saving downloads a file, with a copy-to-clipboard fallback and the text on screen, because
 *     a download from file:// is not guaranteed;
 *   - localStorage may be unavailable, so it degrades to memory and says so.
 *
 * What it produces is the same [marker] format as "Website Text Edits/*.txt", so both ways of
 * editing feed one apply-text.mjs.
 */
(function () {
  'use strict';

  var PAGE = window.RB_PAGE;
  if (!PAGE || !PAGE.blocks || !PAGE.blocks.length) return;

  /* An edit is kept with the paragraph it was made on: { o: the original words, t: her words }.
     Version 1 kept her words by marker alone. Markers are paragraph numbers, a rebuild can renumber
     them, and an old edit then appeared on, and was saved against, a different paragraph
     (audit 2026-09-19, W4). */
  var KEY = 'rb-edits-v2';
  var OLD_KEY = 'rb-edits-v1';
  var ORPHAN_KEY = 'rb-edits-set-aside';
  var memory = {};
  var storageWorks = true;

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      var all = raw ? JSON.parse(raw) : {};
      var old = window.localStorage.getItem(OLD_KEY);
      if (old) {
        var legacy = JSON.parse(old);
        Object.keys(legacy).forEach(function (m) { if (!all[m]) all[m] = { o: null, t: legacy[m] }; });
        window.localStorage.removeItem(OLD_KEY);
        window.localStorage.setItem(KEY, JSON.stringify(all));
      }
      return all;
    } catch (e) { storageWorks = false; return memory; }
  }
  function loadOrphans() {
    try { return JSON.parse(window.localStorage.getItem(ORPHAN_KEY) || '[]'); } catch (e) { return []; }
  }
  function saveOrphans(list) {
    try { window.localStorage.setItem(ORPHAN_KEY, JSON.stringify(list)); } catch (e) { /* shown this session only */ }
  }
  /* Share of her words' vocabulary found in the paragraph: enough to tell "the same paragraph,
     reworded" from "a different paragraph". */
  function alike(a, b) {
    var wa = normalise(a).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    var wb = {}; normalise(b).toLowerCase().split(/[^a-z0-9]+/).forEach(function (w) { if (w) wb[w] = true; });
    if (!wa.length) return 0;
    return wa.filter(function (w) { return wb[w]; }).length / wa.length;
  }
  function save(all) {
    try { window.localStorage.setItem(KEY, JSON.stringify(all)); }
    catch (e) { storageWorks = false; memory = all; }
  }

  /* The page renders smart quotes and dashes where the source has plain ones, so both sides are
     flattened before they are compared. */
  function normalise(s) {
    return String(s)
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/ /g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* ---------------------------------------------------------------- match DOM to blocks */

  var SELECTOR = [
    '.sl-markdown-content p',
    '.sl-markdown-content li',
    '.sl-markdown-content h2',
    '.sl-markdown-content h3',
    '.rb-landing p',
    '.rb-landing h1',
    '.rb-landing h2',
    '.rb-door__title',
    '.rb-door__text',
    '.rb-eyebrow',
    '.rb-pill',
    '.rb-twospeed__pane p',
    '.rb-pcard__outcome',
    '.rb-pcard__learn',
    '.rb-pcard__note'
  ].join(',');

  var unmatched = 0;
  var matchedCount = 0;

  function markBlocks() {
    var pool = PAGE.blocks.map(function (b) {
      return { marker: b.marker, key: normalise(b.text), used: false };
    });
    var nodes = document.querySelectorAll(SELECTOR);
    Array.prototype.forEach.call(nodes, function (el) {
      if (el.querySelector('pre, table')) return;             // never a code block or a data table
      if (el.closest('[data-rb-locked], .rb-foragents, pre, table')) return;
      var key = normalise(el.textContent);
      if (!key) return;
      for (var i = 0; i < pool.length; i += 1) {
        if (!pool[i].used && pool[i].key === key) {
          pool[i].used = true;
          el.setAttribute('data-rb-marker', pool[i].marker);
          el.setAttribute('data-rb-original', key);
          matchedCount += 1;
          return;
        }
      }
    });
    unmatched = pool.filter(function (p) { return !p.used; }).length;
  }

  /* ---------------------------------------------------------------- the bar */

  var edits = load();
  var orphans = loadOrphans();
  var editing = false;
  var bar, countEl, saveBtn, toggleBtn;

  function pageEdits() {
    var out = {};
    Object.keys(edits).forEach(function (m) {
      if (m.indexOf(PAGE.n + '.') === 0) out[m] = edits[m];
    });
    return out;
  }
  function totalEdits() { return Object.keys(edits).length; }

  function refresh() {
    var mine = Object.keys(pageEdits()).length;
    var all = totalEdits();
    countEl.textContent = all === 0
      ? 'no edits yet'
      : all + (all === 1 ? ' edit' : ' edits') + (mine === all ? '' : ' (' + mine + ' here)');
    saveBtn.disabled = all === 0;
    document.querySelectorAll('[data-rb-marker]').forEach(function (el) {
      var m = el.getAttribute('data-rb-marker');
      if (edits[m]) el.setAttribute('data-rb-changed', '');
      else el.removeAttribute('data-rb-changed');
    });
  }

  function setEditing(on) {
    editing = on;
    document.documentElement.toggleAttribute('data-rb-editing', on);
    toggleBtn.setAttribute('aria-pressed', String(on));
    toggleBtn.textContent = on ? 'Editing on' : 'Edit text';
    document.querySelectorAll('[data-rb-marker]').forEach(function (el) {
      if (on) {
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('spellcheck', 'true');
      } else {
        el.removeAttribute('contenteditable');
      }
    });
  }

  function onBlur(e) {
    var el = e.target.closest ? e.target.closest('[data-rb-marker]') : null;
    if (!el) return;
    var marker = el.getAttribute('data-rb-marker');
    var now = normalise(el.textContent);
    var was = el.getAttribute('data-rb-original');
    if (now === was) delete edits[marker];
    else if (now) edits[marker] = { o: was, t: now };
    save(edits);
    refresh();
  }

  function onKey(e) {
    var el = e.target.closest ? e.target.closest('[data-rb-marker]') : null;
    if (!el) return;
    if (e.key === 'Escape') {
      el.textContent = el.getAttribute('data-rb-original');
      el.blur();
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
  }

  /* ---------------------------------------------------------------- saving */

  function buildFile() {
    var lines = [];
    lines.push('WEBSITE TEXT EDITS, saved from the offline site');
    lines.push('Saved ' + new Date().toISOString().slice(0, 16).replace('T', ' '));
    lines.push('Put this file in "Website Text Edits" and tell Claude the edits are ready.');
    lines.push('');
    var markers = Object.keys(edits).sort(function (a, b) {
      var pa = a.split('.').map(Number), pb = b.split('.').map(Number);
      return pa[0] - pb[0] || pa[1] - pb[1];
    });
    markers.forEach(function (m) {
      lines.push('');
      lines.push('[' + m + ']  TEXT');
      /* The paragraph this edit was made on. The writer-back checks it against the page as it is
         now, and refuses the edit if [m] has become a different paragraph. */
      if (edits[m].o) lines.push('# was: ' + edits[m].o);
      lines.push(edits[m].t);
    });
    lines.push('');
    if (orphans.length) {
      /* Below the bar nothing has a marker, so the writer-back reads none of it. It is here so that
         words she wrote are never lost because a page was rebuilt under them. */
      lines.push('====================================================================');
      lines.push('SET ASIDE, NOT APPLIED: the paragraph each of these was written for has since changed.');
      lines.push('Nothing below is written to the site. Tell Claude where each belongs.');
      orphans.forEach(function (o) {
        lines.push('');
        lines.push('  was paragraph ' + o.marker + (o.was ? ', which read: ' + o.was : ''));
        lines.push('  your words: ' + o.text);
      });
      lines.push('');
    }
    return lines.join('\n');
  }

  function openPanel() {
    var existing = document.querySelector('.rb-ed-panel');
    if (existing) existing.remove();
    var text = buildFile();
    var panel = document.createElement('div');
    panel.className = 'rb-ed-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Save my edits');
    var n = Object.keys(edits).length;
    panel.innerHTML =
      '<h2>' + n + (n === 1 ? ' edit' : ' edits') + ' ready</h2>' +
      (orphans.length ? '<p><strong>' + orphans.length + ' set aside.</strong> The paragraph ' + (orphans.length === 1 ? 'it was' : 'they were') +
        ' written for has changed since. ' + (orphans.length === 1 ? 'It is' : 'They are') + ' at the end of the file, and nothing there is applied.</p>' : '') +
      '<p>Save the file into the <strong>Website Text Edits</strong> folder, then tell Claude. ' +
      'If the download does not work from a folder on disk, copy the text instead and paste it into a new file there.</p>' +
      '<textarea readonly></textarea>' +
      '<div class="rb-ed-panel__row">' +
        '<button data-act="download">Download the file</button>' +
        '<button class="secondary" data-act="copy">Copy the text</button>' +
        '<button class="secondary" data-act="clear" title="After the file is saved: forget these edits in this browser">Clear after saving</button>' +
        '<button class="secondary" data-act="close">Close</button>' +
      '</div>';
    panel.querySelector('textarea').value = text;
    document.body.appendChild(panel);

    panel.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;
      if (act === 'close') panel.remove();
      if (act === 'clear') {
        /* Once the file is saved the browser's copy is a second, older source of the same edits. */
        if (!window.confirm('Forget every edit kept in this browser? Do this only after the file is saved.')) return;
        edits = {}; orphans = []; save(edits); saveOrphans(orphans);
        window.location.reload();
      }
      if (act === 'copy') {
        var ta = panel.querySelector('textarea');
        ta.select();
        try { document.execCommand('copy'); e.target.textContent = 'Copied'; } catch (err) { /* selected either way */ }
      }
      if (act === 'download') {
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'offline-edits.txt';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      }
    });
  }

  /* ---------------------------------------------------------------- build the bar */

  function build() {
    bar = document.createElement('div');
    bar.className = 'rb-ed-bar';

    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-pressed', 'false');
    toggleBtn.textContent = 'Edit text';
    toggleBtn.addEventListener('click', function () { setEditing(!editing); });

    countEl = document.createElement('span');
    countEl.className = 'rb-ed-bar__count';

    saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save my edits';
    saveBtn.addEventListener('click', openPanel);

    var undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.textContent = 'Undo page';
    undoBtn.title = 'Put this page back the way it was';
    undoBtn.addEventListener('click', function () {
      document.querySelectorAll('[data-rb-marker]').forEach(function (el) {
        var m = el.getAttribute('data-rb-marker');
        if (edits[m]) { el.textContent = el.getAttribute('data-rb-original'); delete edits[m]; }
      });
      save(edits);
      refresh();
    });

    bar.appendChild(toggleBtn);
    bar.appendChild(countEl);
    bar.appendChild(saveBtn);
    bar.appendChild(undoBtn);
    document.body.appendChild(bar);

    if (!storageWorks) {
      var warn = document.createElement('span');
      warn.className = 'rb-ed-bar__count';
      warn.textContent = 'this browser will not remember edits: save before you close';
      bar.appendChild(warn);
    }
  }

  function restore() {
    var here = {};
    document.querySelectorAll('[data-rb-marker]').forEach(function (el) { here[el.getAttribute('data-rb-marker')] = el; });
    var moved = false;
    Object.keys(pageEdits()).forEach(function (m) {
      var e = edits[m];
      var el = here[m];
      var original = el ? el.getAttribute('data-rb-original') : null;
      var sameParagraph = el && (e.o ? e.o === original : alike(e.t, original) >= 0.5);
      if (sameParagraph) {
        if (!e.o) { e.o = original; moved = true; }
        return;
      }
      /* [m] is now a different paragraph. If the one she edited is still on the page, follow it. */
      var home = null;
      if (e.o) Object.keys(here).forEach(function (k) { if (!home && !edits[k] && here[k].getAttribute('data-rb-original') === e.o) home = k; });
      delete edits[m];
      if (home) edits[home] = e;
      else orphans.push({ was: e.o, text: e.t, marker: m, setAside: new Date().toISOString().slice(0, 10) });
      moved = true;
    });
    if (moved) { save(edits); saveOrphans(orphans); }
    Object.keys(here).forEach(function (m) { if (edits[m]) here[m].textContent = edits[m].t; });
  }

  function init() {
    markBlocks();
    if (!matchedCount) return;
    build();
    restore();
    refresh();
    document.addEventListener('blur', onBlur, true);
    document.addEventListener('keydown', onKey, true);
    document.documentElement.setAttribute('data-rb-offline', '');
    if (unmatched) {
      // Blocks whose text the page fills in at load (a live date, a live number) cannot be matched
      // here; they are still editable in the plain text files.
      console.info('[offline editor] ' + matchedCount + ' blocks editable, ' + unmatched +
        ' only editable in "Website Text Edits" (they carry a live value).');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
