/*
  Xfina bookmarklet: NSE Indices, Total Returns Index history. One bookmark runs every index you picked,
  one after another.

  It runs on niftyindices.com only and does what a person does on the Historical Data page: opens
  "Total returns Index Values", picks an index, sets a date range of one financial year (April to March),
  presses Submit, then presses the page's own "csv format" button. It repeats that for each year from the
  chosen start to today, then moves on to the next index, pausing a few seconds between files to stay gentle
  on the site. The files are the ones the page itself produces, named by the page, exactly as a manual
  download. Where the browser saves them is the browser's own setting.

  The page refuses a range longer than a year (more than 365 days between the two dates), so a long index
  takes one file per financial year. A whole financial year always fits, leap years included. Nothing is
  sent to Xfina or anywhere else. The importer merges the files by date, newer files replacing older data
  for the same dates.

  Parameters, filled in when the bookmark is generated (see bookmarklet.js), all JSON:
    __INDEXES__  [["NIFTY 50", "Nifty 50", "1999-06-30"], ...]  the name the page's dropdown uses, a label,
                 and the date the index starts.
    __FROM__     where to start, worked out when the bookmark is CLICKED, so one bookmark can be reused:
                 "CURRENT" (the current financial year), "PREVIOUS" (the one before, then the current one),
                 "FULL" (each index's own start), or a date like "2020-04-01" for a custom range. Never
                 earlier than an index's start.
    __TO__       where to end: "" for today, or a date like "2025-11-20" for a custom range. Never later
                 than today.
  Written to be minified: statements end in semicolons, no line comments inside.
  If the page changes, this is the one file to fix.
*/
(function () {
  var HOST = 'niftyindices.com';
  var INDEXES = JSON.parse('__INDEXES__');
  var FROM = JSON.parse('__FROM__');
  var TO = JSON.parse('__TO__');
  var SUBINDEX = 'Broad Market Indices';

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
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;width:360px;background:#0a0a0b;color:#fafafa;font:14px/1.5 system-ui,sans-serif;border:1px solid #3f3f46;border-radius:8px;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,.5)';
  box.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:16px">Xfina · NSE Indices<span id="xfina-x" style="cursor:pointer;color:#a1a1aa" title="Stop and close">✕</span></div>' +
    '<div style="color:#a1a1aa;font-size:12px;margin:4px 0 10px">Downloads NSE\'s own CSV, one file per financial year, one index after another, pausing between files to go easy on the site. Keep this tab open and in front while it runs: browsers pause background tabs. Your browser saves the files where it normally does. Allow multiple downloads if asked. Nothing is sent to Xfina.</div>' +
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
  var day = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  var parse = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };

  var today = day(new Date(), 0);
  var yearStart = function (d) {
    return new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1);
  };
  var until = TO ? parse(TO) : today;
  if (until > today) until = today;
  var wanted = null;
  if (FROM === 'CURRENT') wanted = yearStart(today);
  else if (FROM === 'PREVIOUS') { var cs = yearStart(today); wanted = new Date(cs.getFullYear() - 1, cs.getMonth(), 1); }
  else if (FROM !== 'FULL') wanted = parse(FROM);

  var windowsFor = function (indexStart) {
    var cursor = parse(indexStart);
    if (wanted && wanted > cursor) cursor = wanted;
    var out = [];
    while (cursor <= until) {
      var y = cursor.getFullYear();
      var m = cursor.getMonth();
      var end = new Date(m >= 3 ? y + 1 : y, 2, 31);
      if (end > until) end = until;
      var name = 'FY ' + (m >= 3 ? y : y - 1) + '-' + String((m >= 3 ? y + 1 : y) % 100).padStart(2, '0');
      out.push([cursor, end, name]);
      cursor = day(end, 1);
    }
    return out;
  };

  var plan = INDEXES.map(function (x) { return { name: x[0], label: x[1], windows: windowsFor(x[2]) }; });
  var total = plan.reduce(function (n, p) { return n + p.windows.length; }, 0);
  var done = 0;
  var progress = function () { document.getElementById('xfina-bar').style.width = Math.round((100 * done) / Math.max(total, 1)) + '%'; };

  var rowsNow = function () { return document.querySelectorAll('#historytotalindex tr'); };
  var firstRow = function () { var r = rowsNow(); return r.length > 1 ? r[1].textContent : ''; };

  (async function () {
    try {
      if (!total) { status('Nothing to download: the chosen period is empty.'); finish(); return; }
      status('Opening the page\'s Total Returns section...');
      document.querySelector('li.form5').click();
      await pause(1200);
      $('#ddlHistoricalreturntypee').val('Equity').trigger('change');
      if (!(await waitFor(function () { return $('#ddlHistoricalreturntypeeSubindex option').length > 1; }, 10000))) throw new Error('the page did not list index groups');
      $('#ddlHistoricalreturntypeeSubindex').val(SUBINDEX).trigger('change');
      if (!(await waitFor(function () { return $('#ddlHistoricalreturntypeeindex option').length > 1; }, 10000))) throw new Error('the page did not list indexes');

      var saved = 0;
      for (var i = 0; i < plan.length && !stopped; i++) {
        var p = plan[i];
        var has = $('#ddlHistoricalreturntypeeindex option').filter(function () { return this.value === p.name; }).length;
        if (!has) { log(p.label + ' is not in the page\'s list, skipped'); done += p.windows.length; progress(); continue; }
        $('#ddlHistoricalreturntypeeindex').val(p.name).trigger('change');
        await human(800, 1500);
        for (var k = 0; k < p.windows.length && !stopped; k++) {
          var w = p.windows[k];
          var label = w[2] + ' (' + iso(w[0]) + ' to ' + iso(w[1]) + ')';
          status(p.label + ' (' + (i + 1) + ' of ' + plan.length + '), file ' + (k + 1) + ' of ' + p.windows.length + ': ' + label);
          var before = firstRow();
          $('#datepickerFromtotalindex').datepicker('setDate', w[0]);
          $('#datepickerTototalindex').datepicker('setDate', w[1]);
          await human(600, 1400);
          alerts = [];
          document.getElementById('submit_totalindexhistorical').click();
          var loaded = await waitFor(function () { return alerts.length || (firstRow() && firstRow() !== before); }, 20000);
          if (alerts.length) throw new Error(alerts[0]);
          if (!loaded) {
            log(p.label + ' ' + w[2] + ': no data, skipped');
          } else {
            await human(500, 1200);
            document.getElementById('exportTotalindex').click();
            saved++;
            log('saved ' + p.label + ' ' + w[2]);
            if (!(i === plan.length - 1 && k === p.windows.length - 1)) await human(3500, 6500);
          }
          done++;
          progress();
        }
      }
      status(stopped ? 'Stopped.' : 'Done: ' + saved + ' files saved by your browser. Import them in Portfolio Engine.');
    } catch (e) {
      status('Stopped: ' + e.message);
    }
    finish();
  })();
})();
