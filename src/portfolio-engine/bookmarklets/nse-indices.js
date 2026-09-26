/*
  Xfina bookmarklet: NSE Indices, Total Returns Index history. Made once, used again and again.

  It runs on niftyindices.com only. It opens a small panel on that page and, when you press Start, does what
  a person does on the Historical Data page: opens "Total returns Index Values", picks an index, sets a date
  range, presses Submit, then presses the page's own "csv format" button. It goes through the indexes you
  ticked one after another. The files are the ones the page itself produces, named by the page, exactly as a
  manual download. Where the browser saves them is the browser's own setting. Nothing is sent to Xfina.

  What it fetches:
    Update (the default)  only what is new. It remembers, per index, the date it last covered (in this
                          site's browser storage), and fetches from a couple of weeks before that to today.
                          An index it has never done gets its full history. So the first click brings in
                          everything and every later click brings in the difference. It always re-fetches
                          the last couple of weeks, so a day fetched before the market closed is corrected
                          and clicking twice in a day is harmless.
    Full history          every index from its own start, to redo everything.
    Custom                a start and an end date you choose.
  The end is always today unless a custom end is set. The importer merges files by date, newer files replacing
  older data for the same dates, so overlap and repeats are harmless.

  A range of up to a year is one file. The page refuses more than a year (more than 365 days between the two
  dates), so a longer range is split into one file per financial year (April to March), the ends partial.

  The first three files go out back to back so the browser asks about "multiple downloads" straight away, then
  the run waits for the user to choose Allow before carrying on at a gentler pace.

  Parameter, filled in when the bookmark is generated (see bookmarklet.js):
    __INDEXES__  JSON, [["NIFTY 50", "Nifty 50", "1999-06-30"], ...]: the name the page's dropdown uses, a
                 label, and the date the index starts.
  Written to be minified: statements end in semicolons, no line comments inside.
  If the page changes, this is the one file to fix.
*/
(function () {
  var HOST = 'niftyindices.com';
  var INDEXES = JSON.parse('__INDEXES__');
  var SUBINDEX = 'Broad Market Indices';
  var FAST = 3;
  var ALLOW_SECS = 15;
  var OVERLAP = 14;
  var STORE = 'xfina.nseIndices.v1';
  var DAY = 86400000;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

  var day = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  var parse = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var nice = function (d) { return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); };
  var today = day(new Date(), 0);

  var read = function () {
    try { var m = JSON.parse(localStorage.getItem(STORE) || '{}'); m.last = m.last || {}; return m; } catch (e) { return { last: {} }; }
  };
  var write = function (m) { try { localStorage.setItem(STORE, JSON.stringify(m)); } catch (e) { } };
  var memory = read();

  var picked = INDEXES.map(function () { return true; });
  var mode = 'UPDATE';
  var cFrom = '';
  var cTo = '';
  var running = false;
  var stopped = false;

  var fyWindows = function (from, to) {
    var out = [];
    var cursor = from;
    while (cursor <= to) {
      var y = cursor.getFullYear();
      var end = new Date(cursor.getMonth() >= 3 ? y + 1 : y, 2, 31);
      if (end > to) end = to;
      out.push([cursor, end]);
      cursor = day(end, 1);
    }
    return out;
  };
  var windowsFor = function (from, to) {
    if (from > to) return [];
    return Math.round((to - from) / DAY) <= 365 ? [[from, to]] : fyWindows(from, to);
  };

  var planFor = function () {
    var out = [];
    INDEXES.forEach(function (x, i) {
      if (!picked[i]) return;
      var start = parse(x[2]);
      var last = memory.last[x[0]] ? parse(memory.last[x[0]]) : null;
      var from = start;
      var to = today;
      var contiguous = true;
      var first = false;
      if (mode === 'CUSTOM') {
        if (cFrom) from = parse(cFrom);
        if (cTo) to = parse(cTo);
        if (from < start) from = start;
        if (to > today) to = today;
        contiguous = from <= start || (last !== null && from <= day(last, 1));
      } else if (mode === 'UPDATE') {
        if (last) {
          from = day(last, -OVERLAP);
          if (from < start) from = start;
          if (from > to) from = to;
        } else {
          first = true;
        }
      }
      out.push({ name: x[0], label: x[1], from: from, to: to, windows: windowsFor(from, to), contiguous: contiguous, first: first });
    });
    return out;
  };

  var box = document.createElement('div');
  box.id = 'xfina-bm';
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;width:380px;max-height:92vh;overflow:auto;background:#0a0a0b;color:#fafafa;font:14px/1.5 system-ui,sans-serif;border:1px solid #3f3f46;border-radius:8px;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,.5)';
  var picks = INDEXES.map(function (x, i) {
    return '<label style="display:flex;gap:8px;align-items:center;margin:3px 0;cursor:pointer"><input type="checkbox" checked id="xfina-pick-' + i + '"><span>' + x[1] + '</span><span id="xfina-last-' + i + '" style="margin-left:auto;font-size:12px;color:#a1a1aa"></span></label>';
  }).join('');
  var modeBtn = function (id, label) {
    return '<button id="xfina-m-' + id + '" style="height:28px;padding:0 10px;border:1px solid #3f3f46;border-radius:6px;background:transparent;color:#fafafa;font-size:13px;cursor:pointer">' + label + '</button>';
  };
  var dateInput = function (id) {
    return '<input type="date" id="' + id + '" style="height:28px;border:1px solid #3f3f46;border-radius:6px;background:#0a0a0b;color:#fafafa;color-scheme:dark;padding:0 6px;font-size:13px">';
  };
  box.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:16px">Xfina · NSE Indices<span id="xfina-x" style="cursor:pointer;color:#a1a1aa" title="Stop and close">✕</span></div>' +
    '<div style="color:#a1a1aa;font-size:12px;margin:4px 0 10px">Downloads NSE\'s own CSV files. Keep this tab open and in front while it runs: browsers pause background tabs. Nothing is sent to Xfina.</div>' +
    picks +
    '<div style="display:flex;gap:6px;margin:10px 0 6px">' + modeBtn('UPDATE', 'Update') + modeBtn('FULL', 'Full history') + modeBtn('CUSTOM', 'Custom') + '</div>' +
    '<div id="xfina-custom" style="display:none;gap:8px;align-items:center;margin-bottom:6px;font-size:12px;color:#a1a1aa">Start ' + dateInput('xfina-from') + ' End ' + dateInput('xfina-to') + '</div>' +
    '<div id="xfina-plan" style="font-size:12px;color:#a1a1aa;margin:6px 0"></div>' +
    '<button id="xfina-go" style="width:100%;height:36px;border:0;border-radius:6px;background:#fafafa;color:#0a0a0b;font-weight:600;cursor:pointer">Start</button>' +
    '<div style="height:8px;background:#27272a;border-radius:9px;overflow:hidden;margin-top:10px"><div id="xfina-bar" style="height:100%;width:0;background:#4ade80;transition:width .3s"></div></div>' +
    '<div id="xfina-status" style="margin-top:6px;font-size:13px"></div>' +
    '<div id="xfina-note" style="display:none;margin-top:8px;padding:8px;border:1px solid #f59e0b;border-radius:6px;font-size:12px">Your browser may now ask to allow multiple downloads. Choose <b>Allow</b>. Carrying on in <b id="xfina-count"></b>s at a gentler pace. <span id="xfina-skip" style="text-decoration:underline;cursor:pointer">Continue now</span></div>' +
    '<div id="xfina-log" style="margin-top:6px;font-size:12px;color:#a1a1aa;white-space:pre-line"></div>';
  document.body.appendChild(box);

  var el = function (id) { return document.getElementById(id); };
  var status = function (t) { el('xfina-status').textContent = t; };
  var log = function (t) {
    var l = el('xfina-log');
    l.textContent = (l.textContent + t + '\n').split('\n').slice(-6).join('\n');
  };
  var pause = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var human = function (a, b) { return pause(a + Math.random() * (b - a)); };
  var saved = 0;
  var gentle = function (a, b) { return saved >= FAST ? human(a, b) : pause(250); };
  var waitFor = async function (test, ms) {
    var t0 = Date.now();
    while (Date.now() - t0 < ms && !stopped) {
      var v = test();
      if (v) return v;
      await pause(250);
    }
    return null;
  };
  var skip = false;
  el('xfina-skip').onclick = function () { skip = true; };
  var allowPrompt = async function () {
    var note = el('xfina-note');
    note.style.display = 'block';
    skip = false;
    for (var n = ALLOW_SECS; n > 0 && !skip && !stopped; n--) {
      el('xfina-count').textContent = n;
      await pause(1000);
    }
    note.style.display = 'none';
  };

  var renderPlan = function () {
    INDEXES.forEach(function (x, i) {
      var l = memory.last[x[0]];
      el('xfina-last-' + i).textContent = l ? 'up to ' + nice(parse(l)) : 'not downloaded yet';
    });
    ['UPDATE', 'FULL', 'CUSTOM'].forEach(function (m) {
      el('xfina-m-' + m).style.background = mode === m ? '#fafafa' : 'transparent';
      el('xfina-m-' + m).style.color = mode === m ? '#0a0a0b' : '#fafafa';
    });
    el('xfina-custom').style.display = mode === 'CUSTOM' ? 'flex' : 'none';
    var plan = planFor();
    var total = plan.reduce(function (n, p) { return n + p.windows.length; }, 0);
    var lines = plan.map(function (p) {
      if (!p.windows.length) return p.label + ': nothing in this range';
      return p.label + ': ' + nice(p.from) + ' to ' + nice(p.to) + ' · ' + p.windows.length + (p.windows.length === 1 ? ' file' : ' files') + (p.first ? ' (first run: full history)' : '');
    });
    el('xfina-plan').textContent = plan.length ? lines.join('\n') + '\nTotal: ' + total + (total === 1 ? ' file' : ' files') : 'Tick at least one index.';
    el('xfina-plan').style.whiteSpace = 'pre-line';
    el('xfina-go').style.opacity = total ? '1' : '.5';
  };

  INDEXES.forEach(function (x, i) {
    el('xfina-pick-' + i).onchange = function () { if (running) return; picked[i] = this.checked; renderPlan(); };
  });
  ['UPDATE', 'FULL', 'CUSTOM'].forEach(function (m) {
    el('xfina-m-' + m).onclick = function () { if (running) return; mode = m; renderPlan(); };
  });
  el('xfina-from').oninput = function () { if (running) return; cFrom = this.value; renderPlan(); };
  el('xfina-to').oninput = function () { if (running) return; cTo = this.value; renderPlan(); };
  el('xfina-x').onclick = function () { stopped = true; window.alert = realAlert; box.remove(); };

  var alerts = [];
  var realAlert = window.alert;
  var rowsNow = function () { return document.querySelectorAll('#historytotalindex tr'); };
  var firstRow = function () { var r = rowsNow(); return r.length > 1 ? r[1].textContent : ''; };

  el('xfina-go').onclick = async function () {
    if (running) return;
    var plan = planFor();
    var total = plan.reduce(function (n, p) { return n + p.windows.length; }, 0);
    if (!total) { status('Nothing to download for this choice.'); return; }
    running = true;
    stopped = false;
    saved = 0;
    var done = 0;
    var progress = function () { el('xfina-bar').style.width = Math.round((100 * done) / total) + '%'; };
    window.alert = function (m) { alerts.push(String(m)); };
    try {
      status('Opening the page\'s Total Returns section...');
      document.querySelector('li.form5').click();
      await pause(1200);
      $('#ddlHistoricalreturntypee').val('Equity').trigger('change');
      if (!(await waitFor(function () { return $('#ddlHistoricalreturntypeeSubindex option').length > 1; }, 10000))) throw new Error('the page did not list index groups');
      $('#ddlHistoricalreturntypeeSubindex').val(SUBINDEX).trigger('change');
      if (!(await waitFor(function () { return $('#ddlHistoricalreturntypeeindex option').length > 1; }, 10000))) throw new Error('the page did not list indexes');

      for (var i = 0; i < plan.length && !stopped; i++) {
        var p = plan[i];
        if (!p.windows.length) continue;
        var has = $('#ddlHistoricalreturntypeeindex option').filter(function () { return this.value === p.name; }).length;
        if (!has) { log(p.label + ' is not in the page\'s list, skipped'); done += p.windows.length; progress(); continue; }
        $('#ddlHistoricalreturntypeeindex').val(p.name).trigger('change');
        await gentle(800, 1500);
        for (var k = 0; k < p.windows.length && !stopped; k++) {
          var w = p.windows[k];
          status(p.label + ' (' + (i + 1) + ' of ' + plan.length + '), file ' + (k + 1) + ' of ' + p.windows.length + ': ' + nice(w[0]) + ' to ' + nice(w[1]));
          var before = firstRow();
          $('#datepickerFromtotalindex').datepicker('setDate', w[0]);
          $('#datepickerTototalindex').datepicker('setDate', w[1]);
          await gentle(600, 1400);
          alerts = [];
          document.getElementById('submit_totalindexhistorical').click();
          var loaded = await waitFor(function () { return alerts.length || (firstRow() && firstRow() !== before); }, 20000);
          if (alerts.length) throw new Error(alerts[0]);
          if (!loaded) {
            log(p.label + ' ' + iso(w[0]) + ' to ' + iso(w[1]) + ': no data, skipped');
          } else {
            await gentle(500, 1200);
            document.getElementById('exportTotalindex').click();
            saved++;
            log('saved ' + p.label + ' ' + iso(w[0]) + ' to ' + iso(w[1]));
            if (p.contiguous) {
              var end = iso(w[1]);
              if (!memory.last[p.name] || end > memory.last[p.name]) { memory.last[p.name] = end; write(memory); }
            }
            if (!(i === plan.length - 1 && k === p.windows.length - 1)) {
              if (saved === FAST) await allowPrompt();
              else if (saved > FAST) await human(3500, 6500);
            }
          }
          done++;
          progress();
        }
      }
      status(stopped ? 'Stopped.' : 'Done: ' + saved + ' files saved by your browser. Import them in Portfolio Engine.');
    } catch (e) {
      status('Stopped: ' + e.message);
    }
    window.alert = realAlert;
    running = false;
    renderPlan();
  };

  renderPlan();
})();
