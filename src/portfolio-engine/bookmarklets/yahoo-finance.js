/*
  Xfina bookmarklet: Yahoo Finance price history, made once and used again and again.

  Runs on finance.yahoo.com, on a ticker's own history page (/quote/<TICKER>/history/). Yahoo removed its Download
  button, so this does what a person now has to do by hand: it sets the page's own date range (using the same
  address the page's own pickers produce) and the frequency to Daily, reads the table Yahoo renders, and saves it
  as a CSV, exactly the values shown, nothing reshaped. Where the browser allows it (Chrome, Edge) it asks for a
  folder once and writes there; otherwise it's a normal browser download. Nothing is sent to Xfina.

  Same panel and modes as the NSE Indices bookmark, sized for one ticker instead of a list of indexes. Update
  (default) fetches only what is new: it remembers, per ticker, the newest date that came back and starts the day
  after (a ticker never saved gets its full history). Full history redoes everything. Custom takes a start and an
  end date. It shows the range it will fetch before Save CSV; pressing Save CSV moves the page there if it is not
  already (the same two-click redirect as NSE Indices' www move) and, once there, reads the table and saves it.
  Files overlap harmlessly: the importer merges by date, newer replacing older.

  It works on whichever ticker's page is open when it's clicked, including ones not in __STARTS__ below (then the
  panel says "from the earliest date shown" instead of a date, and Full history still asks Yahoo for everything by
  using period1=0; it works, there is just no known date to preview).

  Parameter, filled in when the bookmark is generated (bookmarklet.js): __STARTS__, JSON, {"VOO": "2010-09-09", ...}:
  the earliest date Yahoo's own table returns for each ticker in Xfina's catalogue, so the panel can show it before
  a run; purely a display nicety, not required for the fetch itself to work.

  Written to be minified: statements end in semicolons, no line comments inside.
  If the page changes, this is the one file to fix.
*/
(function () {
  var HOST = 'finance.yahoo.com';
  var KEY = 'xfina.yahooFinance.v1';
  var DAY = 864e5;
  var STARTS = JSON.parse('__STARTS__');
  var MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  if (location.hostname !== HOST) { alert('Xfina: open a ticker\'s history page on finance.yahoo.com (for example finance.yahoo.com/quote/VOO/history/) and click this bookmark again.'); return; }
  var m = location.pathname.match(/\/quote\/([^/]+)\/history/i);
  if (!m) { alert('Xfina: open a ticker\'s own History page first (for example finance.yahoo.com/quote/VOO/history/), then click this bookmark again.'); return; }
  var TICKER = decodeURIComponent(m[1]);
  var old = document.getElementById('xfina-bm');
  if (old) old.remove();

  var q = function (id) { return document.getElementById(id); };
  var day = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  var parse = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var nice = function (d) { return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); };
  var epoch = function (d) { return String(Math.floor(d.getTime() / 1000)); };
  var parseShown = function (s) { var p = s.replace(',', '').split(' '); return new Date(+p[2], MON.indexOf(p[0]), +p[1]); };
  var today = day(new Date(), 0);

  var mem = {};
  var stored = true;
  try { mem = JSON.parse(localStorage.getItem(KEY) || '{}'); localStorage.setItem(KEY + '.t', 1); localStorage.removeItem(KEY + '.t'); } catch (e) { stored = false; }
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) { } };

  var mode = 'U';
  var cf = '';
  var ct = '';
  var last = mem[TICKER] ? parse(mem[TICKER]) : null;

  var known = STARTS[TICKER] ? parse(STARTS[TICKER]) : null;
  var plan = function () {
    var f = last ? day(last, 1) : known;
    var t = today;
    if (mode === 'F') f = known;
    else if (mode === 'C') {
      f = cf ? parse(cf) : (last ? day(last, 1) : known);
      if (ct) t = parse(ct);
      if (t > today) t = today;
    }
    return { f: f, t: t, first: mode === 'U' && !last };
  };

  var box = document.createElement('div');
  box.id = 'xfina-bm';
  box.innerHTML =
    '<style>#xfina-bm{position:fixed;top:16px;right:16px;z-index:2147483647;width:400px;max-height:92vh;overflow:auto;background:#0a0a0b;color:#fafafa;font:13px/1.5 system-ui,sans-serif;border:1px solid #3f3f46;border-radius:8px;padding:14px;box-shadow:0 8px 30px #0008}' +
    '#xfina-bm .g{color:#a1a1aa;font-size:12px}#xfina-bm label{display:flex;gap:8px;align-items:baseline;margin:2px 0;}#xfina-bm label .g{margin-left:auto;text-align:right}' +
    '#xfina-bm button{height:28px;padding:0 10px;border:1px solid #3f3f46;border-radius:6px;background:0;color:#fafafa;cursor:pointer}#xfina-bm .on,#xfina-bm #xg{background:#fafafa;color:#0a0a0b;border:0;font-weight:600}' +
    '#xfina-bm input[type=date]{height:26px;border:1px solid #3f3f46;border-radius:6px;background:#0a0a0b;color:#fafafa;color-scheme:dark}#xfina-bm #xs:empty{display:none}#xfina-bm .w{border:1px solid #f59e0b;border-radius:6px;padding:6px 8px;margin-top:6px;font-size:12px}</style>' +
    '<div style="display:flex;justify-content:space-between;font-weight:600;font-size:15px">Xfina - Yahoo Finance - Download<span id="xx" style="cursor:pointer" class="g" title="Close">✕</span></div>' +
    '<div class="g" style="margin:2px 0 8px">Keep this tab in front. Nothing goes to Xfina.</div>' +
    '<label><span>' + TICKER + '</span><span class="g" id="xr0"></span></label>' +
    '<div id="xc" class="g" style="display:none;margin:6px 0">From <input type="date" id="xf"> to <input type="date" id="xt"></div>' +
    '<div id="xs" style="margin-top:8px;font-size:12px"></div>' +
    '<div class="w" id="xw" style="display:none">Your browser blocks storage for this site, so Update will fetch the full history each time.</div>' +
    '<div style="display:flex;gap:6px;margin-top:8px">' + [['U', 'Update'], ['F', 'Full history'], ['C', 'Custom']].map(function (mm) { return '<button id="xm' + mm[0] + '">' + mm[1] + '</button>'; }).join('') + '<button id="xg" style="margin-left:auto;padding:0 18px">Save CSV</button></div>';
  document.body.appendChild(box);
  box.firstElementChild.style.cursor = 'move';
  box.firstElementChild.onmousedown = function (ev) {
    if (ev.target.id === 'xx') return;
    var dx = ev.clientX - box.offsetLeft, dy = ev.clientY - box.offsetTop;
    document.onmousemove = function (mv) { box.style.left = mv.clientX - dx + 'px'; box.style.top = mv.clientY - dy + 'px'; box.style.right = 'auto'; };
    document.onmouseup = function () { document.onmousemove = document.onmouseup = null; };
  };
  q('xx').onclick = function () { box.remove(); };

  var render = function () {
    var p = plan();
    q('xr0').textContent = p.f ? nice(p.f) + ' → ' + nice(p.t) + (p.first ? ' · first run' : '') : 'from the earliest date shown → ' + nice(p.t);
    ['U', 'F', 'C'].forEach(function (mm) { q('xm' + mm).className = mode === mm ? 'on' : ''; });
    q('xc').style.display = mode === 'C' ? 'block' : 'none';
    q('xw').style.display = stored ? 'none' : 'block';
    return p;
  };
  ['U', 'F', 'C'].forEach(function (mm) { q('xm' + mm).onclick = function () { mode = mm; render(); }; });
  q('xf').oninput = function () { mode = 'C'; cf = this.value; render(); };
  q('xt').oninput = function () { mode = 'C'; ct = this.value; render(); };
  var say = function (t) { q('xs').textContent = t; };
  var csvCell = function (s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  render();

  q('xg').onclick = async function () {
    var btn = q('xg');
    btn.disabled = true;
    var p = plan();
    var wantPeriod1 = p.f ? epoch(p.f) : '0';
    var wantPeriod2 = epoch(day(p.t, 1));
    var qs = new URLSearchParams(location.search);
    var nowSec = Math.floor(Date.now() / 1000);
    var needMove = qs.get('period1') !== wantPeriod1 || qs.get('frequency') !== '1d' || !qs.get('period2') || Math.abs(nowSec - +qs.get('period2')) > 172800 && +qs.get('period2') !== +wantPeriod2;
    if (needMove) {
      alert('Xfina: loading this range on the page. Click Save CSV again once it has loaded.');
      qs.set('period1', wantPeriod1);
      qs.set('period2', wantPeriod2);
      qs.set('frequency', '1d');
      location.href = location.pathname + '?' + qs.toString();
      return;
    }
    say('Reading the table...');
    var table = document.querySelector('table');
    var body = table && table.querySelectorAll('tbody tr');
    if (!table || !body || !body.length) { say('Nothing to save for this range.'); btn.disabled = false; return; }
    var head = [].map.call(table.querySelectorAll('thead th'), function (th) { return th.textContent.replace(/\s{2,}.*/s, '').trim(); });
    var rows = [head];
    for (var i = 0; i < body.length; i++) {
      var cells = body[i].querySelectorAll('td');
      if (!cells.length) continue;
      rows.push([].map.call(cells, function (td) { return td.textContent.trim(); }));
    }
    if (rows.length < 2) { say('Nothing to save for this range.'); btn.disabled = false; return; }
    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
    var oldest = rows[rows.length - 1][0], newest = rows[1][0];
    var name = TICKER + '_' + oldest.replace(/[, ]+/g, '-') + '_to_' + newest.replace(/[, ]+/g, '-') + '.csv';
    say('Saving ' + (rows.length - 1) + ' rows...');
    try {
      if (window.showDirectoryPicker) {
        var dir = await window.showDirectoryPicker({ mode: 'readwrite' });
        var fh = await dir.getFileHandle(name, { create: true });
        var ws = await fh.createWritable();
        await ws.write(csv);
        await ws.close();
      } else {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = name;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      }
      var got = parseShown(newest);
      if (mode !== 'C' || p.f) { if (!mem[TICKER] || iso(got) > mem[TICKER]) { mem[TICKER] = iso(got); save(); last = got; } }
      say('Done: saved ' + name + (window.showDirectoryPicker ? ' to the folder you chose.' : ' by your browser.'));
      render();
    } catch (e) {
      say('Stopped: ' + e.message);
    }
    btn.disabled = false;
  };
})();
