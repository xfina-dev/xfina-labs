/*
  Xfina bookmarklet: WSJ historical prices, for the exchange-listed gold funds with no issuer download (ZGLDUS on
  SIX, SGLD on London, PHYS). Made once, used again and again.

  Runs on www.wsj.com, in the shared panel (core.js: modes, memory, folder, states). For each fund it asks WSJ for
  the same spreadsheet the fund's own Historical Prices page downloads once its date picker is set: from the
  window's start to its end (launch to today for Full history, the day after the last saved date for Update).
  The page's own picker allows the full range in one request (checked for QQQ from 1991, 2026-09-30), so this
  is one file per fund (years 0), at a person's pace. No page is clicked; there is nothing to show but the panel.

  WSJ names every download HistoricalPrices.csv and the file holds no ticker, so this saves it under the fund's
  ticker and the dates it actually holds: <TICKER>_<first>_to_<last>.wsj.csv, WSJ's CSV unchanged (Date, Open,
  High, Low, Close, Volume, newest first, dates MM/DD/YY, price only). If WSJ answers with anything but a CSV
  (a sign-in or bot-check page), the run stops and says so instead of saving it.

  Parameter, filled in when the bookmark is generated (bookmarklets.js): __FUNDS__, JSON,
  [["etf/UK/XLON/SGLD", "SGLD", "Invesco Physical Gold ETC", "2009-08-19"], ...]: WSJ's own path for the fund, its
  ticker, a label, the first date to ask for. If WSJ changes its pages, this is the one file to fix.
*/
(function () {
  XFINA_CORE;
  var two = function (n) { return ('0' + n).slice(-2); };
  var mdy = function (d) { return two(d.getMonth() + 1) + '/' + two(d.getDate()) + '/' + d.getFullYear(); };
  var iso = function (d) { return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()); };
  var parse = function (s) { var p = s.trim().split('/'); var y = +p[2]; return new Date(y < 100 ? (y < 50 ? 2000 + y : 1900 + y) : y, +p[0] - 1, +p[1]); };

  xfinaPanel({
    title: 'WSJ',
    key: 'xfina.wsj.v1',
    url: 'https://www.wsj.com/market-data',
    page: 'WSJ Markets',
    here: function () { return location.hostname === 'www.wsj.com'; },
    ready: function () { return true; },
    years: 0,
    items: JSON.parse('__FUNDS__').map(function (x) { return { id: x[1], path: x[0], code: x[1], name: x[2], from: x[3] }; }),
    fetch: async function (it, w, c) {
      var days = Math.round((w[1] - w[0]) / 864e5) + 1;
      var q = 'MOD_VIEW=page&num_rows=' + days + '&range_days=' + days + '&startDate=' + mdy(w[0]) + '&endDate=' + mdy(w[1]);
      var r = await fetch('/market-data/quotes/' + it.path + '/historical-prices/download?' + q, { credentials: 'include' });
      var text = await r.text();
      if (r.status === 404) c.skip('not found on WSJ');
      if (!r.ok) throw new Error('WSJ answered ' + r.status + ' for ' + it.code);
      if (!/^\s*Date\s*,/.test(text)) throw new Error('WSJ sent a page instead of the spreadsheet for ' + it.code + ' (perhaps a sign-in or robot check). Open the fund\'s Historical Prices page once, then Resume');
      var rows = text.trim().split(/\r?\n/).slice(1).filter(function (l) { return /^\s*\d/.test(l); });
      if (!rows.length) { await c.nap(); return null; }
      var dates = rows.map(function (l) { return parse(l.split(',')[0]); }).sort(function (a, b) { return a - b; });
      await c.save(it.code + '_' + iso(dates[0]) + '_to_' + iso(dates[dates.length - 1]) + '.wsj.csv', text);
      await c.nap();
      return dates[dates.length - 1];
    }
  });
})();
