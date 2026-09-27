/*
  Xfina bookmarklet: Yahoo Finance price history, made once and used again and again.

  Runs on finance.yahoo.com, on a ticker's own history page (/quote/<TICKER>/history/). Yahoo removed its Download
  button, so this does what a person now has to do by hand: it sets the page's own date range as wide as it goes and
  the frequency to Monthly (using the same address the page's own pickers produce), reads the table Yahoo renders,
  and saves it as a CSV, exactly the values shown, nothing reshaped. Where the browser allows it (Chrome, Edge) it
  asks for a folder once and writes there; otherwise it's a normal browser download. Nothing is sent to Xfina.

  It takes no parameters: whichever ticker's page is open when it's clicked is the one it saves. If the page is not
  yet at the wide date range, it moves the page there and says to click the bookmark again once it has loaded,
  the same two-click pattern as the NSE Indices bookmark's www redirect.

  No dates are remembered: every click saves the fund's whole history in one file. The importer merges files by
  date, so re-running this later and re-importing is harmless; newer values replace older ones for the same dates.

  Written to be minified: statements end in semicolons, no line comments inside.
  If the page changes, this is the one file to fix.
*/
(function () {
  var HOST = 'finance.yahoo.com';
  if (location.hostname !== HOST) { alert('Xfina: open a ticker\'s history page on finance.yahoo.com (for example finance.yahoo.com/quote/VOO/history/) and click this bookmark again.'); return; }
  var m = location.pathname.match(/\/quote\/([^/]+)\/history/i);
  if (!m) { alert('Xfina: open a ticker\'s own History page first (for example finance.yahoo.com/quote/VOO/history/), then click this bookmark again.'); return; }
  var TICKER = decodeURIComponent(m[1]);
  var old = document.getElementById('xfina-bm');
  if (old) old.remove();

  var qs = new URLSearchParams(location.search);
  var WANT = { period1: '0', frequency: '1mo' };
  var today = Math.floor(Date.now() / 1000);
  var needMove = qs.get('period1') !== WANT.period1 || qs.get('frequency') !== WANT.frequency || !qs.get('period2') || today - +qs.get('period2') > 172800;
  if (needMove) {
    alert('Xfina: loading this ticker\'s full monthly history. Click the bookmark again once the page has loaded.');
    qs.set('period1', WANT.period1);
    qs.set('period2', String(today));
    qs.set('frequency', WANT.frequency);
    location.href = location.pathname + '?' + qs.toString();
    return;
  }

  var box = document.createElement('div');
  box.id = 'xfina-bm';
  box.innerHTML =
    '<style>#xfina-bm{position:fixed;top:16px;right:16px;z-index:2147483647;width:340px;background:#0a0a0b;color:#fafafa;font:13px/1.5 system-ui,sans-serif;border:1px solid #3f3f46;border-radius:8px;padding:14px;box-shadow:0 8px 30px #0008}' +
    '#xfina-bm .g{color:#a1a1aa;font-size:12px}#xfina-bm #xs:empty{display:none}' +
    '#xfina-bm button{height:28px;padding:0 14px;border:0;border-radius:6px;background:#fafafa;color:#0a0a0b;font-weight:600;cursor:pointer}button:disabled{opacity:.5;cursor:default}</style>' +
    '<div style="display:flex;justify-content:space-between;font-weight:600;font-size:15px">Xfina - Yahoo Finance - Download<span id="xx" style="cursor:pointer" class="g" title="Close">✕</span></div>' +
    '<div class="g" style="margin:2px 0 10px">' + TICKER + ', monthly, from the earliest date shown. Nothing goes to Xfina.</div>' +
    '<div id="xs" style="margin-bottom:8px;font-size:12px"></div>' +
    '<button id="xg">Save CSV</button>';
  document.body.appendChild(box);
  box.firstElementChild.style.cursor = 'move';
  box.firstElementChild.onmousedown = function (ev) {
    if (ev.target.id === 'xx') return;
    var dx = ev.clientX - box.offsetLeft, dy = ev.clientY - box.offsetTop;
    document.onmousemove = function (mv) { box.style.left = mv.clientX - dx + 'px'; box.style.top = mv.clientY - dy + 'px'; box.style.right = 'auto'; };
    document.onmouseup = function () { document.onmousemove = document.onmouseup = null; };
  };
  document.getElementById('xx').onclick = function () { box.remove(); };
  var say = function (t) { document.getElementById('xs').textContent = t; };
  var csvCell = function (s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

  document.getElementById('xg').onclick = async function () {
    var btn = document.getElementById('xg');
    btn.disabled = true;
    say('Reading the table...');
    var table = document.querySelector('table');
    var body = table && table.querySelectorAll('tbody tr');
    if (!table || !body || !body.length) { say('Stopped: the table has not loaded. Wait a moment and try again.'); btn.disabled = false; return; }
    var head = [].map.call(table.querySelectorAll('thead th'), function (th) { return th.textContent.replace(/\s{2,}.*/s, '').trim(); });
    var rows = [head];
    for (var i = 0; i < body.length; i++) {
      var cells = body[i].querySelectorAll('td');
      if (!cells.length) continue;
      rows.push([].map.call(cells, function (td) { return td.textContent.trim(); }));
    }
    if (rows.length < 2) { say('Stopped: no rows found.'); btn.disabled = false; return; }
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
        say('Done: saved ' + name + ' to the folder you chose.');
      } else {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = name;
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        say('Done: ' + name + ' saved by your browser.');
      }
    } catch (e) {
      say('Stopped: ' + e.message);
    }
    btn.disabled = false;
  };
})();
