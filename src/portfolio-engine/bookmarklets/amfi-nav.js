/*
  Xfina bookmarklet: AMFI NAV history (mutual fund and fund-of-fund schemes), made once and used again and again.

  Runs on amfiindia.com only, on the NAV History page. It opens a small panel, one row per scheme, and on Start does
  what a person does on that page: picks "Historical NAV for a period", the fund house, the scheme, the From and To
  dates, presses Go and, once the table has shown, presses the page's own Excel download. The files are AMFI's own
  (NAV_2026-01-01_to_2026-03-31.xlsx). AMFI names a file by its dates only, so when saving to a folder (Chrome, Edge) the
  scheme name is put in front, so files for different schemes do not overwrite each other; other browsers download
  under AMFI's name. Nothing is sent to Xfina.

  The page takes at most 5 years per download, so a first run of a long history is several files, split at five-year
  steps from the scheme's first date; after that Update is one small file per scheme. AMFI's scheme names differ a
  little from the catalogue's, so each scheme is found by its base name, plan (direct or regular) and option (growth
  or IDCW); one that cannot be found is skipped and says so.

  Modes and pacing are as in nse-indices.js: Update fetches what is new since the newest date remembered per scheme,
  Full history redoes everything, Custom takes a start and an end date; every file waits 6 to 9 seconds in two halves
  (before Go, and while the table shows).

  Parameter, filled in when the bookmark is generated (bookmarklet.js): __SCHEMES__, JSON,
  [["ICICI Prudential Nifty 50 Index Fund - Direct Plan - Growth", "<label>", "2013-01-01"], ...]:
  the scheme's catalogue name, a label, the first date to ask for.
  Written to be minified: statements end in semicolons, no line comments inside.
  If the page changes, this is the one file to fix.
*/
(function () {
  var HOST = 'amfiindia.com';
  var X = JSON.parse('__SCHEMES__');
  var KEY = 'xfina.amfiNav.v1';
  var DAY = 864e5;
  var FAST = 3;
  var WAIT = 15;
  var GAP = '3-5';
  var MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  var host = location.hostname;
  if (host.replace(/^www\./, '') !== HOST) { alert('Xfina: open amfiindia.com (Net Asset Value, NAV History) and click this bookmark again.'); return; }
  if (host === HOST) {
    alert('Xfina: your browser keeps its memory separately for each address of this site, so this moves to the www address. Click the bookmark again once it has loaded.');
    location.replace(location.href.replace('//' + HOST, '//www.' + HOST));
    return;
  }
  if (!document.querySelector('input[type=radio][value=historical-nav-for-a-period]')) { alert('Xfina: open the NAV History page on amfiindia.com (amfiindia.com/net-asset-value/nav-history) and click this bookmark again.'); return; }
  var old = document.getElementById('xfina-bm');
  if (old) old.remove();

  var q = function (id) { return document.getElementById(id); };
  var day = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  var parse = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var nice = function (d) { return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); };
  var look = async function (el) {
    el = typeof el === 'string' ? document.querySelector(el) : el;
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    var o = el.style.outline;
    el.style.outline = '3px solid #4ade80';
    await pause(600);
    el.style.outline = o;
  };
  var dmy = function (d) { return ('0' + d.getDate()).slice(-2) + '-' + MON[d.getMonth()] + '-' + d.getFullYear(); };
  var put = function (el, d) {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, iso(d));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  var tap = function (el) { ['mousedown', 'mouseup', 'click'].forEach(function (t) { el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })); }); };
  var pause = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var today = day(new Date(), 0);

  var mem = {};
  var stored = true;
  try { mem = JSON.parse(localStorage.getItem(KEY) || '{}'); localStorage.setItem(KEY + '.t', 1); localStorage.removeItem(KEY + '.t'); } catch (e) { stored = false; }
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { } };

  var mode = 'U';
  var cf = '';
  var ct = '';
  var busy = 0;
  var stop = 0;

  var wins = function (f, t) {
    var o = [];
    while (f <= t) {
      var e = day(new Date(f.getFullYear() + 5, f.getMonth(), f.getDate()), -1);
      if (e > t) e = t;
      o.push([f, e]);
      f = day(e, 1);
    }
    return o;
  };
  var plan = function () {
    return X.map(function (x, i) {
      var s = parse(x[2]);
      var l = mem[x[0]] ? parse(mem[x[0]]) : null;
      var f = s;
      var t = today;
      if (mode === 'C') {
        if (cf) f = parse(cf);
        if (ct) t = parse(ct);
        if (f < s) f = s;
        if (t > today) t = today;
      } else if (mode === 'U' && l) f = day(l, 1);
      return { i: i, n: x[0], l: x[1], f: f, t: t, w: wins(f, t), first: mode === 'U' && !l };
    });
  };

  var ring = function (id, tip) {
    return '<svg id="' + id + '" width="28" height="28" viewBox="0 0 28 28" style="display:none"><title>' + tip + '</title><circle cx="14" cy="14" r="11" fill="none" stroke="#27272a" stroke-width="3"/><circle cx="14" cy="14" r="11" fill="none" stroke="#4ade80" stroke-width="3" stroke-dasharray="69.1" stroke-dashoffset="69.1" transform="rotate(-90 14 14)"/><text x="14" y="17" text-anchor="middle" font-size="9" fill="#fafafa"></text></svg>';
  };
  var turn = function (id, f, t) {
    var e = q(id);
    e.style.display = 'block';
    e.children[2].setAttribute('stroke-dashoffset', 69.1 * (1 - f));
    e.lastChild.textContent = t;
  };
  var box = document.createElement('div');
  box.id = 'xfina-bm';
  box.innerHTML =
    '<style>#xfina-bm{position:fixed;top:16px;right:16px;z-index:2147483647;width:400px;max-height:92vh;overflow:auto;background:#0a0a0b;color:#fafafa;font:13px/1.5 system-ui,sans-serif;border:1px solid #3f3f46;border-radius:8px;padding:14px;box-shadow:0 8px 30px #0008}' +
    '#xfina-bm .g{color:#a1a1aa;font-size:12px}#xfina-bm label{display:flex;gap:8px;align-items:baseline;margin:2px 0;}#xfina-bm label .g{margin-left:auto;text-align:right}' +
    '#xfina-bm button{height:28px;padding:0 10px;border:1px solid #3f3f46;border-radius:6px;background:0;color:#fafafa;cursor:pointer}#xfina-bm .on,#xfina-bm #xg{background:#fafafa;color:#0a0a0b;border:0;font-weight:600}' +
    '#xfina-bm input[type=date]{height:26px;border:1px solid #3f3f46;border-radius:6px;background:#0a0a0b;color:#fafafa;color-scheme:dark}#xfina-bm #xs:empty{display:none}#xfina-bm .w{border:1px solid #f59e0b;border-radius:6px;padding:6px 8px;margin-top:6px;font-size:12px}</style>' +
    '<div style="display:flex;justify-content:space-between;font-weight:600;font-size:15px">Xfina - AMFI NAV - Download<span style="display:flex;gap:8px;align-items:center">' + ring('xz', 'Next file in (seconds)') + '<span id="xx" style="cursor:pointer" class="g" title="Stop and close">✕</span></span></div>' +
    '<div class="g" style="margin:2px 0 8px">Keep this tab in front. Nothing goes to Xfina.</div>' +
    X.map(function (x, i) { return '<label><span>' + x[1] + '</span><span class="g" id="xr' + i + '"></span></label>'; }).join('') +
    '<div id="xc" class="g" style="display:none;margin:6px 0">From <input type="date" id="xf"> to <input type="date" id="xt"></div>' +
    '<div id="xs" style="margin-top:8px;font-size:12px"></div>' +
    '<div style="height:6px;background:#27272a;border-radius:6px;margin:6px 0"><div id="xb" style="height:100%;width:0;background:#4ade80"></div></div>' +
    '<div class="w" id="xn" style="display:none">Your browser may ask to allow multiple downloads: choose <b>Allow</b>. Carrying on in <b id="xk"></b>s. <u id="xu" style="cursor:pointer">Continue now</u></div>' +
    '<div class="w" id="xw" style="display:none">Your browser blocks storage for this site, so Update will fetch the full history each time.</div>' +
    '<div style="display:flex;gap:6px;margin-top:8px">' + [['U', 'Update'], ['F', 'Full history'], ['C', 'Custom']].map(function (m) { return '<button id="xm' + m[0] + '">' + m[1] + '</button>'; }).join('') + '<button id="xg" style="margin-left:auto;padding:0 18px">Start</button></div>';
  document.body.appendChild(box);
  box.firstElementChild.style.cursor = 'move';
  box.firstElementChild.onmousedown = function (ev) {
    if (ev.target.id === 'xx') return;
    var dx = ev.clientX - box.offsetLeft;
    var dy = ev.clientY - box.offsetTop;
    document.onmousemove = function (m) { box.style.left = m.clientX - dx + 'px'; box.style.top = m.clientY - dy + 'px'; box.style.right = 'auto'; };
    document.onmouseup = function () { document.onmousemove = document.onmouseup = null; };
  };
  turn('xz', 1, GAP);

  var render = function () {
    var p = plan();
    var n = 0;
    p.forEach(function (r, i) {
      var c = r ? r.w.length : 0;
      n += c;
      q('xr' + i).textContent = !r ? '' : c ? nice(r.f) + ' → ' + nice(r.t) + ' · ' + c + (c > 1 ? ' files' : ' file') + (r.first ? ' · first run' : '') : mode === 'U' ? 'up to date' : 'nothing in range';
    });
    ['U', 'F', 'C'].forEach(function (m) { q('xm' + m).className = mode === m ? 'on' : ''; });
    q('xc').style.display = mode === 'C' ? 'block' : 'none';
    q('xw').style.display = stored ? 'none' : 'block';
    q('xg').style.opacity = n ? 1 : 0.5;
    return { p: p, n: n };
  };
  ['U', 'F', 'C'].forEach(function (m) { q('xm' + m).onclick = function () { if (!busy) { mode = m; fin = 0; q('xg').textContent = 'Start'; render(); } }; });
  q('xf').oninput = function () { if (!busy) { cf = this.value; render(); } };
  q('xt').oninput = function () { if (!busy) { ct = this.value; render(); } };
  var skip = 0;
  q('xu').onclick = function () { skip = 1; };
  q('xx').onclick = function () { stop = 1; undo(); box.remove(); };

  var tbl = function () {
    return Array.prototype.filter.call(document.querySelectorAll('table'), function (t) { return t.offsetParent; })[0];
  };
  var newest = function () {
    var t = tbl();
    var top = null;
    if (!t) return null;
    Array.prototype.forEach.call(t.rows, function (r) {
      var c = r.cells[r.cells.length - 1];
      var m = c && c.textContent.trim().match(/^(\d\d)-([A-Za-z]{3})-(\d{4})$/);
      var d = m && new Date(+m[3], MON.indexOf(m[2]), +m[1]);
      if (d && (!top || d > top)) top = d;
    });
    return top;
  };
  var words = function (n) { return n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
  var baseOf = function (n) { return words(n).split(/ (?:regular|direct|growth|cumulative|idcw|dividend|option|plan)\b/)[0]; };
  var flags = function (n) { var w = words(n); return [/\bdirect\b/.test(w) ? 'd' : 'r', /\b(idcw|dividend)\b/.test(w) ? 'i' : /\b(growth|cumulative)\b/.test(w) ? 'g' : '']; };
  var opts = function () { return Array.prototype.slice.call(document.querySelectorAll('[role=option]')); };
  var open = async function (id) {
    tap(q(id).parentElement.querySelector('button[aria-label=Open]'));
    await pause(400);
    await wait(function () { return opts().length > 1; }, 15000);
  };
  var best = function (name) {
    var b = baseOf(name);
    var f = flags(name);
    var hit = opts().filter(function (o) {
      var g = flags(o.textContent);
      return baseOf(o.textContent) === b && g[0] === f[0] && (!f[1] || g[1] === f[1]);
    });
    hit.sort(function (x, y) { return x.textContent.length - y.textContent.length; });
    return hit[0];
  };
  var amcFor = function (name) {
    var b = baseOf(name);
    var list = opts().filter(function (o) { var a = words(o.textContent).replace(/ mutual fund$/, ''); return a && (b === a || b.indexOf(a + ' ') === 0); });
    list.sort(function (x, y) { return y.textContent.length - x.textContent.length; });
    if (list[0]) return list[0];
    return opts().filter(function (o) { return words(o.textContent).split(' ')[0] === b.split(' ')[0]; })[0];
  };
  var nativeClick = HTMLAnchorElement.prototype.click;
  var cap = null;
  var amc = '';
  var makeUrl = URL.createObjectURL;
  var lastBlob = null;
  var undo = function () { HTMLAnchorElement.prototype.click = nativeClick; URL.createObjectURL = makeUrl; };
  var wait = async function (test, ms) {
    var t0 = Date.now();
    while (Date.now() - t0 < ms && !stop) {
      var v = test();
      if (v) return v;
      await pause(250);
    }
    return null;
  };

  var fin = 0;
  q('xg').onclick = async function () {
    if (fin) { undo(); box.remove(); return; }
    if (busy) { stop = 1; q('xg').textContent = 'Stopping...'; return; }
    var r = render();
    if (!r.n) { q('xs').textContent = 'Nothing to download for this choice.'; return; }
    busy = 1;
    stop = 0;
    fin = 0;
    q('xg').textContent = 'Cancel';
    var saved = 0;
    var done = 0;
    var say = function (t) { q('xs').textContent = t; };
    var nap = async function (m) { for (var n = m; n > 0 && !stop; n -= 0.25) { turn('xz', n / m, Math.ceil(n)); await pause(250); } turn('xz', 1, GAP); };
    say('');
    q('xb').style.width = 0;
    turn('xz', 1, GAP);
    var dir = null;
    if (window.showDirectoryPicker) {
      say('Choose a folder for the files (asked once)...');
      try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); } catch (e0) { dir = null; }
    }
    var gentle = function () { return pause(300); };
    try {
      if (dir) {
        URL.createObjectURL = function (b) { lastBlob = b; return makeUrl.call(URL, b); };
        HTMLAnchorElement.prototype.click = function () {
          if (this.hasAttribute('download') && /^blob:/.test(this.href)) { cap = { blob: lastBlob, download: this.download }; return; }
          return nativeClick.apply(this, arguments);
        };
      }
      var radio = document.querySelector('input[type=radio][value=historical-nav-for-a-period]');
      await look(radio);
      radio.click();
      await pause(1200);
      var todo = r.p.filter(function (p) { return p && p.w.length; });
      for (var i = 0; i < todo.length && !stop; i++) {
        var p = todo[i];
        var c1 = document.querySelector('input[role=combobox]');
        await look(c1);
        await open(c1.id);
        var ao = amcFor(p.n);
        if (!ao) { q('xr' + p.i).textContent = 'fund house not found on AMFI'; done += p.w.length; continue; }
        var an = ao.textContent.trim();
        if (an !== amc) { tap(ao); amc = an; await pause(1500); } else document.body.click();
        var c2 = document.querySelectorAll('input[role=combobox]')[1];
        await look(c2);
        await open(c2.id);
        var so = best(p.n);
        if (!so) { q('xr' + p.i).textContent = 'not found on AMFI'; done += p.w.length; continue; }
        var sn = so.textContent.trim();
        tap(so);
        await pause(900);
        q('xr' + p.i).textContent = '0/' + p.w.length + ' files';
        for (var k = 0; k < p.w.length && !stop; k++) {
          var w = p.w[k];
          var df = document.querySelectorAll('input[type=date]')[0];
          var dt = document.querySelectorAll('input[type=date]')[1];
          await look(df);
          put(df, w[0]);
          await look(dt);
          put(dt, w[1]);
          var half = (6 + Math.floor(Math.random() * 4)) / 2;
          await nap(half);
          var go = Array.prototype.filter.call(document.querySelectorAll('button'), function (b) { return b.textContent.trim() === 'Go'; })[0];
          await look(go);
          go.click();
          var want = 'From ' + dmy(w[0]) + ' to ' + dmy(w[1]);
          var got = await wait(function () { var t = document.body.innerText; return tbl() && t.indexOf(want) >= 0 && t.indexOf(sn) >= 0; }, 25000);
          if (stop) break;
          await pause(700);
          var e = got && newest();
          if (e) {
            await nap(half);
            var ex = document.querySelector('button[aria-label="Download Excel"]');
            await look(ex);
            cap = null;
            ex.click();
            if (dir) {
              if (!(await wait(function () { return cap; }, 20000))) throw new Error('the page did not offer the file');
              var fh = await dir.getFileHandle(sn.replace(/[^A-Za-z0-9 .()_-]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ' + cap.download, { create: true });
              var ws = await fh.createWritable();
              await ws.write(cap.blob);
              await ws.close();
            }
            saved++;
            var ei = iso(e);
            if (!mem[p.n] || ei > mem[p.n]) { mem[p.n] = ei; save(); }
            if (!(i === todo.length - 1 && k === p.w.length - 1)) {
              if (!dir && saved === FAST) {
                q('xn').style.display = 'block';
                skip = 0;
                for (var s = WAIT; s > 0 && !skip && !stop; s--) { q('xk').textContent = s; turn('xz', s / WAIT, s); await pause(1000); }
                q('xn').style.display = 'none'; turn('xz', 1, GAP);
              }
            }
          }
          q('xr' + p.i).textContent = (k + 1) + '/' + p.w.length + ' files';
          done++;
          q('xb').style.width = Math.round((100 * done) / r.n) + '%';
        }
      }
      fin = !stop;
      say(stop ? 'Stopped.' : 'Done: ' + saved + ' files saved' + (dir ? ' to the folder you chose.' : ' by your browser.'));
    } catch (e2) {
      say('Stopped: ' + e2.message);
    }
    undo();
    busy = 0;
    q('xg').textContent = fin ? 'Done' : 'Start';
    render();
    if (fin) q('xg').style.opacity = 1;
  };

  render();
})();
