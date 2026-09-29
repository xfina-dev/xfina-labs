/*
  Xfina bookmarklet core: the panel every site's bookmarklet shares. A site file is its adapter: it says which
  site and page it runs on, which datasets it covers, how many financial years one file may span, and how to fetch
  one window of one dataset on that page. Everything else lives here, so every site's panel looks and behaves
  the same:

  - Memory. Per dataset, the newest date that actually came back (not the end date asked for), in the site's own
    browser storage under the adapter's key. Updated after every saved file, so a cancelled or failed run
    resumes from the last saved file.
  - Modes. Update (default) fetches only what is new since that date; a dataset never fetched gets its full
    history. Full history redoes everything from each dataset's start. Custom takes a start and an end date.
  - Windows. A range that fits in `years` years is one file; a longer one is split into financial years (April to
    March), `years` at a time, the ends partial. years 0 means one file for any range.
  - Pacing. Two short pauses per file, 6 to 9 seconds in all, as a person would take. A spinner shows while
    waiting; nothing else moves.
  - Folder. Where the browser allows it (Chrome, Edge), Start asks for a folder once per panel and every file is
    written there, including after Cancel or a failure (Resume keeps the folder). Otherwise the page's own
    download happens as usual, and after the first three the panel waits for the browser's "allow multiple
    downloads" prompt.

  States: ready (Start) → folder (asking) → run (Cancel) → stopping → cancelled or failed (Resume) or done.
  Rows: planned, working (spinner, k/n), done ✓, up to date, failed !.

  Adapter: { title, key, host, wrongSite, wrongPage, ready(), years, items: [{ id, code, name, from }],
  prepare(item, c) optional, fetch(item, [from, to], c) → newest Date on the page, or null for an empty window }.
  The adapter saves a file by calling c.grab(clickTheDownload, fallbackName). It stops being usable if it throws;
  its Error message is shown as is, so it should read as a sentence ("... not in the page's symbol list").
  Written to be minified: statements end in semicolons, no line comments inside, no comment markers in strings.
*/
var xfinaPanel = function (A) {
  var HOST = A.host;
  var host = location.hostname;
  if (host.replace(/^www\./, '') !== HOST) { alert('Xfina: ' + A.wrongSite); return; }
  if (host === HOST) {
    alert('Xfina: your browser keeps its memory separately for each address of this site, so this moves to the www address. Click the bookmark again once it has loaded.');
    location.replace(location.href.replace('//' + HOST, '//www.' + HOST));
    return;
  }
  if (!A.ready()) { alert('Xfina: ' + A.wrongPage); return; }
  var old = document.getElementById('xfina-bm');
  if (old) { if (old.xfinaClose) old.xfinaClose(); else old.remove(); }

  var FAST = 3;
  var WAIT = 15;
  var MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  var q = function (id) { return document.getElementById(id); };
  var day = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  var parse = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var short = function (d) { return MON[d.getMonth()] + ' ' + d.getFullYear(); };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
  var pause = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var today = day(new Date(), 0);

  var mem = {};
  var stored = true;
  try { mem = JSON.parse(localStorage.getItem(A.key) || '{}'); localStorage.setItem(A.key + '.t', 1); localStorage.removeItem(A.key + '.t'); } catch (e) { stored = false; }
  var keep = function () { try { localStorage.setItem(A.key, JSON.stringify(mem)); } catch (e) { } };

  var fy = function (f, t, n) {
    var o = [];
    while (f <= t) {
      var e = new Date((f.getMonth() >= 3 ? f.getFullYear() + 1 : f.getFullYear()) + n - 1, 2, 31);
      if (e > t) e = t;
      o.push([f, e]);
      f = day(e, 1);
    }
    return o;
  };
  var wins = function (f, t) {
    if (f > t) return [];
    if (!A.years || day(new Date(f.getFullYear() + A.years, f.getMonth(), f.getDate()), -1) >= t) return [[f, t]];
    return fy(f, t, A.years);
  };

  var mode = 'U';
  var cf = '';
  var ct = '';
  var st = 'ready';
  var run = null;
  var dir = null;
  var stop = 0;
  var saved = 0;
  var skip = 0;
  var plan = function () {
    return A.items.map(function (x) {
      var s = parse(x.from);
      var l = mem[x.id] ? parse(mem[x.id]) : null;
      var f = s;
      var t = today;
      if (mode === 'C') {
        if (cf) f = parse(cf);
        if (ct) t = parse(ct);
        if (f < s) f = s;
        if (t > today) t = today;
      } else if (mode === 'U' && l) f = day(l, 1);
      return { x: x, f: f, t: t, w: wins(f, t), k: 0, st: '' };
    });
  };
  var left = function () { return run.reduce(function (n, r) { return n + r.w.length - r.k; }, 0); };

  var box = document.createElement('div');
  box.id = 'xfina-bm';
  box.innerHTML =
    '<style>#xfina-bm{position:fixed;top:16px;right:16px;z-index:2147483647;width:380px;max-height:90vh;overflow:auto;background:#0a0a0b;color:#fafafa;font:13px/1.45 system-ui,sans-serif;text-align:left;border:1px solid #3f3f46;border-radius:10px;padding:12px 14px;box-shadow:0 8px 30px #0008}' +
    '#xfina-bm *{box-sizing:border-box}#xfina-bm .hd{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;cursor:move;user-select:none}' +
    '#xfina-bm .hd .x{margin-left:auto;cursor:pointer;color:#a1a1aa;font-weight:400;padding:0 2px}' +
    '#xfina-bm .sp{width:13px;height:13px;border:2px solid #3f3f46;border-top-color:#fafafa;border-radius:50%;animation:xfspin .8s linear infinite;display:inline-block}' +
    '@keyframes xfspin{to{transform:rotate(360deg)}}#xfina-bm .md{display:flex;gap:4px;margin:10px 0 4px}' +
    '#xfina-bm button{height:28px;padding:0 10px;border:1px solid #3f3f46;border-radius:6px;background:transparent;color:#fafafa;cursor:pointer;font:inherit}' +
    '#xfina-bm button.on{border-color:#fafafa;background:#fafafa1a}#xfina-bm button.pri{background:#fafafa;color:#0a0a0b;border-color:#fafafa;font-weight:600}' +
    '#xfina-bm button:disabled{opacity:.45;cursor:default}#xfina-bm .dt{display:none;gap:6px;align-items:center;margin:6px 0 2px;color:#a1a1aa;font-size:12px}' +
    '#xfina-bm input[type=date]{height:26px;border:1px solid #3f3f46;border-radius:6px;background:#0a0a0b;color:#fafafa;color-scheme:dark;font:inherit}' +
    '#xfina-bm .rs{display:grid;grid-template-columns:14px auto 1fr auto;column-gap:10px;row-gap:6px;align-items:center;border-top:1px solid #27272a;border-bottom:1px solid #27272a;margin:8px 0;padding:8px 0;white-space:nowrap}' +
    '#xfina-bm .r{display:contents}#xfina-bm .r b{font-weight:600}#xfina-bm .r .n{text-align:right}' +
    '#xfina-bm .hd .st{font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px}' +
    '#xfina-bm .g{color:#a1a1aa;font-size:12px}#xfina-bm .ok{color:#4ade80}#xfina-bm .bad{color:#f59e0b}' +
    '#xfina-bm .ft{display:flex;align-items:flex-end;gap:8px}#xfina-bm .ft .s{flex:1;font-size:12px;color:#a1a1aa}#xfina-bm .ft .s b{color:#fafafa}#xfina-bm u{cursor:pointer}</style>' +
    '<div class="hd"><span>Xfina · ' + esc(A.title) + '</span><span id="xw" class="st"></span><span class="x" id="xx" title="Close">✕</span></div>' +
    '<div class="md">' + [['U', 'Update'], ['F', 'Full history'], ['C', 'Custom']].map(function (m) { return '<button id="xm' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div>' +
    '<div class="dt" id="xc">From <input type="date" id="xf"> to <input type="date" id="xt"></div>' +
    '<div class="rs" id="xr"></div>' +
    '<div class="ft"><div class="s" id="xs"></div><div id="xb" style="display:flex;gap:6px"></div></div>';
  document.body.appendChild(box);
  var hd = box.firstElementChild.nextElementSibling;
  hd.onmousedown = function (ev) {
    if (ev.target.id === 'xx') return;
    var dx = ev.clientX - box.offsetLeft;
    var dy = ev.clientY - box.offsetTop;
    document.onmousemove = function (m) { box.style.left = m.clientX - dx + 'px'; box.style.top = m.clientY - dy + 'px'; box.style.right = 'auto'; };
    document.onmouseup = function () { document.onmousemove = document.onmouseup = null; };
  };
  var say = function (h) { if (box.isConnected) q('xs').innerHTML = h || ''; };

  var nativeClick = HTMLAnchorElement.prototype.click;
  var makeUrl = URL.createObjectURL;
  var armed = 0;
  var cap = null;
  var blob = null;
  var arm = function () {
    HTMLAnchorElement.prototype.click = function () {
      if (armed && this.hasAttribute('download')) { cap = { href: this.href, name: this.getAttribute('download') }; return; }
      return nativeClick.apply(this, arguments);
    };
    URL.createObjectURL = function (b) { if (armed) blob = b; return makeUrl.call(URL, b); };
  };
  var undo = function () { HTMLAnchorElement.prototype.click = nativeClick; URL.createObjectURL = makeUrl; armed = 0; };
  var close = function () { stop = 1; undo(); box.remove(); };
  box.xfinaClose = close;

  var STOP = {};
  var c = {
    today: today,
    pause: async function (ms) { await pause(ms); if (stop) throw STOP; },
    wait: async function (test, ms) {
      var t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (stop) throw STOP;
        var v = test();
        if (v) return v;
        await pause(250);
      }
      return null;
    },
    nap: function () { return c.pause(3000 + Math.floor(Math.random() * 1500)); },
    look: async function (el, what) {
      if (typeof el === 'string') el = document.querySelector(el);
      if (!el) throw new Error('couldn\'t find ' + (what || 'a part of the page') + ' on the page, which may have changed');
      el.scrollIntoView({ block: 'center' });
      var o = el.style.outline;
      el.style.outline = '3px solid #4ade80';
      await c.pause(600);
      el.style.outline = o;
      return el;
    },
    tap: function (el) { ['mousedown', 'mouseup', 'click'].forEach(function (t) { el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })); }); },
    grab: async function (click, name) {
      cap = null;
      blob = null;
      armed = !!dir;
      click();
      if (!dir) { await c.pause(800); return; }
      var got = await c.wait(function () { return cap && (!/^blob:/.test(cap.href) || blob) ? cap : null; }, 20000);
      armed = 0;
      if (!got) throw new Error('the page didn\'t offer the file');
      var data = blob;
      var fname = cap.name || name;
      if (!/^blob:/.test(cap.href)) {
        var rsp = await fetch(cap.href, { credentials: 'include' });
        if (!rsp.ok) throw new Error('the file download failed (' + rsp.status + ')');
        var cd = (rsp.headers.get('content-disposition') || '').match(/filename="?([^";]+)/);
        if (cd) fname = cd[1];
        data = await rsp.blob();
      }
      var fh = await dir.getFileHandle(String(fname || name).replace(/[\\/:*?"<>|]/g, '-'), { create: true });
      var ws = await fh.createWritable();
      await ws.write(data);
      await ws.close();
    }
  };

  var render = function () {
    if (!box.isConnected) return;
    if (st === 'ready') run = plan();
    var busy = st === 'folder' || st === 'run' || st === 'stopping';
    var n = left();
    q('xr').innerHTML = run.map(function (r) {
      var all = r.w.length;
      var files = all + (all === 1 ? ' file' : ' files');
      var icon = r.st === 'work' ? '<span class="sp"></span>' : r.st === 'done' ? '<span class="ok">✓</span>' : r.st === 'fail' ? '<span class="bad">!</span>' : !all ? '<span class="g">✓</span>' : '';
      var range = all ? short(r.f) + ' → ' + short(r.t) : mode === 'U' ? 'up to date' : 'nothing in range';
      var right = !all ? '' : r.st === 'done' ? files : (r.st === 'work' || r.st === 'fail' || r.k) ? r.k + '/' + all : files;
      var tip = ' title="' + esc(r.x.name) + '"';
      return '<div class="r"><span>' + icon + '</span><b' + tip + '>' + esc(r.x.code) + '</b><span class="g"' + tip + '>' + range + '</span><span class="g n">' + right + '</span></div>';
    }).join('');
    ['U', 'F', 'C'].forEach(function (m) { var b = q('xm' + m); b.className = mode === m ? 'on' : ''; b.disabled = busy; });
    q('xc').style.display = mode === 'C' ? 'flex' : 'none';
    q('xf').disabled = q('xt').disabled = busy;
    q('xw').innerHTML = busy ? '<span class="sp"></span>' : { done: '<span class="ok">✓ Done</span>', failed: '<span class="bad">! Failed</span>', cancelled: '<span class="g">Cancelled</span>' }[st] || '';
    var bs = {
      ready: [['close', 'Close'], ['start', n ? 'Start' : mode === 'U' ? 'Up to date' : 'Nothing in range', !n]],
      folder: [['cancel', 'Cancel']],
      run: [['cancel', 'Cancel']],
      stopping: [['', 'Stopping…', 1]],
      cancelled: [['close', 'Close'], ['resume', 'Resume', !n]],
      failed: [['close', 'Close'], ['resume', 'Resume', !n]],
      done: [['close', 'Close']]
    }[st];
    q('xb').innerHTML = bs.map(function (b, i) { return '<button data-a="' + b[0] + '"' + (i === bs.length - 1 && b[0] !== 'cancel' ? ' class="pri"' : '') + (b[2] ? ' disabled' : '') + '>' + b[1] + '</button>'; }).join('');
    [].forEach.call(q('xb').children, function (b) { b.onclick = act[b.getAttribute('data-a')]; });
    if (st === 'ready' && !busy) say(stored ? '' : 'Your browser blocks storage for this site, so Update fetches the full history each time.');
  };

  var go = async function () {
    stop = 0;
    if (!dir && window.showDirectoryPicker) {
      st = 'folder';
      render();
      say('Choose a folder for the files. You\'re asked once; make a new one, as Downloads and Desktop aren\'t allowed.');
      try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e0) {
        dir = null;
        st = run.some(function (r) { return r.k; }) ? 'cancelled' : 'ready';
        render();
        say('No folder chosen, so nothing started. Press ' + (st === 'ready' ? 'Start' : 'Resume') + ' to pick one.');
        return;
      }
    }
    st = 'run';
    if (dir) arm();
    render();
    say('Keep this tab in front until it says Done.');
    var r = null;
    try {
      var todo = run.filter(function (x) { return x.k < x.w.length; });
      for (var i = 0; i < todo.length; i++) {
        r = todo[i];
        r.st = 'work';
        render();
        if (A.prepare) await A.prepare(r.x, c);
        while (r.k < r.w.length) {
          var e = await A.fetch(r.x, r.w[r.k], c);
          if (e) {
            saved++;
            var ei = iso(e);
            if (!mem[r.x.id] || ei > mem[r.x.id]) { mem[r.x.id] = ei; keep(); }
          }
          r.k++;
          render();
          say('Keep this tab in front until it says Done.');
          if (!dir && saved === FAST && left()) {
            skip = 0;
            for (var s = WAIT; s > 0 && !skip; s--) {
              say('Your browser may ask to <b>allow multiple downloads</b>: choose Allow. Carrying on in ' + s + 's. <u id="xu">Continue now</u>');
              q('xu').onclick = function () { skip = 1; };
              await c.pause(1000);
            }
          }
        }
        r.st = 'done';
        r = null;
      }
      st = 'done';
      render();
      say(saved + (saved === 1 ? ' file' : ' files') + ' saved ' + (dir ? 'in the folder <b>' + esc(dir.name) + '</b>' : 'to your browser\'s downloads') + '. Import them in Portfolio Engine.');
    } catch (err) {
      undo();
      if (err === STOP) {
        if (r) r.st = '';
        st = 'cancelled';
        render();
        say(saved + (saved === 1 ? ' file' : ' files') + ' saved. Resume carries on from there' + (dir ? ', in the same folder.' : '.'));
      } else {
        if (r) r.st = 'fail';
        st = 'failed';
        render();
        say((r ? '<b>' + esc(r.x.code) + '</b>: ' : '') + esc(err && err.message ? err.message : err) + '. ' + saved + (saved === 1 ? ' file' : ' files') + ' saved. Resume carries on from there' + (dir ? ', in the same folder.' : '.'));
      }
    }
    undo();
  };

  var act = {
    close: close,
    start: function () { saved = 0; go(); },
    resume: function () { run.forEach(function (x) { if (x.st === 'fail') x.st = ''; }); go(); },
    cancel: function () { stop = 1; if (st === 'run') { st = 'stopping'; render(); } }
  };
  q('xx').onclick = close;
  ['U', 'F', 'C'].forEach(function (m) { q('xm' + m).onclick = function () { mode = m; st = 'ready'; render(); }; });
  q('xf').oninput = function () { cf = this.value; st = 'ready'; render(); };
  q('xt').oninput = function () { ct = this.value; st = 'ready'; render(); };
  render();
};
