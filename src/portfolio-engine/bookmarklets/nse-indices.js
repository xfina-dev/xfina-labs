/*
  Xfina bookmarklet: NSE Indices, Total Returns Index history. Made once, used again and again.

  Runs on niftyindices.com only. It opens a small panel, one row per index, and on Start does what a person does on
  the Historical Data page: opens "Total returns Index Values", picks an index, sets a date range, presses Submit,
  then presses the page's own "csv format" button. The files are the ones the page produces, named by the page,
  exactly as a manual download; the browser decides where they are saved. Nothing is sent to Xfina.

  Modes: Update (default) fetches only what is new: it remembers, per index, the newest date that came back and
  starts the day after (an index it has never done gets its full history). Full history redoes everything from each
  index's start. Custom takes a start and an end date. The end is today unless a custom end is set. Files for
  the same dates overlap harmlessly: the importer merges by date, newer replacing older.

  A range of up to a year is one file. The page refuses more (over 365 days between the dates), so a longer range is
  split into one file per financial year (April to March), the ends partial. The first three files go out back to
  back so the browser asks to "allow multiple downloads" at once; the run then waits for that before slowing down.

  The memory is browser storage, kept separately for niftyindices.com and www.niftyindices.com, so the bookmark always
  works on the www address. If storage is blocked it says so, and Update then fetches the full history each time.

  Parameter, filled in when the bookmark is generated (bookmarklet.js): __INDEXES__, JSON,
  [["NIFTY 50", "Nifty 50", "1999-06-30"], ...]: the page's dropdown name, a label, the date the index starts.
  Written to be minified: statements end in semicolons, no line comments inside.
  If the page changes, this is the one file to fix.
*/
(function () {
  var HOST = 'niftyindices.com';
  var X = JSON.parse('__INDEXES__');
  var KEY = 'xfina.nseIndices.v2';
  var DAY = 864e5;
  var FAST = 3;
  var WAIT = 15;
  var MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  var host = location.hostname;
  if (host.replace(/^www\./, '') !== HOST) { alert('Xfina: open niftyindices.com (Reports, Historical Data) and click this bookmark again.'); return; }
  if (host === HOST) {
    alert('Xfina: your browser keeps its memory separately for each address of this site, so this moves to the www address. Click the bookmark again once it has loaded.');
    location.replace(location.href.replace('//' + HOST, '//www.' + HOST));
    return;
  }
  if (typeof $ !== 'function' || !$.fn || !$.fn.datepicker || !document.querySelector('li.form5')) { alert('Xfina: this page has changed, so the bookmark cannot use it. Download by hand from Historical Data.'); return; }
  var old = document.getElementById('xfina-bm');
  if (old) old.remove();

  var q = function (id) { return document.getElementById(id); };
  var day = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  var parse = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var nice = function (d) { return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); };
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

  var fy = function (f, t) {
    var o = [];
    while (f <= t) {
      var e = new Date(f.getMonth() >= 3 ? f.getFullYear() + 1 : f.getFullYear(), 2, 31);
      if (e > t) e = t;
      o.push([f, e]);
      f = day(e, 1);
    }
    return o;
  };
  var wins = function (f, t) { return f > t ? [] : Math.round((t - f) / DAY) <= 365 ? [[f, t]] : fy(f, t); };
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
      return { n: x[0], l: x[1], f: f, t: t, w: wins(f, t), first: mode === 'U' && !l };
    });
  };

  var box = document.createElement('div');
  box.id = 'xfina-bm';
  box.innerHTML =
    '<style>#xfina-bm{position:fixed;top:16px;right:16px;z-index:2147483647;width:400px;max-height:92vh;overflow:auto;background:#0a0a0b;color:#fafafa;font:13px/1.5 system-ui,sans-serif;border:1px solid #3f3f46;border-radius:8px;padding:14px;box-shadow:0 8px 30px #0008}' +
    '#xfina-bm .g{color:#a1a1aa;font-size:12px}#xfina-bm label{display:flex;gap:8px;align-items:baseline;margin:2px 0;}#xfina-bm label .g{margin-left:auto;text-align:right}' +
    '#xfina-bm button{height:28px;padding:0 10px;border:1px solid #3f3f46;border-radius:6px;background:0;color:#fafafa;cursor:pointer}#xfina-bm .on,#xfina-bm #xg{background:#fafafa;color:#0a0a0b;border:0;font-weight:600}' +
    '#xfina-bm input[type=date]{height:26px;border:1px solid #3f3f46;border-radius:6px;background:#0a0a0b;color:#fafafa;color-scheme:dark}#xfina-bm .w{border:1px solid #f59e0b;border-radius:6px;padding:6px 8px;margin-top:6px;font-size:12px}</style>' +
    '<div style="display:flex;justify-content:space-between;font-weight:600;font-size:15px">Xfina - NSE Indices - Download<span id="xx" style="cursor:pointer" class="g" title="Stop and close">✕</span></div>' +
    '<div class="g" style="margin:2px 0 8px">Keep this tab in front. Nothing goes to Xfina.</div>' +
    X.map(function (x, i) { return '<label><span>' + x[1] + '</span><span class="g" id="xr' + i + '"></span></label>'; }).join('') +
    '<div id="xc" class="g" style="display:none;margin:6px 0">From <input type="date" id="xf"> to <input type="date" id="xt"></div>' +
    '<div id="xs" style="margin-top:8px;font-size:12px"></div>' +
    '<div style="height:4px;background:#27272a;border-radius:4px;margin:4px 0 8px"><div id="xb" style="height:100%;width:0;background:#4ade80"></div></div>' +
    '<div class="w" id="xn" style="display:none">Your browser may ask to allow multiple downloads: choose <b>Allow</b>. Carrying on in <b id="xk"></b>s. <u id="xu" style="cursor:pointer">Continue now</u></div>' +
    '<div class="w" id="xw" style="display:none">Your browser blocks storage for this site, so Update will fetch the full history each time.</div>' +
    '<div style="display:flex;gap:6px;margin-top:8px">' + [['U', 'Update'], ['F', 'Full history'], ['C', 'Custom']].map(function (m) { return '<button id="xm' + m[0] + '">' + m[1] + '</button>'; }).join('') + '<button id="xg" style="margin-left:auto;padding:0 18px">Start</button></div>';
  document.body.appendChild(box);

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
  ['U', 'F', 'C'].forEach(function (m) { q('xm' + m).onclick = function () { if (!busy) { mode = m; render(); } }; });
  q('xf').oninput = function () { if (!busy) { cf = this.value; render(); } };
  q('xt').oninput = function () { if (!busy) { ct = this.value; render(); } };
  var skip = 0;
  q('xu').onclick = function () { skip = 1; };
  q('xx').onclick = function () { stop = 1; window.alert = realAlert; box.remove(); };

  var alerts = [];
  var realAlert = window.alert;
  var rows = function () { return document.querySelectorAll('#historytotalindex tr'); };
  var first = function () { var r = rows(); return r.length > 1 ? r[1].textContent : ''; };
  var newest = function () {
    var r = rows();
    var c = r.length > 1 && r[1].children[0];
    if (!c) return null;
    var p = c.textContent.trim().split(' ');
    var d = new Date(+p[2], MON.indexOf(p[1]), +p[0]);
    return isNaN(d) ? null : d;
  };
  var wait = async function (test, ms) {
    var t0 = Date.now();
    while (Date.now() - t0 < ms && !stop) {
      var v = test();
      if (v) return v;
      await pause(250);
    }
    return null;
  };

  q('xg').onclick = async function () {
    if (busy) return;
    var r = render();
    if (!r.n) { q('xs').textContent = 'Nothing to download for this choice.'; return; }
    busy = 1;
    stop = 0;
    var saved = 0;
    var done = 0;
    var say = function (t) { q('xs').textContent = t; };
    var gentle = function (a, b) { return pause(saved >= FAST ? a + Math.random() * (b - a) : 250); };
    window.alert = function (m) { alerts.push(String(m)); };
    try {
      say('Opening the page\'s Total Returns section...');
      document.querySelector('li.form5').click();
      await pause(1200);
      $('#ddlHistoricalreturntypee').val('Equity').trigger('change');
      if (!(await wait(function () { return $('#ddlHistoricalreturntypeeSubindex option').length > 1; }, 10000))) throw new Error('the page did not list index groups');
      $('#ddlHistoricalreturntypeeSubindex').val('Broad Market Indices').trigger('change');
      if (!(await wait(function () { return $('#ddlHistoricalreturntypeeindex option').length > 1; }, 10000))) throw new Error('the page did not list indexes');
      var todo = r.p.filter(function (p) { return p && p.w.length; });
      for (var i = 0; i < todo.length && !stop; i++) {
        var p = todo[i];
        if (!$('#ddlHistoricalreturntypeeindex option').filter(function () { return this.value === p.n; }).length) { done += p.w.length; continue; }
        $('#ddlHistoricalreturntypeeindex').val(p.n).trigger('change');
        await gentle(800, 1500);
        for (var k = 0; k < p.w.length && !stop; k++) {
          var w = p.w[k];
          say(p.l + ' (' + (i + 1) + '/' + todo.length + '), file ' + (k + 1) + '/' + p.w.length + ': ' + nice(w[0]) + ' to ' + nice(w[1]));
          var before = first();
          $('#datepickerFromtotalindex').datepicker('setDate', w[0]);
          $('#datepickerTototalindex').datepicker('setDate', w[1]);
          await gentle(600, 1400);
          alerts = [];
          document.getElementById('submit_totalindexhistorical').click();
          var got = await wait(function () { return alerts.length || (first() && first() !== before); }, 20000);
          if (alerts.length) throw new Error(alerts[0]);
          if (got) {
            await gentle(500, 1200);
            var e = iso(newest() || w[1]);
            document.getElementById('exportTotalindex').click();
            saved++;
            if (!mem[p.n] || e > mem[p.n])) { mem[p.n] = e; save(); }
            if (!(i === todo.length - 1 && k === p.w.length - 1)) {
              if (saved === FAST) {
                q('xn').style.display = 'block';
                skip = 0;
                for (var s = WAIT; s > 0 && !skip && !stop; s--) { q('xk').textContent = s; await pause(1000); }
                q('xn').style.display = 'none';
              } else if (saved > FAST) await pause(3500 + Math.random() * 3000);
            }
          }
          done++;
          q('xb').style.width = Math.round((100 * done) / r.n) + '%';
        }
      }
      say(stop ? 'Stopped.' : 'Done: ' + saved + ' files saved by your browser. Import them in Portfolio Engine.');
    } catch (e2) {
      say('Stopped: ' + e2.message);
    }
    window.alert = realAlert;
    busy = 0;
    render();
  };

  render();
})();
