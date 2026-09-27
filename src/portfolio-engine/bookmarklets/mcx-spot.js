/*
  Xfina bookmarklet: MCX Spot Market Price (Archives), made once and used again and again.

  Runs on mcxindia.com only, on the Spot Market Price page. It opens a small panel, one row per commodity/location
  pair, and on Save does what a person does on that page: opens the Archives tab, picks the commodity and location,
  sets Session to ALL (MCX's own session tagging is inconsistent before recent years; asking for everything and
  picking one reading a day is done on import, not here), sets the date range, presses Show and, once the page has
  the rows, presses the page's own Excel export button. The file is MCX's own (a table wrapped as .xls, named
  SpotMarket_<timestamp>.xls); since that name carries no commodity or date info, the commodity/location label is put
  in front of it when saving to a folder. Nothing is sent to Xfina.

  Unlike NSE Indices or AMFI, MCX's Archive endpoint takes no date-range cap: one Show returns the entire range in
  one response (tested: 2005 to today, ~14,600 rows, one call), so each run is a single file per commodity, no
  splitting into years. Session is always ALL: MCX's own Session label is only reliably populated in the last few
  years (checked live: 2020 returns zero rows for Session 3, 2006 almost none), so filtering at download time would
  silently drop most of the history. The file keeps every poll of the day; Xfina's importer picks one reading a day.

  Modes as in nse-indices.js: Update fetches what is new since the newest date remembered per commodity/location,
  Full history redoes everything from the catalogue's start date, Custom takes a start and an end date; each save
  waits 6 to 9 seconds in two halves (before Show, and while the table shows).

  MCX's terms restrict "systematic or automated data collection" with no personal-use exception, the same category
  as NSE's. This does the same clicking a person would, on the same page and the same buttons, one file at a time,
  at a human pace; the card says so plainly and leaves the choice to the reader.

  Parameter, filled in when the bookmark is generated (bookmarklet.js): __PRODUCTS__, JSON,
  [["GOLD", "AHMEDABAD", "MCX Spot Market Price: Gold (Ahmedabad)", "2005-06-06"], ...]:
  MCX's own commodity code, its polling location, a label, and the first date to ask for.
  Written to be minified: statements end in semicolons, no line comments inside.
  If the page changes, this is the one file to fix.
*/
(function () {
  var HOST = 'mcxindia.com';
  var X = JSON.parse('__PRODUCTS__');
  var KEY = 'xfina.mcxSpot.v1';
  var DAY = 864e5;
  var FAST = 3;
  var WAIT = 15;
  var GAP = '3-5';
  var MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  var host = location.hostname;
  if (host.replace(/^www\./, '') !== HOST) { alert('Xfina: open mcxindia.com (Market Data, Spot Market Price) and click this bookmark again.'); return; }
  if (host === HOST) {
    alert('Xfina: your browser keeps its memory separately for each address of this site, so this moves to the www address. Click the bookmark again once it has loaded.');
    location.replace(location.href.replace('//' + HOST, '//www.' + HOST));
    return;
  }
  if (!document.getElementById('Archive-Commodity') || !document.getElementById('btnArchive')) { alert('Xfina: open the Spot Market Price page on mcxindia.com (mcxindia.com/market-data/spot-market-price) and click this bookmark again.'); return; }
  var old = document.getElementById('xfina-bm');
  if (old) old.remove();

  var q = function (id) { return document.getElementById(id); };
  var day = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  var parse = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var nice = function (d) { return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); };
  var dmy = function (d) { return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear(); };
  var parseShown = function (s) { var p = s.trim().split(' '); return new Date(+p[2], MON.indexOf(p[1]), +p[0]); };
  var look = async function (el) {
    el = typeof el === 'string' ? document.querySelector(el) : el;
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    var o = el.style.outline;
    el.style.outline = '3px solid #4ade80';
    await pause(600);
    el.style.outline = o;
  };
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

  var plan = function () {
    return X.map(function (x, i) {
      var key = x[0] + '|' + x[1];
      var s = parse(x[3]);
      var l = mem[key] ? parse(mem[key]) : null;
      var f = s;
      var t = today;
      if (mode === 'C') {
        if (cf) f = parse(cf);
        if (ct) t = parse(ct);
        if (f < s) f = s;
        if (t > today) t = today;
      } else if (mode === 'U' && l) f = day(l, 1);
      return { i: i, key: key, product: x[0], location: x[1], label: x[2], f: f, t: t, has: f <= t, first: mode === 'U' && !l };
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
    '<div style="display:flex;justify-content:space-between;font-weight:600;font-size:15px">Xfina - MCX Spot Price - Download<span style="display:flex;gap:8px;align-items:center">' + ring('xz', 'Next file in (seconds)') + '<span id="xx" style="cursor:pointer" class="g" title="Stop and close">✕</span></span></div>' +
    '<div class="g" style="margin:2px 0 8px">Keep this tab in front. Nothing goes to Xfina.</div>' +
    X.map(function (x, i) { return '<label><span>' + x[2] + '</span><span class="g" id="xr' + i + '"></span></label>'; }).join('') +
    '<div id="xc" class="g" style="display:none;margin:6px 0">From <input type="date" id="xf"> to <input type="date" id="xt"></div>' +
    '<div id="xs" style="margin-top:8px;font-size:12px"></div>' +
    '<div style="height:6px;background:#27272a;border-radius:6px;margin:6px 0"><div id="xb" style="height:100%;width:0;background:#4ade80"></div></div>' +
    '<div class="w" id="xn" style="display:none">Your browser may ask to allow multiple downloads: choose <b>Allow</b>. Carrying on in <b id="xk"></b>s. <u id="xu" style="cursor:pointer">Continue now</u></div>' +
    '<div class="w" id="xw" style="display:none">Your browser blocks storage for this site, so Update will fetch the full history each time.</div>' +
    '<div style="display:flex;gap:6px;margin-top:8px">' + [['U', 'Update'], ['F', 'Full history'], ['C', 'Custom']].map(function (m) { return '<button id="xm' + m[0] + '">' + m[1] + '</button>'; }).join('') + '<button id="xg" style="margin-left:auto;padding:0 18px">Save</button></div>';
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
      var c = r.has ? 1 : 0;
      n += c;
      q('xr' + i).textContent = c ? nice(r.f) + ' → ' + nice(r.t) + (r.first ? ' · first run' : '') : mode === 'U' ? 'up to date' : 'nothing in range';
    });
    ['U', 'F', 'C'].forEach(function (m) { q('xm' + m).className = mode === m ? 'on' : ''; });
    q('xc').style.display = mode === 'C' ? 'block' : 'none';
    q('xw').style.display = stored ? 'none' : 'block';
    q('xg').style.opacity = n ? 1 : 0.5;
    return { p: p, n: n };
  };
  ['U', 'F', 'C'].forEach(function (m) { q('xm' + m).onclick = function () { if (!busy) { mode = m; fin = 0; q('xg').textContent = 'Save'; render(); } }; });
  q('xf').oninput = function () { if (!busy) { cf = this.value; render(); } };
  q('xt').oninput = function () { if (!busy) { ct = this.value; render(); } };
  var skip = 0;
  q('xu').onclick = function () { skip = 1; };
  q('xx').onclick = function () { stop = 1; undo(); box.remove(); };

  var xlsShown = function () { var e = q('btnArchiveXLS'); return e && e.offsetParent !== null; };
  var xlsEmpty = function () { var t = document.querySelector('#Archive-tabledata tbody'); return t && /data not available/i.test(t.textContent); };
  var reqs = function () { return performance.getEntriesByType('resource').filter(function (e) { return e.name.indexOf('GetSpotMarketArchive') > 0; }).length; };
  var newest = function () {
    var r = document.querySelector('#Archive-tabledata tbody tr');
    var c = r && r.cells[5];
    if (!c) return null;
    var d = parseShown(c.textContent);
    return isNaN(d) ? null : d;
  };
  var nativeClick = HTMLAnchorElement.prototype.click;
  var makeUrl = URL.createObjectURL;
  var lastBlob = null;
  var cap = null;
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
    try {
      var archBtn = Array.prototype.filter.call(document.querySelectorAll('button.toggle-button'), function (b) { return b.getAttribute('data-content') === 'Archive'; })[0];
      if (archBtn && archBtn.className.indexOf('active') < 0) { await look(archBtn); archBtn.click(); await pause(400); }
      if (dir) {
        URL.createObjectURL = function (b) { lastBlob = b; return makeUrl.call(URL, b); };
        HTMLAnchorElement.prototype.click = function () {
          if (this.hasAttribute('download') && /^blob:/.test(this.href)) { cap = { blob: lastBlob, download: this.download }; return; }
          return nativeClick.apply(this, arguments);
        };
      }
      var todo = r.p.filter(function (p) { return p.has; });
      for (var i = 0; i < todo.length && !stop; i++) {
        var p = todo[i];
        var cSel = q('Archive-Commodity');
        await look(cSel);
        cSel.value = p.product;
        cSel.dispatchEvent(new Event('change', { bubbles: true }));
        var lSel = q('Archive-Location');
        await look(lSel);
        lSel.value = p.location;
        lSel.dispatchEvent(new Event('change', { bubbles: true }));
        var sSel = q('ddlSelectSeesion');
        sSel.value = '0';
        sSel.dispatchEvent(new Event('change', { bubbles: true }));
        var fEl = q('ArchivefromDate');
        await look(fEl);
        fEl.value = dmy(p.f);
        fEl.dispatchEvent(new Event('change', { bubbles: true }));
        var tEl = q('ArchiveToDate');
        await look(tEl);
        tEl.value = dmy(p.t);
        tEl.dispatchEvent(new Event('change', { bubbles: true }));
        var half = (6 + Math.floor(Math.random() * 4)) / 2;
        await nap(half);
        var go = q('btnArchive');
        await look(go);
        var n0 = reqs();
        go.click();
        var got = await wait(function () { return reqs() > n0; }, 25000);
        if (!got) throw new Error('the page did not return results');
        await pause(500);
        if (!(await wait(function () { return xlsShown() || xlsEmpty(); }, 5000))) throw new Error('the page did not render the results');
        if (xlsEmpty()) {
          q('xr' + p.i).textContent = 'no data for this range';
        } else {
          await nap(half);
          var ex = q('btnArchiveXLS');
          await look(ex);
          cap = null;
          ex.click();
          if (dir) {
            if (!(await wait(function () { return cap; }, 15000))) throw new Error('the page did not offer the file');
            var fh = await dir.getFileHandle(p.label.replace(/[^A-Za-z0-9 .()_-]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ' + cap.download, { create: true });
            var ws = await fh.createWritable();
            await ws.write(cap.blob);
            await ws.close();
          }
          saved++;
          var e = newest();
          if (e) { var ei = iso(e); if (!mem[p.key] || ei > mem[p.key]) { mem[p.key] = ei; save(); } }
          q('xr' + p.i).textContent = 'saved';
          if (!dir && i < todo.length - 1 && saved === FAST) {
            q('xn').style.display = 'block';
            skip = 0;
            for (var s = WAIT; s > 0 && !skip && !stop; s--) { q('xk').textContent = s; turn('xz', s / WAIT, s); await pause(1000); }
            q('xn').style.display = 'none'; turn('xz', 1, GAP);
          }
        }
        done++;
        q('xb').style.width = Math.round((100 * done) / r.n) + '%';
      }
      fin = !stop;
      say(stop ? 'Stopped.' : 'Done: ' + saved + ' file' + (saved === 1 ? '' : 's') + ' saved' + (dir ? ' to the folder you chose.' : ' by your browser.'));
    } catch (e2) {
      say('Stopped: ' + e2.message);
    }
    undo();
    busy = 0;
    q('xg').textContent = fin ? 'Done' : 'Save';
    render();
    if (fin) q('xg').style.opacity = 1;
  };

  render();
})();
