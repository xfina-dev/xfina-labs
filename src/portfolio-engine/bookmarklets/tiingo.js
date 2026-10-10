/*
  Xfina bookmarklet: Tiingo daily prices, for US-listed funds with no issuer download (QQQ, VOO, SPY, BNDW, SGOL)
  and US index mutual funds (VFINX and others). Made once, used again and again.

  Runs on www.tiingo.com, in the shared panel (core.js: modes, memory, folder, states). Tiingo's API is its free
  product for anyone with an account: each user's own token, personal use. The API refuses calls from other
  websites, but answers a page on tiingo.com itself, so this asks it from there (checked live 2026-10-02: a call
  from www.tiingo.com with the token in the Authorization header returns the CSV). No page is clicked; there is
  nothing to show but the panel.

  The token is asked for once, with the browser's own prompt, and kept in this browser's storage for tiingo.com
  only (xfina.tiingo.token). It is sent only to Tiingo, in a header, never in an address, so it stays out of the
  browser's history. If Tiingo refuses it, it is forgotten and asked for again on the next click.

  One file per fund for any range (years 0), Tiingo's own CSV unchanged: date, close, high, low, open, volume,
  adjClose, adjHigh, adjLow, adjOpen, adjVolume, divCash, splitFactor. Named <TICKER>_<first>_to_<last>.tiingo.csv
  by the dates it actually holds. The free plan allows about 50 requests an hour, so the usual pause between files
  is kept.

  Parameter, filled in when the bookmark is generated (bookmarklets.js): __TICKERS__, JSON,
  [["qqq", "Invesco QQQ Trust", "1999-03-10"], ...]: Tiingo's ticker, a label, the first date to ask for.
  If Tiingo changes its API, this is the one file to fix.
*/
(function () {
  XFINA_CORE;
  var TOKEN = 'xfina.tiingo.token';
  var token = function () {
    var t = null;
    try { t = localStorage.getItem(TOKEN); } catch (e) { }
    if (!t) {
      t = (prompt('Your Tiingo API token (signed in on tiingo.com: Account, API, Token). It is kept in this browser only, for tiingo.com, and sent only to Tiingo.') || '').trim();
      if (!t) throw new Error('no Tiingo token was given, so nothing was fetched');
      try { localStorage.setItem(TOKEN, t); } catch (e) { }
    }
    return t;
  };
  var forget = function () { try { localStorage.removeItem(TOKEN); } catch (e) { } };
  var iso = function (d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); };
  var parse = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };

  xfinaPanel({
    title: 'Tiingo',
    key: 'xfina.tiingo.v1',
    url: 'https://www.tiingo.com/',
    page: 'Tiingo',
    here: function () { return location.hostname === 'www.tiingo.com'; },
    ready: function () { return true; },
    years: 0,
    items: JSON.parse('__TICKERS__').map(function (x) { return { id: x[0], code: x[0].toUpperCase(), name: x[1], from: x[2] }; }),
    prepare: async function () { token(); },
    fetch: async function (it, w, c) {
      var q = 'startDate=' + iso(w[0]) + '&endDate=' + iso(w[1]) + '&format=csv';
      var r = await fetch('https://api.tiingo.com/tiingo/daily/' + encodeURIComponent(it.id) + '/prices?' + q, { headers: { Authorization: 'Token ' + token() } });
      if (r.status === 401 || r.status === 403) { forget(); throw new Error('Tiingo refused the API token, so it was forgotten. Click the bookmark again to enter it'); }
      var text = await r.text();
      if (r.status === 404) c.skip('not on Tiingo');
      if (!r.ok) throw new Error('Tiingo answered ' + r.status + ': ' + text.slice(0, 120));
      if (!/^date,/.test(text)) throw new Error('Tiingo sent something other than a CSV: ' + text.slice(0, 120));
      var rows = text.trim().split(/\r?\n/);
      if (rows.length < 2) { await c.nap(); return null; }
      var first = rows[1].slice(0, 10);
      var last = rows[rows.length - 1].slice(0, 10);
      await c.save(it.code + '_' + first + '_to_' + last + '.tiingo.csv', text);
      await c.nap();
      return parse(last);
    }
  });
})();
