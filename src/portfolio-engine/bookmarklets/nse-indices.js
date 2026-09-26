/*
  Xfina bookmarklet: NSE Indices, Total Returns Index history.

  It runs on niftyindices.com only, calls that site's own data endpoint (the one its historical data
  page uses) with the visitor's own session, and saves one file per index to the visitor's disk.
  Nothing is sent to Xfina or anywhere else. The visitor then imports the files in Portfolio Engine.

  The file is NSE's response saved exactly as received. It is parsed here only to check it is not empty
  and to name the file; the text that is saved is never rebuilt or reformatted. Xfina reads the source's
  own format, so there is no Xfina format to maintain.

  The indexes to fetch are baked in when the bookmark is generated: bookmarklet.js replaces __INDEXES__
  with the ones the user added to their download list, as JSON [["NIFTY 50","Nifty 50"], ...]. Clicking
  the bookmark downloads exactly those, with no choosing on the site.

  Written to be minified by bookmarklet.js: statements end in semicolons, no line comments inside.
  If NSE changes the endpoint, this is the one file to fix.
*/
(function () {
  var HOST = 'niftyindices.com';
  var INDEXES = JSON.parse('__INDEXES__');
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (location.hostname.replace(/^www\./, '') !== HOST) {
    alert('Xfina: open niftyindices.com (Reports, Historical Data) and click this bookmark again.');
    return;
  }
  var old = document.getElementById('xfina-bm');
  if (old) old.remove();

  var box = document.createElement('div');
  box.id = 'xfina-bm';
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;width:340px;background:#0a0a0b;color:#fafafa;font:14px/1.5 system-ui,sans-serif;border:1px solid #3f3f46;border-radius:8px;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,.5)';
  var rows = INDEXES.map(function (x) {
    return '<div style="margin:2px 0">' + x[1] + ' TRI</div>';
  }).join('');
  box.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:16px">Xfina · NSE Indices<span id="xfina-x" style="cursor:pointer;color:#a1a1aa">✕</span></div>' +
    '<div style="color:#a1a1aa;font-size:12px;margin:4px 0 8px">Total Returns Index, full history. Files save to your Downloads folder. Nothing is sent to Xfina.</div>' +
    rows +
    '<div id="xfina-log" style="margin-top:8px;font-size:12px;color:#a1a1aa;white-space:pre-line"></div>';
  document.body.appendChild(box);

  var log = function (t) { document.getElementById('xfina-log').textContent += t + '\n'; };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var nseDate = function (d) { return d.getDate() + '-' + MONTHS[d.getMonth()] + '-' + d.getFullYear(); };
  var iso = function (s) {
    var p = s.split(' ');
    return p[2] + '-' + pad(MONTHS.indexOf(p[1]) + 1) + '-' + pad(+p[0]);
  };
  var pause = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function fetchIndex(name) {
    var cinfo = JSON.stringify({ name: name, startDate: '01-Jan-1990', endDate: nseDate(new Date()), indexName: name });
    return fetch('/BackPage/getTotalReturnIndexString', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ cinfo: cinfo })
    }).then(function (r) { return r.text(); });
  }
  function save(filename, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }

  document.getElementById('xfina-x').onclick = function () { box.remove(); };
  (async function () {
    for (var k = 0; k < INDEXES.length; k++) {
      var name = INDEXES[k][0], label = INDEXES[k][1];
      log('Fetching ' + label + ' ...');
      try {
        var text = await fetchIndex(name);
        var data = JSON.parse(text);
        if (!data.length) { log('  no data returned'); continue; }
        var first = iso(data[data.length - 1].Date), last = iso(data[0].Date);
        var file = 'nse-indices_' + label.toLowerCase().replace(/ /g, '-') + '_tri_' + first + '_' + last + '.json';
        save(file, text);
        log('  saved ' + file + ' (' + data.length + ' days)');
      } catch (e) {
        log('  failed: ' + e.message);
      }
      await pause(600);
    }
    log('Done. Import the files in Portfolio Engine.');
  })();
})();
