/*
  Xfina bookmarklet: Yahoo Finance price history, made once and used again and again.

  Runs on finance.yahoo.com, on a ticker's own history page (/quote/<TICKER>/history/), in the shared panel (core.js:
  modes, memory, folder, states). Yahoo removed its Download button, so this does what a person now has to do by
  hand: it sets the page's own date range and frequency (Daily) through the page's address, the same one the page's
  own pickers produce, reads the table Yahoo renders, and saves it as a CSV, exactly the values shown, nothing
  reshaped. Dates go to Yahoo as UTC midnight, so a range starts on the day asked for, not the day before (Yahoo
  keys bars by the exchange's date). Nothing is sent to Xfina.

  One ticker per click: the one whose page is open, including tickers not in __STARTS__ (their row then reads
  "earliest", and Full history asks Yahoo for everything from far back, as the page's own "Max" does). If the page
  isn't already at the range the panel plans, Start first reloads the page there (before any folder is asked for);
  the mode and dates are kept for the tab, so the next click on the bookmark, once loaded, reopens the panel as it
  was, and Start then reads and saves.

  Parameter, filled in when the bookmark is generated (bookmarklet.js): __STARTS__, JSON, {"VOO": "2010-09-09", ...}:
  the earliest date Yahoo's table returns for each ticker in Xfina's catalogue (the first is also the page a click
  elsewhere opens). Memory is keyed by ticker, under the earlier stand-alone version's key (xfina.yahooFinance.v1).
  If the page changes, this is the one file to fix.
*/
(function () {
  XFINA_CORE;
  var STARTS = JSON.parse('__STARTS__');
  var FLOOR = '-3000000000';
  var MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  var m = location.hostname === 'finance.yahoo.com' && location.pathname.match(/\/quote\/([^/]+)\/history/i);
  var T = m ? decodeURIComponent(m[1]) : Object.keys(STARTS)[0] || 'VOO';
  var epoch = function (d) { return String(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 1000); };
  var day = function (d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); };
  var parseShown = function (s) { var p = s.replace(',', '').split(' '); return new Date(+p[2], MON.indexOf(p[0]), +p[1]); };
  var csvCell = function (s) { s = String(s); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  var want = function (it, w) {
    return { p1: it.from || w[0] > new Date(1900, 0, 1) ? epoch(w[0]) : FLOOR, p2: epoch(day(w[1], 1)) };
  };

  xfinaPanel({
    title: 'Yahoo Finance',
    key: 'xfina.yahooFinance.v1',
    url: 'https://finance.yahoo.com/quote/' + encodeURIComponent(T) + '/history/',
    page: 'the ' + T + ' history page',
    here: function () { return !!m; },
    ready: function () { return !!document.querySelector('table'); },
    years: 0,
    items: [{ id: T, code: T, name: T, from: STARTS[T] || null }],
    moving: 'loading this range on the page. Click the Xfina bookmark again once it has loaded, then press Start.',
    check: function (it, w) {
      var p = want(it, w);
      var qs = new URLSearchParams(location.search);
      var ok = qs.get('period1') === p.p1 && qs.get('frequency') === '1d' && Math.abs(+qs.get('period2') - +p.p2) <= 172800;
      if (ok) return null;
      qs.set('period1', p.p1);
      qs.set('period2', p.p2);
      qs.set('frequency', '1d');
      return location.pathname + '?' + qs.toString();
    },
    fetch: async function (it, w, c) {
      var table = await c.look('table', 'the price table');
      var head = [].map.call(table.querySelectorAll('thead th'), function (th) { return th.textContent.replace(/\s{2,}.*/, '').trim(); });
      var rows = [head];
      [].forEach.call(table.querySelectorAll('tbody tr'), function (tr) {
        var cells = tr.querySelectorAll('td');
        if (cells.length) rows.push([].map.call(cells, function (td) { return td.textContent.trim(); }));
      });
      if (rows.length < 2) return null;
      var newest = rows[1][0];
      var oldest = rows[rows.length - 1][0];
      await c.save(T + '_' + oldest.replace(/[, ]+/g, '-') + '_to_' + newest.replace(/[, ]+/g, '-') + '.csv', rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n');
      var d = parseShown(newest);
      return isNaN(d) ? w[1] : d;
    }
  });
})();
