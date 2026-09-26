/*
  Xfina bookmarklet: NSE Indices, Total Returns Index history, one index per bookmark.

  It runs on niftyindices.com only and does what a person does on the Historical Data page: opens
  "Total returns Index Values", picks the index, sets a one-year date range, presses Submit, then
  presses the page's own "csv format" button. It repeats that for each year from the index's start
  date to today, pausing a few seconds each time like someone doing it by hand. The files are the
  ones the page itself produces, named by the page, exactly as a manual download.

  The page refuses a range longer than one year, so a long index takes one file per year. Nothing is
  sent to Xfina or anywhere else. The importer merges the files by date.

  Parameters, filled in when the bookmark is generated (see bookmarklet.js): __INDEX__ is JSON,
  ["NIFTY 50", "Nifty 50", "1999-06-30"]: the name the page's dropdown uses, a label, and the start date.
  Written to be minified: statements end in semicolons, no line comments inside.
  If the page changes, this is the one file to fix.
*/
(function () {
  var HOST = 'niftyindices.com';
  var INDEX = JSON.parse('__INDEX__');
  var SUBINDEX = 'Broad Market Indices';
  var SPAN_DAYS = 364;
  var DAY = 86400000;

  if (location.hostname.replace(/^www\./, '') !== HOST) {
    alert('Xfina: open niftyindices.com (Reports, Historical Data) and click this bookmark again.');
    return;
  }
  if (typeof $ !== 'function' || !$.fn || !$.fn.datepicker || !document.querySelector('li.form5')) {
    alert('Xfina: this page has changed, so the bookmark cannot use it. Download by hand from Historical Data.');
    return;
  }
  var old = document.getElementById('xfina-bm');
  if (old) old.remove();

  var box = document.createElement('div');
  box.id = 'xfina-bm';
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;width:340px;background:#0a0a0b;color:#fafafa;font:14px/1.5 system-ui,sans-serif;border:1px solid #3f3f46;border-radius:8px;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,.5)';
  box.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:16px">Xfina · ' + INDEX[1] + ' TRI<span id="xfina-x" style="cursor:pointer;color:#a1a1aa" title="Stop and close">✕</span></div>' +
    '<div style="color:#a1a1aa;font-size:12px;margin:4px 0 10px">Downloads NSE\'s own CSV, one file per year, pausing between files like a person would. Allow multiple downloads if asked. Nothing is sent to Xfina.</div>' +
    '<div style="height:8px;background:#27272a;border-radius:9px;overflow:hidden"><div id="xfina-bar" style="height:100%;width:0;background:#4ade80;transition:width .3s"></div></div>' +
    '<div id="xfina-status" style="margin-top:6px;font-size:13px">Starting...</div>' +
    '<div id="xfina-log" style="margin-top:6px;font-size:12px;color:#a1a1aa;white-space:pre-line"></div>';
  document.body.appendChild(box);

  var stopped = false;
  var alerts = [];
  var realAlert = window.alert;
  window.alert = function (m) { alerts.push(String(m)); };
  var finish = function () { window.alert = realAlert; };
  document.getElementById('xfina-x').onclick = function () { stopped = true; finish(); box.remove(); };

  var status = function (t) { document.getElementById('xfina-status').textContent = t; };
  var log = function (t) {
    var el = document.getElementById('xfina-log');
    el.textContent = (el.textContent + t + '\n').split('\n').slice(-6).join('\n');
  };
  var progress = function (done, total) { document.getElementById('xfina-bar').style.width = Math.round((100 * done) / total) + '%'; };
  var pause = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var human = function (a, b) { return pause(a + Math.random() * (b - a)); };
  var waitFor = async function (test, ms) {
    var t0 = Date.now();
    while (Date.now() - t0 < ms && !stopped) {
      var v = test();
      if (v) return v;
      await pause(250);
    }
    return null;
  };
  var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };

  var windows = [];
  var p = INDEX[2].split('-');
  var cursor = new Date(+p[0], +p[1] - 1, +p[2]);
  var today = new Date();
  today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  while (cursor <= today) {
    var end = new Date(Math.min(cursor.getTime() + SPAN_DAYS * DAY, today.getTime()));
    windows.push([cursor, end]);
    cursor = new Date(end.getTime() + DAY);
  }

  var rowsNow = function () { return document.querySelectorAll('#historytotalindex tr'); };
  var firstRow = function () { var r = rowsNow(); return r.length > 1 ? r[1].textContent : ''; };

  (async function () {
    try {
      status('Opening the page\'s Total Returns section...');
      document.querySelector('li.form5').click();
      await pause(1200);
      $('#ddlHistoricalreturntypee').val('Equity').trigger('change');
      if (!(await waitFor(function () { return $('#ddlHistoricalreturntypeeSubindex option').length > 1; }, 10000))) throw new Error('the page did not list index groups');
      $('#ddlHistoricalreturntypeeSubindex').val(SUBINDEX).trigger('change');
      if (!(await waitFor(function () { return $('#ddlHistoricalreturntypeeindex option').filter(function () { return this.value === INDEX[0]; }).length; }, 10000))) throw new Error(INDEX[1] + ' is not in the page\'s list');
      $('#ddlHistoricalreturntypeeindex').val(INDEX[0]).trigger('change');
      await human(800, 1500);

      var saved = 0;
      for (var k = 0; k < windows.length && !stopped; k++) {
        var w = windows[k];
        var label = iso(w[0]) + ' to ' + iso(w[1]);
        status('Year ' + (k + 1) + ' of ' + windows.length + ': ' + label);
        var before = firstRow();
        $('#datepickerFromtotalindex').datepicker('setDate', w[0]);
        $('#datepickerTototalindex').datepicker('setDate', w[1]);
        await human(600, 1400);
        alerts = [];
        document.getElementById('submit_totalindexhistorical').click();
        var loaded = await waitFor(function () { return alerts.length || (firstRow() && firstRow() !== before); }, 20000);
        if (alerts.length) throw new Error(alerts[0]);
        if (!loaded) { log(label + ': no data, skipped'); progress(k + 1, windows.length); continue; }
        await human(500, 1200);
        document.getElementById('exportTotalindex').click();
        saved++;
        log('saved ' + label);
        progress(k + 1, windows.length);
        if (k < windows.length - 1) await human(3500, 6500);
      }
      status(stopped ? 'Stopped.' : 'Done: ' + saved + ' files in your Downloads folder. Import them in Portfolio Engine.');
    } catch (e) {
      status('Stopped: ' + e.message);
    }
    finish();
  })();
})();
